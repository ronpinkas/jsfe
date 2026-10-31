/**
 * Sentences the flows say in many places, written once and addressed to the customer by name when the session knows it
 * (APPROVED_FUNCTIONS anythingElse, goodbye). Before it, one flow set's closing question was typed into 30 English and 30
 * Spanish SAYs, none of them using the name the account lookup had found. Part of jsfe/helpers; zero imports.
 */

/** A name as said to the customer: trimmed; an all-capitals name (as account systems store it) in title case. */
export function sayName(name) {
   const n = String(name ?? '').trim();
   if (n && n === n.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(n)) {
      return n.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
   } else {
      return n;
   }
}

/**
 * The acknowledgement before a question asked again ("Sorry, I didn't catch that. "), with a trailing space. It names the
 * customer only when the flows opt in with cargo.sorryByName (jsfe 1.20.0; owner 2026-10-31) and cargo.displayName is
 * known; otherwise it is the wording every earlier version said.
 */
export function sorryNotCaught(lang, cargo) {
   const n = cargo && cargo.sorryByName === true ? sayName(cargo.displayName) : '';
   if (lang === 'es') {
      return n ? `Disculpe, ${n}, no le entendí. ` : 'Disculpe, no le entendí. ';
   } else {
      return n ? `Sorry, ${n}, I didn't catch that. ` : "Sorry, I didn't catch that. ";
   }
}

const ANYTHING_ELSE = {
   en: (n) => (n ? `Is there anything else I can help you with, ${n}?` : 'Is there anything else I can help you with?'),
   es: (n) => (n ? `¿Hay algo más en lo que pueda ayudarle, ${n}?` : '¿Hay algo más en lo que pueda ayudarle?'),
};
const GOODBYE = {
   en: (n) => (n ? `Have a great day, ${n}!` : 'Have a great day!'),
   es: (n) => (n ? `¡Que tenga un buen día, ${n}!` : '¡Que tenga un buen día!'),
};

/** The closing question after a task is done, in the turn's language ('en' when there is none), with the name if known. */
export function anythingElse(lang, name) {
   return (ANYTHING_ELSE[lang] || ANYTHING_ELSE.en)(sayName(name));
}

/** The parting wish when a conversation ends, in the turn's language, with the name if known. */
export function goodbye(lang, name) {
   return (GOODBYE[lang] || GOODBYE.en)(sayName(name));
}
