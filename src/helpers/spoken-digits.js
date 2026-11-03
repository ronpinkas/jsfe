/**
 * One number said in pieces, joined (owner 2026-11-03: every numeric reader takes spaces). Speech-to-text writes spoken
 * digits apart ("5 0 9"), in groups ("50 9"), or with the pause as a comma, a period or a dash ("5, 0, 9.", "5-0-9").
 * A dash joins only single digits: "12-34 Main St" is a hyphenated house number, not a pause.
 *
 * mode true: any run of groups of up to three digits. mode 'house_number': the first group has at most two digits,
 * because "509 12 Ave" is a house number and a numbered street. Part of jsfe/helpers; zero imports.
 */
const RUN = /(?<![\w.,-])\d{1,3}(?:(?:[ \t]+|,\s*|\.\s+|-)\d{1,3})+(?![\w-])/g;
const joins = (run, mode) => {
   const groups = run.split(/\D+/);
   if (run.includes('-') && !groups.every((group) => group.length === 1)) {
      return false;
   } else if (mode === 'house_number') {
      return groups[0].length <= 2;
   } else {
      return true;
   }
};

/** { text, at }: the text with its spoken numbers joined, and at(i), the index in the original of text index i. */
export function spokenDigitsText(input, mode = true) {
   const raw = String(input ?? '');
   const cuts = [...raw.matchAll(RUN)].filter((match) => joins(match[0], mode));
   let text = '';
   const origin = [];
   let from = 0;
   const keep = (start, end) => {
      for (let i = start; i < end; i++) { text += raw[i]; origin.push(i); }
   };
   for (const cut of cuts) {
      keep(from, cut.index);
      for (let i = cut.index; i < cut.index + cut[0].length; i++) {
         if (/\d/.test(raw[i])) { text += raw[i]; origin.push(i); } else { /* a pause inside the number */ }
      }
      from = cut.index + cut[0].length;
   }
   keep(from, raw.length);
   // A pause after the house number: "2 18, Nice Dr" (prod 11-02 CA120bcd), "633, North Normandy".
   const pause = mode === 'house_number' ? /^\s*\d{1,6}([,.])\s/.exec(text) : null;
   if (pause) {
      const cut = pause[0].length - 2;
      text = text.slice(0, cut) + text.slice(cut + 1);
      origin.splice(cut, 1);
   } else { /* no pause there */ }
   return { text, at: (i) => (i < origin.length ? origin[i] : raw.length) };
}

export function joinSpokenDigits(input, mode = true) {
   return spokenDigitsText(input, mode).text;
}
