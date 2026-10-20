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
import { pickChoice, amountInAnswer, isAmountAnswer } from './answer.js';
import { readEmail, readPhone, readInternationalPhone, readIdentifier } from './contact.js';
import { readSpokenMoney } from './spoken-money.js';
import {readMoneyAmount,moneyIntentAllows} from './money.js';
import { pickProviderQuestion } from './form-sources.js';

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

/**
 * One input's reading of the answer: { value, evidence } or null. `evidence` is what the answer spent on it (digits
 * or words), so two inputs that claim the same part of the answer are told apart from a compound answer.
 */
export function readInputProfile(profile, answer, isCurrent = true) {
   const raw = unescape(answer);
   const kind = profile && profile.kind;
   if (kind === 'choice') {
      const choices = (Array.isArray(profile.choices) ? profile.choices : []).filter(c=>isCurrent||c.current_only!==true).map(c=>({...c,
         numericWords:(c.words || []).filter(word=>/^\d{2,}$/.test(String(word).trim())),
         words:(c.words||[]).concat(isCurrent ? c.keys || [] : []).filter(word=>!(isAmountAnswer(raw)&&/^\d+$/.test(String(word).trim()))&&(isCurrent||profile.numeric_values===true||!/^[\d*#]$/.test(String(word).trim())))}));
      // Semantic numeric values may arrive in ASR groups ("95 52"), unlike menu keys.
      // Keep choice policy in pickChoice and source evidence in the original utterance.
      const runs=digitRuns(raw),joined=raw.replace(/\d(?:[\s.-]?\d)*/g,run=>' '+run.replace(/\D/g,'')+' ');
      const numericSpans=c=>{
         if(isAmountAnswer(raw))return [];
         const words=c.numericWords.filter(word=>runs.includes(String(word).trim()));
         if(!words.length||pickChoice(joined,[{...c,words}],false)!==c.key)return [];
         return words.flatMap(word=>numberSpans(raw,String(word).trim()).filter(([a,b])=>raw.slice(a,b).replace(/\D/g,'')===String(word).trim()));
      };
      const base = pickChoice(raw, choices, false);
      const negative = c => ['no','decline','done','cancel'].includes(c.key) || c.negative === true;
      const picked = choices.find(c => c.key === base);
      const pool = picked && negative(picked) ? [picked] : choices.filter(c => !negative(c));
      let readings = pool.filter(c => pickChoice(raw, [c], false) === c.key || numericSpans(c).length).map(c => {
         const words = (c.words || []).filter(w => matchesChoice(raw,[w]));
         const spans = [...choiceSpans(raw,words),...numericSpans(c)].filter((span,index,all)=>all.findIndex(other=>other[0]===span[0]&&other[1]===span[1])===index);
         return { value:c.key, ...(isCurrent && (c.keys || []).length && !isAmountAnswer(raw) && pickChoice(raw,[{key:c.key,words:c.keys,exact:true}],false)===c.key ? {keypad:true} : {}), spans:spans.length?spans:[[0,raw.length]], option_label:c.label || (c.words || []).find(w=>!/^\d+$/.test(w)) || c.key, option_label_es:c.label_es || c.label || c.key };
      });
      // A more specific declared phrase can cover a shorter phrase of the same field's other option.
      readings = readings.filter(r => !readings.some(other => other !== r && r.spans.every(([a,b]) => other.spans.some(([c,d]) => c <= a && d >= b && (c<a || d>b)))));
      if (readings.length > 1) return { alternatives:readings };
      if (readings.length === 1) { const { option_label,option_label_es,...one } = readings[0]; return one; }
      return isCurrent&&profile.accept_other===true&&raw.trim()?{value:raw.trim(),spans:[[0,raw.length]]}:null;
   } else if (kind === 'amount') {
      const money=profile.money;
      const read=money?text=>readMoneyAmount(text,money):amountInAnswer;
      const refused=!!money&&money.intent==='payment'&&!moneyIntentAllows(raw,'payment');
      // A refusal is an uncommittable validation candidate, never a numeric correction. A declared
      // validator may route it to recovery; the common batch always withholds acceptance.
      if(refused)return Number.isFinite(readMoneyAmount(raw,{...money,intent:undefined}))?{value:raw,refused:true,spans:[[0,raw.length]],evidence:['money-intent']}:null;
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
      const e = readEmail(raw);
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
   const own = Array.isArray(cur.names) ? undefined : list.filter(isCur)[0];   // a group has no single own choice list
   // A form's scope level: 0 for the current input's form, then each further form in the order the chain lists them.
   const forms = [];
   if (own) {
      forms.push(own.scope || own.form);
   } else {
      // the current input is not among the candidates (it no longer applies): levels follow the list order
   }
   list.forEach((c) => { if (forms.indexOf(c.scope || c.form) === -1) { forms.push(c.scope || c.form); } else { /* already ranked */ } });
   const readings = [];
   for (const c of list) {
      let r = readInputProfile(c.profile, raw, isCur(c));
      // A semantic choice supplied by ask-choice (e.g. spoken keypad keys) is a reading, not an early return.
      if (!r && c === own && choiceKey && c.profile.kind === 'choice' && (c.profile.choices || []).some(x => x.key === choiceKey)) {
         r = { ...(r || {}), value: choiceKey, spans: r?.spans?.length ? r.spans : [[0, raw.length]] };
      }
      if (r) {
         for (const option of r.alternatives || [r]) {
            readings.push({ form:c.form, name:c.name, value:option.value, ...(option.refused===true?{refused:true}:{}), known:c.value !== undefined && c.value !== null && String(c.value) === String(option.value), spans:option.spans, keypad:option.keypad === true, fallback:option.fallback === true,
               ...(r.alternatives ? { option_label:option.option_label, option_label_es:option.option_label_es } : {}), group:c.group, exclusive:c.exclusive===true, level:forms.indexOf(c.scope || c.form), current:isCur(c), confirm:Array.isArray(c.confirm_against)?c.confirm_against:[] });
         }
      }
   }

   // Readings that spent the same evidence form a group (connected components).
   const conflicts = (a, b) => a.form === b.form && (a.name === b.name && a.value !== b.value || a.exclusive && b.exclusive && a.group && a.group===b.group && a.name!==b.name) || (a.spans || []).some(([s,e]) => (b.spans || []).some(([t,u]) => s < u && t < e));
   const parent = readings.map((_, i) => i);
   const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
   for (let i = 0; i < readings.length; i++) {
      for (let j = i + 1; j < readings.length; j++) {
         if (conflicts(readings[i], readings[j])) {
            parent[find(i)] = find(j);
         } else {
            // distinct parts of the answer
         }
      }
   }
   const groups = {};
   readings.forEach((r, i) => { (groups[find(i)] = groups[find(i)] || []).push(r); });
   const strip = ({ evidence, spans, keypad, fallback, level, group, exclusive, current: c, confirm, ...r }) => r;
   const paired = (a, b) => a.confirm.indexOf(b.name) > -1 || b.confirm.indexOf(a.name) > -1;
   const hits = [];
   let ambiguous = [];
   const remaining=[];
   for (const group of Object.values(groups)) {
      // Free text is a fallback; a specific claim to the same source evidence is stronger.
      const specific = group.filter(m => !m.fallback);
      const members = specific.length ? specific.concat(group.filter(m=>m.fallback&&specific.some(s=>paired(m,s)))) : group;
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
         hits.push(strip(asked[0]));
      } else if (ambiguous.length === 0) {
         ambiguous = asked.map(strip);
      } else {
         remaining.push(asked.map(strip));
      }
   }
   return { hits, ambiguous, ...(remaining.length ? {remaining} : {}) };
}
