/**
 * The one number finder (owner 2026-11-19): every number in an answer, each read complete, as said. A value is only ever a
 * complete number (spaces, pauses and punctuation inside it allowed) or a qualified restart, never a piece of one: a reader
 * that took pieces read a phone typed "323 5713211" as account 5713211 (prod 2026-11-17) and the year of a spoken date as an
 * SSN's last four (11-18).
 *
 * findNumbers finds; it never decides what a number is. The caller's specs decide that (assignNumbers: known kinds, or a
 * described pattern), so a tenant's proprietary identifier is one more spec, not a matcher here. Shape reading only; part of jsfe/helpers, imports siblings.
 */
import { cardinalWords, isNumberWord, plainWord } from './spoken-money.js';
import { validateCardNumber, validateExpiration } from './card-checks.js';

/** A run of digits as said: spoken digits come apart ("4 3 2 1", "555-123-4567"), so a single space, dash or dot inside a run
 * joins it, and so does a comma (or a period and a space) after a group of one to three digits: speech-to-text writes the
 * pauses between spoken groups that way (prod 2026-10-31: the ZIP 92610 said as "926, 1 0.", the code as "7, 9, 984. 5."). A
 * comma after a longer number separates two numbers ("92610, 56035214"). */
export const DIGIT_RUN = /\d(?:[\s.-]?\d|(?<=(?:^|\D)\d{1,3})(?:,\s?|\.\s)(?=\d))*/g;

const DIGIT_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
   cero: 0, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };
// Words that are a number only next to another number word: an article alone ("una cuenta", "a payment") is not one.
const ARTICLES = new Set(['a', 'an', 'un', 'una']);
const CONNECTORS = new Set(['and', 'y']);
const SCALES = [[1000000, ['million', 'millon', 'millones']], [1000, ['thousand', 'mil']], [100, ['hundred', 'cien', 'ciento']]];

/** Number words in the answer, each run with its digits: "one thousand and 3" → 1003, "cinco cinco cinco" → 555. */
function wordNumbers(raw) {
   const tokens = [...raw.matchAll(/\p{L}+|\d+/gu)].map((m) => ({ word: plainWord(m[0]), start: m.index, end: m.index + m[0].length }));
   const gapOk = (a, b) => /^[\s-]*$/.test(raw.slice(a.end, b.start));
   const found = [];
   for (let i = 0; i < tokens.length; i++) {
      const first = tokens[i].word;
      // Spanish says "y" inside a number, and speech-to-text keeps it between the digits (owner 2026-11-19; prod 11-19 17:10
      // "9 y 5, 55, 31" was the code 955531): tens and a digit add up ("40 y 3" → 43, "cuarenta y tres"); two single digits
      // join ("9 y 5" → 95) unless the first ends a number already being said digit by digit ("1 2 3 4 y 0 5 1 2 1 9 8 0" is two
      // numbers). "y" between longer groups still separates two numbers ("1382 y 5603").
      const and = tokens[i + 1], unit = tokens[i + 2];
      if (/^\d{1,2}$/.test(first) && and?.word === 'y' && unit && /^\d$/.test(unit.word) && gapOk(tokens[i], and) && gapOk(and, unit)
         && !/\d/.test(raw[unit.end] || '')) {
         const tensAndUnit = /^[2-9]0$/.test(first) && unit.word !== '0';
         const digitPair = /^\d$/.test(first) && !/\d[\s.,-]*$/.test(raw.slice(0, tokens[i].start));
         if (tensAndUnit || digitPair) {
            found.push({ start: tokens[i].start, end: unit.end, digits: tensAndUnit ? String(Number(first) + Number(unit.word)) : first + unit.word });
            i += 2;
            continue;
         } else { /* "15 y 3": two numbers */ }
      } else { /* no "y" inside a number here */ }
      if (!isNumberWord(first) || CONNECTORS.has(first)) { continue; } else { /* a run starts here */ }
      let j = i;
      while (j + 1 < tokens.length && isNumberWord(tokens[j + 1].word) && gapOk(tokens[j], tokens[j + 1])) j++;
      while (j > i && (CONNECTORS.has(tokens[j].word) || ARTICLES.has(tokens[j].word))) j--;
      const words = tokens.slice(i, j + 1).map((t) => t.word);
      if (words.length === 1 && ARTICLES.has(words[0])) { continue; } else { /* a number word */ }
      let value = cardinalWords(words);
      let digits = value === null ? null : String(value);
      if (digits === null && words.every((w) => Object.hasOwn(DIGIT_WORDS, w))) {
         digits = words.map((w) => DIGIT_WORDS[w]).join('');   // digits said one by one
      } else { /* a cardinal, or not a number */ }
      if (digits === null) { continue; } else { /* read */ }
      // A digit said after a scale word completes it: "one thousand and 3", "mil 3", "two hundred 5".
      let end = tokens[j].end;
      let k = j + 1;
      if (value !== null && k < tokens.length && CONNECTORS.has(tokens[k].word) && gapOk(tokens[j], tokens[k])) k++; else { /* no connector */ }
      const tail = tokens[k];
      const scale = value === null ? 0 : (SCALES.find(([size, names]) => words.some((w) => names.includes(w)) && value % size === 0)?.[0] || 0);
      if (scale && tail && /^\d+$/.test(tail.word) && gapOk(tokens[k - 1], tail) && Number(tail.word) < scale) {
         digits = String(value + Number(tail.word));
         end = tail.end;
         j = k;
      } else { /* nothing completes it */ }
      found.push({ start: tokens[i].start, end, digits });
      i = j;
   }
   return found;
}

/** A caller on the phone repeats themselves (owner 2026-11-19), so a run may hold a restart: the number once.
 * - The whole number said twice ("6119 6119", "04 13 1955 04 13 1955"): two identical halves of four digits or more.
 * - Its last part said again ("323 571 3211 3211"): trailing groups that repeat the digits just before them, three digits
 *   or more (one repeated digit is no restart: "5 6 0 3 3" may be the number).
 * - A false start ("57. 57, 21, 80."): digits cut off at a pause the transcript marks (a comma or a period), then the number
 *   again from its start (the rule the OTP reader has used since 2026-11-18, otpDigits).
 * A restart is only a candidate: assignNumbers takes it when the whole number fits nothing, and asks when both fit. */
function restartsOf(said) {
   const groups = said.split(/\D+/).filter(Boolean);
   const pauses = said.match(/\D+/g) || [];   // pauses[i - 1] separates groups[i - 1] and groups[i]
   const found = new Set();
   for (let i = 1; i < groups.length; i++) {
      const before = groups.slice(0, i).join(''), after = groups.slice(i).join('');
      if (before === after && before.length >= 4) {
         found.add(before);
      } else if (after.length >= 3 && before.length > after.length && before.endsWith(after)) {
         found.add(before);
      } else if (/[,.]/.test(pauses[i - 1] || '') && after.length > before.length && after.startsWith(before)) {
         found.add(after);
      } else { /* no repeat at this boundary */ }
   }
   return [...found];
}

/**
 * Every number in the answer, in order: [{value, said, start, end, restarts, groups}]. value is the complete number's digits; said
 * the text it was read from (start/end index the answer); restarts the readings of the number once when the caller repeated it
 * (restartsOf), else []; groups its digits as the caller separated them ("07 10 1972" → ['07', '10', '1972']). Number words
 * are numbers ("one thousand and 3" → 1003, "cinco cinco cinco" → 555); every other word separates two numbers.
 */
export function findNumbers(answer) {
   const raw = String(answer ?? '');
   // A line break separates two numbers, as a word does (prod WhatsApp 2026-10-18: a date, then the account on the next line).
   const lines = raw.replace(/[\r\n]/g, '|');
   // Number words become their digits first, so a number said partly in words joins like any other ("five five five 1212").
   // Each character of text maps back to the answer: firstOf where a number starting on it begins, lastOf where one ending on it
   // ends (a word's digits all begin at the word and end with it).
   let text = '';
   const firstOf = [], lastOf = [];
   let from = 0;
   for (const w of wordNumbers(lines)) {
      for (let i = from; i < w.start; i++) { text += lines[i]; firstOf.push(i); lastOf.push(i); }
      for (const d of w.digits) { text += d; firstOf.push(w.start); lastOf.push(w.end - 1); }
      from = w.end;
   }
   for (let i = from; i < raw.length; i++) { text += lines[i]; firstOf.push(i); lastOf.push(i); }
   return [...text.matchAll(DIGIT_RUN)].map((m) => {
      const said = m[0].replace(/[\s.,-]+$/, '');
      const start = firstOf[m.index], end = lastOf[m.index + said.length - 1] + 1;
      return { value: said.replace(/\D/g, ''), said: raw.slice(start, end), start, end, restarts: restartsOf(said),
         groups: said.split(/\D+/).filter(Boolean) };
   });
}

/**
 * The kinds a number can be (owner 2026-11-20): a known kind is a jsfe field preset of digits, or a date; a custom kind is
 * described, never coded: {kind: 'pattern', regex, flags?} or {kind: 'digits', min, max}. Each reads a number's complete
 * digits and gives its value (a date as YYYY-MM-DD, everything else its digits) or '' when it is not that kind. The preset
 * lengths are pinned to FIELD_PRESETS by tests/join-spoken-numbers.test.mjs. An amount is not here: it is read by the
 * money reader, never out of a run of digits.
 */
const length = (min, max = min) => (digits) => (digits.length >= min && digits.length <= max ? digits : '');
/** A date typed as digits: MMDDYYYY or MMDDYY, day first ("17101981") only when it cannot be month first. past: no later
 * year than this one, and a two-digit year is the most recent one (a date of birth). */
function dateDigits(digits, spec) {
   if (digits.length !== 6 && digits.length !== 8) return '';
   const now = new Date().getFullYear();
   const take = (m, d, y) => {
      let year = Number(y);
      if (y.length === 2) year += spec.past === true ? (year > now % 100 ? 1900 : 2000) : 2000; else { /* four digits, as typed */ }
      const month = Number(m), day = Number(d), at = new Date(Date.UTC(year, month - 1, day));
      const valid = year >= 1900 && year <= (spec.past === true ? now : 2099) && at.getUTCFullYear() === year && at.getUTCMonth() + 1 === month && at.getUTCDate() === day;
      return valid ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
   };
   const a = digits.slice(0, 2), b = digits.slice(2, 4), y = digits.slice(4);
   return take(a, b, y) || (Number(a) > 12 ? take(b, a, y) : '');
}
const KNOWN_KINDS = {
   date: (spec) => (digits) => dateDigits(digits, spec),
   zip: () => length(5),
   card_zip: () => length(5),
   ssn_last4: () => length(4),
   account_number: () => length(6, 12),
   phone: () => length(10, 11),
   card_cvv: () => length(3, 4),
   card_number: () => (digits) => (digits.length >= 13 && digits.length <= 19 && validateCardNumber(digits) ? digits : ''),
   card_expiration: () => (digits) => (digits.length === 4 && validateExpiration(digits.slice(0, 2), digits.slice(2)) ? digits : ''),
   pattern: (spec) => { const rx = new RegExp(spec.regex, spec.flags || ''); return (digits) => (rx.test(digits) ? digits : ''); },
   digits: (spec) => length(Number(spec.min), Number(spec.max ?? spec.min))
};
export const NUMBER_KINDS = Object.keys(KNOWN_KINDS);

/** specs → [{name, read}]. A spec list is the documented form; a {name: (digits) => false | true | value} object (jsfe
 * 1.81-1.83) is still read the same way. An unknown kind, a pattern without its regex, digits without min, or a repeated
 * name throws: a reader declared wrong fails where it is declared, never by reading nothing. */
function readersOf(specs) {
   if (!Array.isArray(specs)) {
      return Object.entries(specs || {}).map(([name, test]) => ({ name, read: (digits) => { const r = test(digits); return r === true ? digits : r ? String(r) : ''; } }));
   } else { /* a spec list */ }
   const names = new Set();
   return specs.map((spec) => {
      const name = spec && spec.name, kind = spec && spec.kind;
      if (!name || typeof name !== 'string' || names.has(name)) throw new Error(`assignNumbers: spec name ${JSON.stringify(name)} is missing or repeated`);
      if (!Object.hasOwn(KNOWN_KINDS, kind)) throw new Error(`assignNumbers: ${name} has kind ${JSON.stringify(kind)}; the kinds are ${NUMBER_KINDS.join(', ')}`);
      if (kind === 'pattern' && typeof spec.regex !== 'string') throw new Error(`assignNumbers: ${name} is a pattern without its regex`);
      if (kind === 'digits' && !(Number(spec.min) > 0)) throw new Error(`assignNumbers: ${name} is digits without min`);
      names.add(name);
      return { name, read: KNOWN_KINDS[kind](spec) };
   });
}

/**
 * Which numbers are which: specs = [{name, kind, ...}] (NUMBER_KINDS above), one value per spec. A number is read by every
 * spec its complete digits fit and, for a restart, every spec the number once fits. A number read more than one way is
 * ambiguous, and so is a spec given two different values: those take no value, so the caller asks (the longest match wins
 * only when it is the only match: "5603 5603" is an 8-digit account or SSN 5603 said twice). A number no spec reads is
 * returned in unread; the caller decides whether that means asking again.
 *
 * options.multiple: true — one answer may fill several specs with one number typed in parts (owner 2026-11-20; prod WhatsApp
 * 11-20 08:23 "07 10 1972 9238" was a date of birth and an SSN's last four). A number no spec reads whole is cut only where
 * the caller separated it, never inside a group, into parts that each fill a different spec, so every digit is consumed;
 * exactly one such reading is taken, two or more make their specs ambiguous, none leaves the number unread. (split: true is
 * the jsfe 1.83.0 name for it.)
 * → {values: {name: value}, ambiguous: [names], unread: [numbers]}
 */
const MAX_SPLIT_GROUPS = 12;   // 2^11 ways to cut; a longer run is digits said one by one, never several values

/** The single reading of a number as consecutive parts, each filling a different spec: [[name, value], ...]; null for none;
 * {ambiguous: [names]} for several. */
function splitReading(groups, readers) {
   const found = new Map();
   const parts = (from) => {   // every way to cut groups[from..] into consecutive parts
      if (from === groups.length) return [[]];
      const out = [];
      for (let to = from + 1; to <= groups.length; to++) {
         for (const rest of parts(to)) out.push([groups.slice(from, to).join(''), ...rest]);
      }
      return out;
   };
   for (const cut of parts(0)) {
      if (cut.length < 2) { continue; } else { /* the whole number was already tried */ }
      const options = cut.map((digits) => readers.map(({ name, read }) => [name, read(digits)]).filter(([, v]) => v));
      const assign = (i, used, chosen) => {
         if (i === cut.length) { found.set(JSON.stringify(chosen), chosen); return; } else { /* next part */ }
         for (const [name, value] of options[i]) {
            if (used.has(name)) { continue; } else { /* a spec not filled yet */ }
            assign(i + 1, new Set(used).add(name), [...chosen, [name, value]]);
         }
      };
      if (options.every((o) => o.length)) assign(0, new Set(), []); else { /* a part no spec reads: not this cut */ }
   }
   if (found.size === 1) return [...found.values()][0];
   if (found.size > 1) return { ambiguous: [...new Set([...found.values()].flat().map(([name]) => name))] };
   return null;
}

export function assignNumbers(numbers, specs, options) {
   const readers = readersOf(specs);
   const multiple = options?.multiple === true || options?.split === true;
   const seen = {}, ambiguous = new Set(), unread = [];
   for (const n of numbers || []) {
      const readings = [];
      for (const { name, read } of readers) {
         const whole = read(n.value);
         if (whole) readings.push([name, whole]); else { /* the complete number is not this kind */ }
         for (const restart of n.restarts || []) {
            const once = read(restart);
            if (once) readings.push([name, once]); else { /* not this kind */ }
         }
      }
      if (readings.length === 1) {
         (seen[readings[0][0]] ||= new Set()).add(readings[0][1]);
      } else if (readings.length > 1) {
         readings.forEach(([name]) => ambiguous.add(name));
      } else {
         const groups = n.groups || [];
         const split = multiple && groups.length > 1 && groups.length <= MAX_SPLIT_GROUPS ? splitReading(groups, readers) : null;
         if (Array.isArray(split)) {
            split.forEach(([name, value]) => (seen[name] ||= new Set()).add(value));
         } else if (split) {
            split.ambiguous.forEach((name) => ambiguous.add(name));
         } else {
            unread.push(n);
         }
      }
   }
   const values = {};
   for (const [name, set] of Object.entries(seen)) {
      if (set.size === 1 && !ambiguous.has(name)) values[name] = [...set][0]; else ambiguous.add(name);
   }
   return { values, ambiguous: [...ambiguous], unread };
}

/** The answer with each number written as its digits (a restart as the number once unless {restarts: false}), for a reader
 * that reads text: "323 5713211" → "3235713211", "one thousand and 3" → "1003". */
export function joinSpokenNumbers(answer, options = {}) {
   const raw = String(answer ?? '');
   const restarts = options?.restarts !== false;
   let out = '', from = 0;
   for (const n of findNumbers(raw)) {
      out += raw.slice(from, n.start) + (restarts && n.restarts.length === 1 ? n.restarts[0] : n.value);
      from = n.end;
   }
   return out + raw.slice(from);
}
