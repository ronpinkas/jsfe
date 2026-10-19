/**
 * Strict word-aware option matching for flow CASE conditions (APPROVED_FUNCTIONS.matchesChoice) —
 * replaces the substring `.some(choice => input.includes(choice))` idiom, whose false positives broke
 * branch routing ('si' inside "imposible"/"así" matched YES, prod-observed 2026-08-09).
 *
 * Rules (deliberately NO fuzzy/prefix matching):
 *  - single-word choice: exact word membership
 *  - multi-word choice: exact word-sequence containment
 *  - plurals/inflections: enumerate them explicitly in the choice list
 *  - a keypad key (one digit, * or #) matches ONLY an answer that is exactly that key, never a key
 *    inside a longer answer (owner rule): "I made payments by 1," at "press 1 to pay" charged the full
 *    amount due on dev, 2026-10-14
 *  - an ELONGATED word the user typed is forgiven (2026-10-01): a repeated vowel or any letter typed
 *    3+ times collapses — "Sii" matches 'si', "nadaaaa" 'nada', "yesss" 'yes'. A typed "Sii" at the
 *    authentication retry menu ended the conversation in contact-support. Only the user's word is
 *    collapsed, and only against an option word with no doubled letter of its own. Measured on a
 *    week of prod prompts (scratch replay, 98 option lists × 23,692 prompts):
 *      · collapsing BOTH sides: rejected — 'all' → 'al' made "servicio al cliente" (138 turns) pick
 *        the "all" option, and 'mm' → 'm' made "I'm" a filler;
 *      · collapsing every doubled letter of the user's word: rejected — "mess" matched Spanish
 *        'mes' and "Mall" 'mal'. A doubled consonant is real spelling, so "okk" stays unmatched.
 *
 * Zero imports, so scripts/tests/matches-choice.mjs runs the real implementation.
 */
export function matchesChoice(input, choices) {
   if (!input || !Array.isArray(choices)) {
      return false;
   }
   // One tokenizer for both sides: letters/digits/'*' are word chars, everything
   // else (commas, ¿?¡!, periods) separates — so callers need no pre-normalization.
   const tokenize = (s) => String(s).toLowerCase().split(/[^\p{L}\p{N}*]+/u).filter(Boolean);
   // Elongation, not spelling: a repeated VOWEL, or any letter typed 3+ times. A doubled consonant
   // is real spelling too often ("mess" would become Spanish 'mes', "Mall" 'mal').
   const collapse = (word) => word.replace(/([aeiouáéíóúü])\1+/gu, '$1').replace(/(\p{L})\1{2,}/gu, '$1');
   const hasDoubledLetter = (word) => /(\p{L})\1/u.test(word);
   const words = tokenize(input);
   const collapsedWords = words.map(collapse);
   const sameWord = (i, choiceWord) => words[i] === choiceWord
      || (!hasDoubledLetter(choiceWord) && collapsedWords[i] === choiceWord);
   return choices.some(choice => {
      const choiceWords = tokenize(choice);
      if (/^[0-9*#]$/.test(String(choice).trim())) {
         return String(input).replace(/^[\s.,;:!?¿¡'"]+|[\s.,;:!?¿¡'"]+$/g, '') === String(choice).trim();
      } else if (choiceWords.length === 0) {
         return false;
      } else {
         // a single word, or a multi-word entry ('thank you', 'por favor') as a consecutive run
         for (let i = 0; i <= words.length - choiceWords.length; i++) {
            if (choiceWords.every((c, j) => sameWord(i + j, c))) {
               return true;
            } else {
               // no run starting here
            }
         }
         return false;
      }
   });
}
