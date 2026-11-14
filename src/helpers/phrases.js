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

/**
 * The verb that asks for an answer on this channel: the host's (`cargo.verb` / `cargo.verb_es`), else "say" / "diga" on a
 * call and "type" / "escriba" elsewhere. `capital` capitalizes it for the start of a sentence.
 */
export function channelVerb(lang, cargo, capital = false) {
   const es = lang === 'es', voice = !!(cargo && cargo.voice === true);
   const verb = String((cargo && (es ? cargo.verb_es : cargo.verb)) || (es ? (voice ? 'diga' : 'escriba') : (voice ? 'say' : 'type')));
   return capital ? verb.charAt(0).toUpperCase() + verb.slice(1) : verb;
}

/**
 * The keys and words of a yes/no question, worded for the channel (owner 2026-11-14): every yes/no question names
 * 1 for YES and 2 for NO on a call. The verb is the host's (`cargo.verb` / `cargo.verb_es`: "say" / "type"), else
 * "say" on a call and "type" elsewhere. `yes` and `no` are optional tails ("to submit it", "para enviarla").
 *   voice: "Press 1 or say YES to submit it, or press 2 or say NO."
 *   text:  "Type YES to submit it, or type NO."
 */
export function yesNoKeys(lang, cargo, yes = '', no = '') {
   const es = lang === 'es', voice = !!(cargo && cargo.voice === true);
   const verb = channelVerb(lang, cargo);
   const tail = (t) => (t ? ' ' + String(t).trim() : '');
   const yesWord = es ? 'SÍ' : 'YES';
   const lead = voice ? (es ? 'Presione 1 o ' : 'Press 1 or ') + verb : verb.charAt(0).toUpperCase() + verb.slice(1);
   const second = voice ? (es ? 'presione 2 o ' : 'press 2 or ') + verb : verb;
   return `${lead} ${yesWord}${tail(yes)}, ${es ? 'o' : 'or'} ${second} NO${tail(no)}.`;
}
