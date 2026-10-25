/**
 * Which of a FORM's inputs an answer fills (APPROVED_FUNCTIONS matchInputs), for the system collect-input worker
 * (owner direction 2026-10-19, the FORM convention in the jsfe-flow-designer skill). A caller may answer out of order,
 * fill several inputs at once, or say something that fits two inputs; this reads the answer against every candidate
 * input's declared shape and says which, never guessing between two: an answer whose words fit two inputs is
 * returned as ambiguous, and the flow asks.
 *
 * Tenant-agnostic shape reading only (the same class as pickChoice / readIdentifier). Conversation behaviour stays in
 * the flows. Part of jsfe/helpers; imports only siblings.
 */
import { matchesChoice } from './matches-choice.js';
import { pickChoice, amountInAnswer, isAmountAnswer, ANSWER_WORDS, CONFIRM_WORDS } from './answer.js';
import { readEmail, readPhone, readInternationalPhone, readIdentifier } from './contact.js';
import { readSpokenMoney } from './spoken-money.js';
import {readMoneyAmount,isPartialMoneyAnswer} from './money.js';
import { pickProviderQuestion } from './form-sources.js';

/**
 * This turn's acceptance decisions for the host to log, appended per match: fields filled out of order, in a compound
 * answer or as an invited input, and every refused reading, by form, field and rule. Field names and rules only, never
 * values: the answers include card numbers and codes. The host clears it at the start of a turn.
 */
export function formAcceptanceTrace(previous, matches) {
   const filled = (matches?.decisions || []).map((d) => ({ form: String(d.form).replace(/:\d+$/, ''), name: d.name, rule: d.rule }));
   const refused = (matches?.refused || []).map((r) => ({ form: String(r.form).replace(/:\d+$/, ''), name: r.name, rule: r.rule }));
   if (!filled.length && !refused.length) {
      return previous ?? null;
   } else {
      return { filled: [...(previous?.filled || []), ...filled], refused: [...(previous?.refused || []), ...refused] };
   }
}

/** The answer as said: jsfe stores user input escaped (don\'t). */
function unescape(answer) {
   return String(answer ?? '').replace(/\\(['"\\])/g, '$1');
}

/** Digit runs as said: spoken digits come apart ("4 3 2 1", "555-123-4567"), so single spaces / dashes / dots inside a run join it. */
function digitRuns(raw) {
   return (raw.match(/\d(?:[\s.-]?\d)*/g) || []).map((r) => r.replace(/\D/g, ''));
}

/** Source intervals let different readers recognize the same evidence without agreeing on its type. */
function numberSpans(raw, value, amount = false) {
   const runs = [...raw.matchAll(/\d(?:[\s.,-]?\d)*/g)];
   if (!amount) {
      const wanted = String(value).replace(/\D/g, '');
      return runs.filter(m => { const d = m[0].replace(/\D/g, ''); return d === wanted || d === '1' + wanted; })
         .map(m => [m.index, m.index + m[0].length]);
   }
   const spans = [];
   for (let i = 0; i < runs.length; i++) {
      for (let j = i; j < runs.length; j++) {
         const a = runs[i].index, b = runs[j].index + runs[j][0].length;
         // Include adjacent currency words for cents and dollars-and-cents readings.
         const tail = (raw.slice(b).match(/^\s*(?:cents?|centavos?|dollars?|d[oó]lares?|pesos?|bucks?)\b/i) || [''])[0];
         if (amountInAnswer(raw.slice(a, b) + tail) === Number(value)) { spans.push([a, b + tail.length]); break; }
      }
   }
   return spans.filter(([a,b]) => !spans.some(([c,d]) => c >= a && d <= b && (c > a || d < b)));
}
function choiceSpans(raw, words) {
   const tokens = [...raw.matchAll(/[\p{L}\p{N}*#]+/gu)];
   const spans = [];
   for (const word of words) {
      const n = (String(word).match(/[\p{L}\p{N}*#]+/gu) || []).length;
      for (let i = 0; n && i + n <= tokens.length; i++) {
         const a = tokens[i].index, b = tokens[i+n-1].index + tokens[i+n-1][0].length;
         if (matchesChoice(raw.slice(a,b), [word])) spans.push([a,b]);
      }
   }
   return spans;
}
function emailSpans(raw, value) {
   const literal = raw.toLowerCase().indexOf(value);
   if (literal >= 0) return [[literal, literal + value.length]];
   // Spoken addresses may use at / arroba / dot / punto. Select the shortest source window yielding this address.
   const tokens = [...raw.matchAll(/\S+/g)];
   if (tokens.length > 128) return [[0,raw.length]];
   for (let size = 1; size <= tokens.length; size++) {
      const spans = [];
      for (let i = 0; i + size <= tokens.length; i++) {
         const a = tokens[i].index, b = tokens[i+size-1].index + tokens[i+size-1][0].length;
         if (readEmail(raw.slice(a,b)) === value) spans.push([a,b]);
      }
      if (spans.length) return spans;
   }
   return [[0,raw.length]];
}

/** Remove independently spent evidence while leaving the original narrative value intact. */
function unclaimedSpans(raw, readings) {
   let spans = [[0, raw.length]];
   for (const [start, end] of readings.flatMap(reading => reading.spans || [])) {
      spans = spans.flatMap(([a, b]) => end <= a || start >= b ? [[a, b]] : [[a, Math.max(a, start)], [Math.min(b, end), b]].filter(([a, b]) => b > a));
   }
   return spans;
}

/**
 * One input's reading of the answer: { value, evidence } or null. `evidence` is what the answer spent on it (digits
 * or words), so two inputs that claim the same part of the answer are told apart from a compound answer.
 */
export function readInputProfile(profile, answer, isCurrent = true) {
   const raw = unescape(answer);
   // A field may declare a narrower signature for out-of-order reading: the payment card takes a bare
   // last four when asked, but out of order only a card word or "ending in 4242".
   if (!isCurrent && profile && profile.out_of_order && typeof profile.out_of_order === 'object') {
      const { out_of_order, ...asked } = profile;
      return readInputProfile({ ...asked, ...out_of_order }, answer, isCurrent);
   } else {
      // asked, or no out-of-order signature
   }
   const kind = profile && profile.kind;
   if (kind === 'choice') {
      const choices = (Array.isArray(profile.choices) ? profile.choices : []).filter(c=>isCurrent||c.current_only!==true).map(c=>({...c,
         numericWords:(c.phrases ?? c.words ?? []).filter(word=>/^\d{2,}$/.test(String(word).trim())),
         phrases:(c.phrases??c.words??[]).concat(isCurrent ? c.keys || [] : []).filter(word=>!(isAmountAnswer(raw)&&/^\d+$/.test(String(word).trim()))&&(isCurrent||profile.numeric_values===true||!/^[\d*#]$/.test(String(word).trim())))}));
      // Semantic numeric values may arrive in ASR groups ("95 52"), unlike menu keys.
      // Keep choice policy in pickChoice and source evidence in the original utterance.
      const runs=digitRuns(raw),joined=raw.replace(/\d(?:[\s.-]?\d)*/g,run=>' '+run.replace(/\D/g,'')+' ');
      const numericSpans=c=>{
         if(isAmountAnswer(raw))return [];
         const words=c.numericWords.filter(word=>runs.includes(String(word).trim()));
         if(!words.length||pickChoice(joined,[{...c,phrases:words}],false)!==c.key)return [];
         return words.flatMap(word=>numberSpans(raw,String(word).trim()).filter(([a,b])=>raw.slice(a,b).replace(/\D/g,'')===String(word).trim()));
      };
      const base = pickChoice(raw, choices, false);
      const negative = c => ['no','decline','done','cancel'].includes(c.key) || c.negative === true;
      const picked = choices.find(c => c.key === base);
      const pool = picked && negative(picked) ? [picked] : choices.filter(c => !negative(c));
      let readings = pool.filter(c => pickChoice(raw, [c], false) === c.key || numericSpans(c).length).map(c => {
         const words = (c.phrases ?? c.words ?? []).filter(w => matchesChoice(raw,[w]));
         const spans = [...choiceSpans(raw,words),...numericSpans(c)].filter((span,index,all)=>all.findIndex(other=>other[0]===span[0]&&other[1]===span[1])===index);
         return { value:c.key, ...(isCurrent && (c.keys || []).length && !isAmountAnswer(raw) && pickChoice(raw,[{key:c.key,phrases:c.keys,exact:true}],false)===c.key ? {keypad:true} : {}), spans:spans.length?spans:[[0,raw.length]], option_label:c.label || (c.phrases ?? c.words ?? []).find(w=>!/^\d+$/.test(w)) || c.key, option_label_es:c.label_es || c.label || (c.phrases ?? c.words ?? []).find(w=>!/^\d+$/.test(w)) || c.key };
      });
      // A more specific declared phrase can cover a shorter phrase of the same field's other option.
      readings = readings.filter(r => !readings.some(other => other !== r && r.spans.every(([a,b]) => other.spans.some(([c,d]) => c <= a && d >= b && (c<a || d>b)))));
      if (readings.length > 1) return { alternatives:readings };
      if (readings.length === 1) { const { option_label,option_label_es,...one } = readings[0]; return one; }
      return isCurrent&&profile.accept_other===true&&raw.trim()?{value:raw.trim(),...(profile.narrative===true?{fallback:true}:{}),spans:[[0,raw.length]]}:null;
   } else if (kind === 'amount') {
      const money=profile.money;
      if(isPartialMoneyAnswer(raw))return {value:raw,incompleteMoney:true,spans:[[0,raw.length]],evidence:['partial-money']};
      const read=money?text=>readMoneyAmount(text,money):amountInAnswer;
      const n = (profile.marked === 'out_of_order' ? !isCurrent : profile.marked) ? (isAmountAnswer(raw) ? read(raw) : NaN) : read(raw);
      const inRange = !isNaN(n) && (profile.min === undefined || n >= Number(profile.min)) && (profile.max === undefined || n <= Number(profile.max));
      if (inRange) {
         // the digits it was read from: the runs that start with its whole-dollar part ("82.50" said as "82 50" → 8250)
         const runs = digitRuns(raw).filter((d) => d.indexOf(String(Math.trunc(n))) === 0);
         return { value: String(n), spans: [...numberSpans(raw, n, true),...(money?.cardinals?readSpokenMoney(raw).filter(reading=>reading.value===n).map(reading=>[reading.start,reading.end]):[])], evidence: runs.length ? runs.map((d) => `d:${d}`) : ['amount'] };
      } else {
         return null;
      }
   } else if (kind === 'email') {
      const e = readEmail(raw, {literal:profile.literal===true});
      if (e) {
         return { value: e, spans: emailSpans(raw, e), evidence: [`e:${e}`] };
      } else {
         return null;
      }
   } else if (kind === 'phone') {
      const p = readPhone(raw) || readInternationalPhone(raw);
      if (p) {
         return { value: p, spans: numberSpans(raw, p), evidence: [`d:${String(p).replace(/\D/g, '')}`] };
      } else {
         return null;
      }
   } else if (kind === 'identifier') {
      const id = readIdentifier(raw, profile.pattern || '');
      if (id && id.kind === 'account') {
         return { value: id.value, spans: numberSpans(raw, id.value), evidence: [`d:${id.value}`] };
      } else {
         return null;
      }
   } else if (kind === 'digits') {
      const min = Number(profile.min || 1);
      const max = Number(profile.max || min);
      const fits = [...new Set(digitRuns(raw).filter((d) => d.length >= min && d.length <= max))];
      if (fits.length === 1) {
         return { value: fits[0], spans: numberSpans(raw, fits[0]), evidence: [`d:${fits[0]}`] };
      } else {
         return null;   // none, or two different numbers of that length: not this input's answer by shape alone
      }
   } else if (kind === 'pattern') {
      let m = null;
      try {
         m = new RegExp(profile.regex, profile.flags || 'i').exec(raw);
      } catch {
         m = null;   // an invalid pattern in a spec reads nothing
      }
      if (m) {
         const v = m[profile.group || 0] || m[0];
         return { value: v, spans: [[m.index + m[0].indexOf(v), m.index + m[0].indexOf(v) + v.length]], evidence: [`p:${String(v).toLowerCase()}`] };
      } else {
         return isCurrent&&profile.accept_other===true&&raw.trim()?{value:raw.trim(),fallback:true,spans:[[0,raw.length]]}:null;
      }
   } else if (kind === 'text') {
      const t = raw.trim();
      if (isCurrent && t) {
         return { value: t, fallback: true, spans: [[0,raw.length]], evidence: ['text'] };
      } else {
         return null;   // free text fills only the input that was asked, or every answer would fit it
      }
   } else {
      return null;   // an unknown kind (e.g. 'date' before its reader exists) reads nothing
   }
}

/**
 * candidates: [{ form, name, profile, value?, confirm_against? }] — the inputs of the form chain that apply now (`when`
 * holds): the current form's first, then its parent's, and so on up. `value` is what is already stored for it.
 * current: { form, name } of the input that was asked, or { form, names } when the asked input is one of several
 * (an any_of group: phone, email or account number); every member counts as the current input. choiceKey: the key
 * ask-choice picked from the current input's own choices, if any.
 *
 * Readings that claim DIFFERENT parts of the answer are all taken (a compound answer fills several inputs). Readings
 * that claim the SAME part are settled by scope (owner decision 2026-10-19, A):
 *   1. the current input takes it;
 *   2. else the one input of the current form that fits takes it, and parent forms are not considered;
 *   3. else the same test one form up, and so on;
 *   4. two inputs at the nearest form that fits are ambiguous: asked, never ranked.
 * Exception: an input that declares `confirm_against: [names]` is asked about together with those inputs whenever both
 * fit the same words, wherever scope would have put it ('62' at the payment offer: $62 or sub-account 62, prod
 * 2026-10-19 07:38).
 *
 * Returns { hits, ambiguous }:
 *   hits      — what the answer fills, each { form, name, value, known } (`known`: equals the stored value);
 *   ambiguous — the readings to ask about (the first such group), or empty.
 */
/** Explicit information questions are a separate answer kind, so their topic is not accepted as a field value.
 * A question clause is consumed as a question; independently separated clauses remain available for collection. */
export function readFormAnswer(answer,candidates,current,choiceKey,questions=[]) {
   const raw=unescape(answer),parts=raw.split(/([?;\n]|\b(?:and|y)\b)/i),asked=[];
   let consumed=false;
   const remaining=parts.map(part=>{
      const text=part.trim();
      if(!/^[¿\s]*(?:how\b|what\b|when\b|where\b|which\b|why\b|who\b|cu[aá]nt[oa]s?\b|cu[aá]l(?:es)?\b|qu[eé](?=$|[^\p{L}\p{N}_])|cu[aá]ndo\b|d[oó]nde\b|c[oó]mo\b|(?:can|could) you (?:tell|show)\b|(?:i (?:want|would like) to know|tell me|show me|quiero saber|quisiera saber|me gustar[ií]a saber|d[ií]game|dime|mu[eé]strame)\b)/iu.test(text))return part;
      const key=pickProviderQuestion(text,questions);
      if(!key||key.startsWith('__'))return part;
      consumed=true;asked.push(key);return ' '.repeat(part.length);
   }).join('');
   // Delimiters left by a consumed question are not a free-text field answer.
   const fieldText=consumed && !/[a-záéíóúüñ0-9]/i.test(remaining.replace(/\b(?:and|y)\b/gi,''))?'':remaining;
   const matches=matchInputs(consumed?fieldText:raw,candidates,current,consumed?'':choiceKey);
   const provenance=h=>({...h,raw,utterance:raw});
   return {...matches,hits:matches.hits.map(provenance),ambiguous:matches.ambiguous.map(provenance),remaining:(matches.remaining||[]).map(group=>group.map(provenance)),questions:[...new Set(asked)]};
}
export function matchInputs(answer, candidates, current, choiceKey) {
   const raw = unescape(answer);
   const list = Array.isArray(candidates) ? candidates.filter((c) => c && c.name && c.profile) : [];
   const cur = current && typeof current === 'object' ? current : {};
   const isCur = (c) => (Array.isArray(cur.names) ? cur.names.indexOf(c.name) > -1 : c.name === cur.name) && (cur.form === undefined || c.form === cur.form);
   const narrativeCurrent=list.some(field=>isCur(field) && ['text','choice'].includes(field.profile.kind) && field.profile.narrative===true);
   const own = Array.isArray(cur.names) ? undefined : list.filter(isCur)[0];   // a group has no single own choice list
   // A form's scope level: 0 for the current input's form, then each further form in the order the chain lists them.
   const forms = [];
   if (own) {
      forms.push(own.scope || own.form);
   } else {
      // the current input is not among the candidates (it no longer applies): levels follow the list order
   }
   list.forEach((c) => { if (forms.indexOf(c.scope || c.form) === -1) { forms.push(c.scope || c.form); } else { /* already ranked */ } });
   const fieldOf = (reading) => list.find((c) => c.form === reading.form && c.name === reading.name) || { profile: {} };
   const spanText = (reading) => (reading.spans || []).map(([a, b]) => raw.slice(a, b)).join(' ');
   const refused = [];
   let readings = [];
   for (const c of list) {
      // Rule 2: a confirmation is answered only when asked, firm by CONFIRM_WORDS, soft by the wider YES vocabulary.
      const confirmation = ['firm', 'soft'].includes(c.confirmation) ? c.confirmation : '';
      if (confirmation && !isCur(c)) {
         if (readInputProfile(c.profile, raw, false)) refused.push({ form: c.form, name: c.name, rule: 'confirmation_out_of_order' });
         continue;
      } else {
         // asked, or not a confirmation
      }
      const vocabulary = confirmation ? { ...c.profile, choices: (c.profile.choices || []).map((x) => x.key === 'yes' ? { ...x, phrases: [...(x.phrases ?? x.words ?? []), ...(confirmation === 'firm' ? CONFIRM_WORDS : ANSWER_WORDS.yes)], exact: confirmation === 'firm' || x.exact === true } : x.key === 'no' ? { ...x, phrases: [...(x.phrases ?? x.words ?? []), ...ANSWER_WORDS.no] } : x) } : c.profile;
      const profile=narrativeCurrent && vocabulary.kind==='email' ? {...vocabulary,literal:true} : vocabulary;
      let r = readInputProfile(profile, raw, isCur(c));
      // A semantic choice supplied by ask-choice (e.g. spoken keypad keys) is a reading, not an early return.
      if (!r && c === own && choiceKey && c.profile.kind === 'choice' && (c.profile.choices || []).some(x => x.key === choiceKey)) {
         r = { ...(r || {}), value: choiceKey, spans: r?.spans?.length ? r.spans : [[0, raw.length]] };
      }
      if (r) {
         for (const option of r.alternatives || [r]) {
            const known=c.value !== undefined && c.value !== null && String(c.value) === String(option.value);
            // A repeated choice may be the whole answer or only context in the requested field's answer.
            // Use the same whole-answer vocabulary as explicit choices, including courtesy and articles.
            const repeatedChoice=known && !isCur(c) && c.profile.kind==='choice';
            const isChoice=!isCur(c) && c.profile.kind==='choice';
            const wholeOptions=isChoice ? (c.profile.choices || []).filter(choice=>choice.key===option.value).map(choice=>({...choice,exact:true})) : [];
            const wholeChoice=isChoice && [raw,raw.replace(/\d(?:[\s.-]?\d)*/g,run=>run.replace(/\D/g,''))].some(text=>pickChoice(text,wholeOptions,false)===option.value);
            readings.push({ form:c.form, name:c.name, value:option.value, ...(option.refused===true?{refused:true}:{}), ...(option.incompleteMoney===true?{incompleteMoney:true}:{}), known, repeatedChoice, wholeChoice, choice:isChoice,  narrative:isCur(c) && ['text','choice'].includes(c.profile.kind) && c.profile.narrative===true, resetOn:Array.isArray(c.reset_on)?c.reset_on:[], spans:option.spans, keypad:option.keypad === true, fallback:option.fallback === true,
               ...(r.alternatives ? { option_label:option.option_label, option_label_es:option.option_label_es } : {}), group:c.group, exclusive:c.exclusive===true, level:forms.indexOf(c.scope || c.form), current:isCur(c), confirm:Array.isArray(c.confirm_against)?c.confirm_against:[] });
         }
      }
   }

   // Context-aware acceptance (docs/copilot-reference.md §5; owner 2026-10-25): the standard rules for every form.
   // The inputs the current question also asks for: its declared invites, or a read-back's (current names no input). An
   // invite names an input of the asking form or of a form enclosing it; the nearest such form wins by scope.
   const invitedNames = new Set([...list.filter(isCur).flatMap((c) => Array.isArray(c.invites) ? c.invites : []), ...(Array.isArray(cur.invites) ? cur.invites : [])]);
   const invited = (reading) => !reading.current && invitedNames.has(reading.name);
   // A declared confirm_against pair with the current question is relevant to it as well: the pair is asked about.
   const pairedWithCurrent = (reading) => list.some((c) => isCur(c) && c.form === reading.form && ((c.confirm_against || []).includes(reading.name) || (fieldOf(reading).confirm_against || []).includes(c.name)));
   const inOrder = (reading) => reading.current || invited(reading) || pairedWithCurrent(reading);
   // Rule 3: a number read out of order must be whole: every digit run its evidence touches lies entirely inside it,
   // so the last four of "88 91 7112" fill nothing.
   const runs = [...raw.matchAll(/\d(?:[\s.-]?\d)*/g)].map((m) => [m.index, m.index + m[0].length]);
   const wholeRuns = (reading) => runs.every(([a, b]) => !(reading.spans || []).some(([s, e]) => s < b && a < e) || (reading.spans || []).some(([s, e]) => s <= a && e >= b));
   // Rule 4: a bare number has no money mark and no word in its evidence.
   const bare = (reading) => !isAmountAnswer(raw) && (reading.spans || []).length > 0 && (reading.spans || []).every(([a, b]) => /\d/.test(raw.slice(a, b)) && !/\p{L}/u.test(raw.slice(a, b)));
   readings = readings.filter((reading) => {
      if (inOrder(reading)) {
         if (!reading.current) reading.rule = 'invited';   // the current input is the default: no rule recorded
         else { /* the current input */ }
         return true;
      } else if (bare(reading) && fieldOf(reading).profile.kind === 'amount') {
         refused.push({ form: reading.form, name: reading.name, value: reading.value, rule: 'bare_amount_out_of_order' });
         return false;
      } else if (/\d/.test(spanText(reading)) && !wholeRuns(reading)) {
         refused.push({ form: reading.form, name: reading.name, value: reading.value, rule: 'fragment' });
         return false;
      } else {
         reading.rule = 'out_of_order';
         return true;
      }
   });
   // Rule 4: a single digit the current question offers as a key is that key (the keypad reading wins its group below);
   // one it does not offer reaches the invited amount, whose own validation decides ("3 dollars?").

   const paired = (a, b) => a.confirm.indexOf(b.name) > -1 || b.confirm.indexOf(a.name) > -1;
   // Narrative ownership protects ancestor choices and same-form choices that reset
   // the requested field. Other sibling choices remain independent compound data. A current choice can carry narrative context too (e.g. a channel plus a
   // complaint). Preserve whole declared choices and confirmation pairs, and leave all
   // independently shaped non-choice fields available for compound collection.
   const owners=readings.filter(reading=>reading.current && reading.narrative);
   readings=readings.filter(reading=>!reading.choice || !owners.some(owner=>(reading.level>owner.level || reading.form===owner.form && owner.resetOn.includes(reading.name)) && !reading.wholeChoice && !paired(owner,reading)));
   const fieldConflict = (a,b) => a.form === b.form && (a.name === b.name && a.value !== b.value || a.exclusive && b.exclusive && a.group && a.group===b.group && a.name!==b.name);
   const overlap = (a,b) => (a.spans || []).some(([s,e]) => (b.spans || []).some(([t,u]) => s < u && t < e));
   const competes = (a,b) => fieldConflict(a,b) || overlap(a,b);
   // Resolve fallback ownership before grouping: a losing whole-answer text span cannot join
   // independent structured evidence into an ambiguity. Known contextual choice mentions do
   // not displace current text; whole-answer repetitions and explicit pairs still compete.
   const fallbacks=readings.filter(reading=>reading.fallback);
   // An opted-in narrative may provide both rationale and separately shaped fields. Only
   // unclaimed prose is its evidence: a bare number/address still fills the structured slot alone.
   for (const fallback of fallbacks.filter(reading=>reading.narrative)) {
      const structured=readings.filter(reading=>!reading.fallback);
      const prose=unclaimedSpans(raw,structured);
      if (prose.some(([a,b])=>/\p{L}/u.test(raw.slice(a,b)))) {
         const independent=structured.filter(reading=>(!reading.choice || reading.level===fallback.level && !reading.wholeChoice && !fallback.resetOn.includes(reading.name)) && !fieldConflict(fallback,reading) && !paired(fallback,reading));
         if (independent.length) fallback.spans=unclaimedSpans(raw,independent);
      }
   }
   const contextualChoice=(fallback,reading)=>!paired(fallback,reading) && !reading.wholeChoice && (reading.repeatedChoice || fallback.narrative && reading.choice && (reading.level>fallback.level || reading.form===fallback.form && fallback.resetOn.includes(reading.name)));
   const stronger=new Map(fallbacks.map(fallback=>[fallback,readings.filter(reading=>!reading.fallback && competes(fallback,reading) && !contextualChoice(fallback,reading))]));
   const keptFallbacks=fallbacks.filter(fallback=>!stronger.get(fallback).length || stronger.get(fallback).some(reading=>paired(fallback,reading)));
   const pairedFallbacks=new Set(keptFallbacks.filter(fallback=>stronger.get(fallback).length));
   const effective=readings.filter(reading=>reading.fallback ? keptFallbacks.includes(reading) : !keptFallbacks.some(fallback=>competes(fallback,reading) && contextualChoice(fallback,reading)));
   // A fallback retained for a declared pair must not bridge unrelated source spans either.
   const conflicts = (a,b) => fieldConflict(a,b) || overlap(a,b) && !(pairedFallbacks.has(a) && !b.fallback && !paired(a,b) || pairedFallbacks.has(b) && !a.fallback && !paired(a,b));

   // Readings that spent the same effective evidence form a group (connected components).
   const parent = effective.map((_, i) => i);
   const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
   for (let i = 0; i < effective.length; i++) {
      for (let j = i + 1; j < effective.length; j++) {
         if (conflicts(effective[i], effective[j])) {
            parent[find(i)] = find(j);
         } else {
            // distinct parts of the answer
         }
      }
   }
   const groups = {};
   effective.forEach((r, i) => { (groups[find(i)] = groups[find(i)] || []).push(r); });
   const strip = ({ evidence, spans, keypad, fallback, repeatedChoice, wholeChoice, choice, narrative, resetOn, level, group, exclusive, current: c, confirm, ...r }) => r;
   const hits = [];
   const taken = [];
   let ambiguous = [];
   const remaining=[];
   for (const group of Object.values(groups)) {
      const members = group;
      let winners;
      if (members.length === 1) {
         winners = members;
      } else if (members.some((m) => m.current && m.keypad)) {
         // Explicit menu keys select their current field, including a current any_of group.
         winners = members.filter((m) => m.current && m.keypad);
      } else if (members.some((m) => m.current)) {
         winners = members.filter((m) => m.current);
      } else {
         const nearest = Math.min(...members.map((m) => m.level));
         winners = members.filter((m) => m.level === nearest);
      }
      // a winner declared to be confirmed against another member is asked about together with it
      const confirmWith = winners.length === 1 ? members.filter((m) => m !== winners[0] && paired(m, winners[0])) : [];
      const asked = confirmWith.length ? winners.concat(confirmWith) : winners;
      if (asked.length === 1) {
         taken.push(asked[0]);
      } else if (ambiguous.length === 0) {
         ambiguous = asked.map(strip);
      } else {
         remaining.push(asked.map(strip));
      }
   }
   // Rule 5: one part of an answer never fills two fields. A reading that shares evidence with another taken reading is
   // refused with it, never kept by order.
   const clash = (a, b) => (a.spans || []).some(([s, e]) => (b.spans || []).some(([t, u]) => s < u && t < e));
   const kept = taken.filter((a) => !taken.some((b) => b !== a && clash(a, b)));
   for (const r of taken.filter((a) => !kept.includes(a))) refused.push({ form: r.form, name: r.name, value: r.value, rule: 'one_part_two_fields' });
   // Several fields from one answer: those filled out of order are a compound answer.
   if (kept.length > 1) kept.forEach((r) => { if (r.rule === 'out_of_order') r.rule = 'compound'; });
   hits.push(...kept.map(({ rule, ...r }) => strip(r)));
   // Why each field was filled other than as the current answer, kept beside the hits so their shape never changes.
   const decisions = kept.filter((r) => r.rule).map((r) => ({ form: r.form, name: r.name, rule: r.rule }));
   return { hits, ambiguous, ...(remaining.length ? {remaining} : {}), ...(refused.length ? {refused} : {}), ...(decisions.length ? {decisions} : {}) };
}
