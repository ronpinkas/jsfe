/**
 * normalizeAndFindCapture (APPROVED_FUNCTIONS): the first capture pattern a free answer matches, as
 * { variable, value } (value = the matched part) — the retry menu's "a contact in the answer retries with it" (generic-retry-with-options
 * capture_patterns: [{ variable, regex, normalizer? }]). The normalizer is removed from the answer first
 * (e.g. '[^0-9]' leaves the digits of "213-555-0100"). A pattern whose regex is invalid is skipped and reported
 * through `warn`, so one bad tenant pattern cannot stop the others.
 *
 * A pattern may name a reader instead of a regex: { variable, reader: 'phone' | 'email' } reads the answer with
 * readPhone / readEmail (spoken and spelled forms included).
 *
 * Part of jsfe/helpers; imports only its sibling contact.js.
 */
import { readEmail, readPhone } from './contact.js';

const READERS = { phone: readPhone, email: readEmail };
export function normalizeAndFindCapture(userInput, patterns, warn = () => {}) {
   if (!Array.isArray(patterns)) {
      return null;
   } else {
      for (const pattern of patterns) {
         if (pattern && READERS[pattern.reader]) {
            const value = READERS[pattern.reader](userInput);
            if (value) {
               return { variable: pattern.variable, value };
            } else {
               continue;
            }
         } else {
            // a regex pattern
         }
         try {
            const value = pattern.normalizer ? String(userInput ?? '').replace(new RegExp(pattern.normalizer, 'g'), '') : String(userInput ?? '');
            const match = new RegExp(pattern.regex).exec(value);
            if (match) {
               // the matched part only: "my email is a@b.com" captures a@b.com
               return { variable: pattern.variable, value: match[0].trim() };
            } else {
               // not this pattern
            }
         } catch (e) {
            warn(`Invalid regex in capture pattern: ${e.message}`);
         }
      }
      return null;
   }
}
