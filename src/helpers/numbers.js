/**
 * The one number finder (owner 2026-11-19): every number in an answer, each read complete, as said. A value is only ever a
 * complete number (spaces, pauses and punctuation inside it allowed) or a qualified restart, never a piece of one: a reader
 * that took pieces read a phone typed "323 5713211" as account 5713211 (prod 2026-11-17) and the year of a spoken date as an
 * SSN's last four (11-18).
 *
 * findNumbers finds; it never decides what a number is. The caller's own tests decide that (assignNumbers), so a tenant's
 * proprietary identifier is one more test, not a matcher here. Shape reading only; part of jsfe/helpers, imports a sibling.
 */
import { cardinalWords, isNumberWord, plainWord } from './spoken-money.js';

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
 * Which numbers are which, by the caller's tests: kinds = {name: (digits) => false | true | normalized value}. One value per kind.
 * A number is read by every test its complete digits pass and, for a restart, every test the number once passes. A number
 * read more than one way is ambiguous, and so is a kind given two different values: those kinds take no value, so the caller
 * asks (the longest match wins only when it is the only match: "5603 5603" is an 8-digit account or SSN 5603 said twice).
 * A number no test reads is ignored here; the caller decides whether that means asking again.
 *
 * options (optional; without them nothing above changes):
 * - split: true — a number no test reads, whole or as a restart, may be several values the caller typed one after another
 *   (owner 2026-11-20; prod WhatsApp 11-20 08:23 "07 10 1972 9238" was a date of birth and an SSN's last four, asked for
 *   "2 digits for the month, 2 for the day and 4 for the year"). It is split only where the caller separated it, never inside
 *   a group, and only into parts that EVERY one passes a test, so every digit is consumed. Exactly one such reading is taken;
 *   two or more make their kinds ambiguous; none leaves the number unread. A kind takes one part unless it is in multiple.
 * - multiple: [names] — those kinds may take several values: their value is the list of distinct values in order.
 * → {values: {name: value}, ambiguous: [names], unread: [numbers]}
 */
const MAX_SPLIT_GROUPS = 12;   // 2^11 ways to split; a longer run is digits said one by one, never several values

/** The single reading of a number as consecutive parts, each read by a test: [[kind, value], ...]; null for none; 'ambiguous'
 * (with the kinds) for several. */
function splitReading(groups, kinds, read, multiple) {
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
      const options = cut.map((digits) => Object.entries(kinds).map(([kind, test]) => [kind, read(test, digits)]).filter(([, v]) => v));
      const assign = (i, used, chosen) => {
         if (i === cut.length) { found.set(JSON.stringify(chosen), chosen); return; } else { /* next part */ }
         for (const [kind, value] of options[i]) {
            if (used.has(kind) && !multiple.has(kind)) { continue; } else { /* this kind may take this part */ }
            assign(i + 1, new Set(used).add(kind), [...chosen, [kind, value]]);
         }
      };
      if (options.every((o) => o.length)) assign(0, new Set(), []); else { /* a part no test reads: not this cut */ }
   }
   if (found.size === 1) return [...found.values()][0];
   if (found.size > 1) return { ambiguous: [...new Set([...found.values()].flat().map(([kind]) => kind))] };
   return null;
}

export function assignNumbers(numbers, kinds, options) {
   const seen = {}, ambiguous = new Set(), unread = [];
   const multiple = new Set(Array.isArray(options?.multiple) ? options.multiple : []);
   const read = (test, digits) => { const r = test(digits); return r === true ? digits : r ? String(r) : ''; };
   for (const n of numbers || []) {
      const readings = [];
      for (const [kind, test] of Object.entries(kinds || {})) {
         const whole = read(test, n.value);
         if (whole) readings.push([kind, whole]); else { /* the complete number is not this kind */ }
         for (const restart of n.restarts || []) {
            const once = read(test, restart);
            if (once) readings.push([kind, once]); else { /* not this kind */ }
         }
      }
      if (readings.length === 1) {
         (seen[readings[0][0]] ||= new Set()).add(readings[0][1]);
      } else if (readings.length > 1) {
         readings.forEach(([kind]) => ambiguous.add(kind));
      } else {
         const groups = n.groups || [];
         const split = options?.split === true && groups.length > 1 && groups.length <= MAX_SPLIT_GROUPS
            ? splitReading(groups, kinds || {}, read, multiple) : null;
         if (Array.isArray(split)) {
            split.forEach(([kind, value]) => (seen[kind] ||= new Set()).add(value));
         } else if (split) {
            split.ambiguous.forEach((kind) => ambiguous.add(kind));
         } else {
            unread.push(n);
         }
      }
   }
   const values = {};
   for (const [kind, set] of Object.entries(seen)) {
      if (ambiguous.has(kind)) { continue; } else { /* read */ }
      if (multiple.has(kind)) values[kind] = [...set]; else if (set.size === 1) values[kind] = [...set][0]; else ambiguous.add(kind);
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
