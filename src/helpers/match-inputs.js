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

/** The answer as said: jsfe stores user input escaped (don\'t). */
function unescape(answer) {
   return String(answer ?? '').replace(/\\(['"\\])/g, '$1');
}

/** Digit runs as said: spoken digits come apart ("4 3 2 1", "555-123-4567"), so single spaces / dashes / dots inside a run join it. */
function digitRuns(raw) {
   return (raw.match(/\d(?:[\s.-]?\d)*/g) || []).map((r) => r.replace(/\D/g, ''));
}

/**
 * One input's reading of the answer: { value, evidence } or null. `evidence` is what the answer spent on it (digits
 * or words), so two inputs that claim the same part of the answer are told apart from a compound answer.
 */
function readProfile(profile, raw, isCurrent) {
   const kind = profile && profile.kind;
   if (kind === 'choice') {
      const choices = Array.isArray(profile.choices) ? profile.choices : [];
      const key = pickChoice(raw, choices, false);
      if (key && key.indexOf('__') !== 0) {
         const choice = choices.filter((c) => c && c.key === key)[0] || { words: [] };
         const words = (choice.words || []).filter((w) => matchesChoice(raw, [w]));
         // a number word is the same evidence as a number read by another input ('62' as a sub-account and as $62)
         return { value: key, evidence: words.map((w) => (/^[\d\s.-]+$/.test(String(w)) ? `d:${String(w).replace(/\D/g, '')}` : `w:${String(w).toLowerCase()}`)) };
      } else {
         return null;   // no choice, or an AGENT / EXIT request (ask-choice owns those)
      }
   } else if (kind === 'amount') {
      const n = profile.marked ? (isAmountAnswer(raw) ? amountInAnswer(raw) : NaN) : amountInAnswer(raw);
      const inRange = !isNaN(n) && (profile.min === undefined || n >= Number(profile.min)) && (profile.max === undefined || n <= Number(profile.max));
      if (inRange) {
         // the digits it was read from: the runs that start with its whole-dollar part ("82.50" said as "82 50" → 8250)
         const runs = digitRuns(raw).filter((d) => d.indexOf(String(Math.trunc(n))) === 0);
         return { value: String(n), evidence: runs.length ? runs.map((d) => `d:${d}`) : ['amount'] };
      } else {
         return null;
      }
   } else if (kind === 'email') {
      const e = readEmail(raw);
      if (e) {
         return { value: e, evidence: [`e:${e}`] };
      } else {
         return null;
      }
   } else if (kind === 'phone') {
      const p = readPhone(raw) || readInternationalPhone(raw);
      if (p) {
         return { value: p, evidence: [`d:${String(p).replace(/\D/g, '')}`] };
      } else {
         return null;
      }
   } else if (kind === 'identifier') {
      const id = readIdentifier(raw, profile.pattern || '');
      if (id && id.kind === 'account') {
         return { value: id.value, evidence: [`d:${id.value}`] };
      } else {
         return null;
      }
   } else if (kind === 'digits') {
      const min = Number(profile.min || 1);
      const max = Number(profile.max || min);
      const fits = [...new Set(digitRuns(raw).filter((d) => d.length >= min && d.length <= max))];
      if (fits.length === 1) {
         return { value: fits[0], evidence: [`d:${fits[0]}`] };
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
         return { value: v, evidence: [`p:${String(v).toLowerCase()}`] };
      } else {
         return null;
      }
   } else if (kind === 'text') {
      const t = raw.trim();
      if (isCurrent && t) {
         return { value: t, evidence: ['text'] };
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
export function matchInputs(answer, candidates, current, choiceKey) {
   const raw = unescape(answer);
   const list = Array.isArray(candidates) ? candidates.filter((c) => c && c.name && c.profile) : [];
   const cur = current && typeof current === 'object' ? current : {};
   const isCur = (c) => (Array.isArray(cur.names) ? cur.names.indexOf(c.name) > -1 : c.name === cur.name) && (cur.form === undefined || c.form === cur.form);
   const own = Array.isArray(cur.names) ? undefined : list.filter(isCur)[0];   // a group has no single own choice list
   // A declared confirm_against pair with the current input is read in full below, even when its own choice was picked.
   const pairedWithOwn = !!own && list.some((c) => c !== own && ((Array.isArray(c.confirm_against) && c.confirm_against.indexOf(own.name) > -1) || (Array.isArray(own.confirm_against) && own.confirm_against.indexOf(c.name) > -1)));
   if (own && choiceKey && !pairedWithOwn && own.profile.kind === 'choice' && (own.profile.choices || []).some((c) => c && c.key === choiceKey)) {
      return { hits: [{ form: own.form, name: own.name, value: choiceKey, known: own.value === choiceKey }], ambiguous: [] };
   } else {
      // no direct pick of the current input's own choice: read every candidate's shape
   }
   // A form's scope level: 0 for the current input's form, then each further form in the order the chain lists them.
   const forms = [];
   if (own) {
      forms.push(own.form);
   } else {
      // the current input is not among the candidates (it no longer applies): levels follow the list order
   }
   list.forEach((c) => { if (forms.indexOf(c.form) === -1) { forms.push(c.form); } else { /* already ranked */ } });
   const readings = [];
   for (const c of list) {
      const r = readProfile(c.profile, raw, isCur(c));
      if (r) {
         readings.push({ form: c.form, name: c.name, value: r.value, known: c.value !== undefined && c.value !== null && String(c.value) === String(r.value), evidence: r.evidence, level: forms.indexOf(c.form), current: isCur(c), confirm: Array.isArray(c.confirm_against) ? c.confirm_against : [] });
      } else {
         // this input's shape is not in the answer
      }
   }
   // Readings that spent the same evidence form a group (connected components).
   const conflicts = (a, b) => a.evidence.some((e) => b.evidence.indexOf(e) > -1);
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
   const strip = ({ evidence, level, current: c, confirm, ...r }) => r;
   const paired = (a, b) => a.confirm.indexOf(b.name) > -1 || b.confirm.indexOf(a.name) > -1;
   const hits = [];
   let ambiguous = [];
   for (const members of Object.values(groups)) {
      let winners;
      if (members.length === 1) {
         winners = members;
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
         // a second ambiguous group in one answer is left for the next question
      }
   }
   return { hits, ambiguous };
}
