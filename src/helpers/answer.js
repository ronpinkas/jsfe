/**
 * The platform's answer vocabulary, ONE place for every flow set (APPROVED_FUNCTIONS isAnswer, isAgentRequest, isOtherRequest,
 * isAmountAnswer, pickChoice). Before it, the YES / NO / AGENT / EXIT / TEXT words were copied by hand into system, ai-ar and Shopify
 * flows and had drifted: four AGENT lists (25, 21, 15 and 12 words), nine YES lists, and a Shopify search that
 * matched AGENT words as substrings, so "olive oil" and "televisor inteligente" went to an agent (review 2026-10-13).
 *
 * Words match whole words or word runs (matchesChoice), never substrings. Keypad conventions are platform-wide:
 * 0 is an agent, * is exit.
 *
 * Part of jsfe/helpers; imports only its sibling matches-choice.js.
 */
import { matchesChoice } from './matches-choice.js';

export const ANSWER_WORDS = {
   yes: ['yes', 'yeah', 'yea', 'yep', 'yup', 'sure', 'ok', 'okay', 'okey', 'please', 'of course', 'correct', 'right', 'go ahead',
      'alright', 'all right', 'absolutely', 'definitely', 'certainly', 'sounds good', "that's fine", 'that is fine', 'fine',
      "that's ok", "that's okay", "that's right", 'that is right', "that's correct", 'that works', 'agree', 'i agree', 'agreed',
      'approve', 'i approve', 'approved', 'confirm', 'i confirm', 'confirmed', 'proceed', 'do it', 'perfect', 'exactly', 'i do',
      'si', 'sí', 'claro', 'claro que sí', 'claro que si', 'seguro', 'por favor', 'correcto', 'está bien', 'esta bien', 'de acuerdo',
      'estoy de acuerdo', 'dale', 'por supuesto', 'bueno', 'confirmo', 'confirmado', 'apruebo', 'aprobado', 'adelante', 'hazlo',
      'procede', 'perfecto', 'exacto', 'eso es', 'así es', 'asi es',
      // the offered thing, pointed at (prod 2026-10-25 17:46: "Ese está bien." to "¿Se lo envío a …?" was not a yes)
      'ese mismo', 'esa misma', 'eso mismo', 'el mismo', 'la misma', "that's the one", 'that is the one',
      'the same one',
      // agreeing to what the question offers: "Sí, quiero continuar" to "diga SÍ para continuar" (replay of prod, 2026-10-14).
      // A bare "I want" / "quiero" is never a confirmation (owner decision 2026-10-15): "Quiero pagar" at the express offer,
      // which charges on its YES, was a YES because 'pagar' is that choice's own word.
      'continue', 'i want to continue', 'go on', 'go ahead please', 'please do', 'yes i do',
      'sí quiero', 'si quiero', 'continuar', 'quiero continuar', 'seguir', 'sigue', 'continúe', 'continue por favor',
      'proceder', 'procedo', 'procede por favor', 'proceda', 'proceda por favor', 'sí proceda', 'si proceda'],
   no: ['no', 'nope', 'nah', 'no thanks', 'no thank you', 'not now', 'not today', 'no gracias', 'ahora no', 'hoy no'],
   agent: ['live agent', 'agent', 'agents', 'representative', 'rep', 'human', 'operator', 'manager', 'supervisor', 'someone',
      'somebody', 'real person', 'a person', 'customer service', 'support', 'agente', 'agentes', 'gente', 'representante',
      'humano', 'operador', 'operadora', 'gerente', 'alguien', 'persona', 'servicio al cliente', 'al cliente', 'servicio',
      'recepcionista', 'recepcion', 'recepción'],
   exit: ['exit', 'quit', 'abort', 'salir', 'cancel', 'cancelar'],
   text: ['text', 'texto', 'sms', 'message', 'mensaje', 'text me', 'by text', 'por texto', 'mensaje de texto', 'whatsapp',
      'escríbeme', 'escribeme'],
};

// The ONLY words that confirm a choice that charges or cancels (`exact`), besides the choice's own words and keys; courtesy
// around them is allowed (owner decision 2026-10-15: "clear charge confirmation exclusively"). Left out on purpose:
// acknowledgements ("ok", "está bien", "fine", "sounds good", "perfecto": "I heard you", not "charge me"), "bueno" (the
// Mexican phone "hello?"), courtesy alone ("please", "por favor"), words that are questions once ASR drops the "?"
// ("right", "seguro", "exactly", "así es"), and agreeing to continue ("continue", "continuar").
export const CONFIRM_WORDS = ['yes', 'yeah', 'yep', 'yup', 'sure', 'of course', 'absolutely', 'definitely', 'confirm', 'i confirm',
   'confirmed', 'approve', 'i approve', 'approved', 'agree', 'i agree', 'agreed', 'proceed', 'go ahead', 'go ahead please', 'do it',
   'correct', "that's correct", 'that is correct', "that's right", 'that is right', 'yes i do',
   'si', 'sí', 'claro', 'claro que sí', 'claro que si', 'por supuesto', 'confirmo', 'confirmado', 'apruebo', 'aprobado', 'adelante',
   'dale', 'hazlo', 'procede', 'proceda', 'proceder', 'procedo', 'sí proceda', 'si proceda', 'correcto', 'de acuerdo',
   'estoy de acuerdo', 'sí quiero', 'si quiero'];

// Acknowledgements: never a confirmation of an `exact` choice on their own, but said beside one ("Sí, está bien", "Yes,
// okay") they change nothing, like courtesy. Beside an exact choice's own words, a CONFIRM word is the same ("Yes, the
// full balance").
// AGENT words that also mean something else inside a sentence ("quiero pagar mi servicio", "someone else will pay"): they
// ask for a person only as the whole answer (AGENT_ONLY), never from inside one.
const AGENT_AMBIGUOUS = new Set(['servicio', 'support', 'someone', 'somebody', 'alguien', 'persona', 'a person', 'gente', 'al cliente']);
// A word that negates what follows it in its clause ("not sure", "no quiero un agente").
const NEGATIONS = ['no', 'not', 'nope', 'nah', 'never', 'dont', 'doesnt', 'didnt', 'cant', 'cannot', 'wont', 'nunca', 'ni',
   'tampoco', 'jamas', 'jamás'];
// Phrases that hold a negation word but agree ("no problem", "why not").
const AGREEING = /\b(no problem|no worries|no hay problema|no te preocupes|why not|por que no|por qué no)\b/g;
const DEFERRAL = /\b(later|tomorrow|next week|not now|not today|another time|mañana|manana|después|despues|luego|otro día|otro dia|ahora no|hoy no)\b/;
const AGENT_ONLY = /^(?:(?:i want|i need|i would like|id like|can i|could i|let me|please|quiero|necesito|puedo|por favor)\s+)*(?:(?:to\s+)?(?:talk|speak|hablar|comunicarme)\s+(?:to|with|con)\s+)?(?:a|an|un|una|el|la)?\s*(?:live agent|agent|representative|rep|human|operator|real person|a person|person|someone|somebody|customer service|agente|representante|humano|operador|operadora|persona|alguien|servicio al cliente|agente en vivo|gerente|manager|supervisor)(?:\s+(?:please|por favor))?$/;

// Accents are not meaning here (owner 2026-10-16): text callers type "direccion" for "dirección", "si" for "sí". Both
// sides of every comparison pass through normalize, so a word list matches with or without them; ñ is kept.
const plainVowels = (s) => s.replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o').replace(/[úùûü]/g, 'u');

/** Unescapes what the engine escaped, lowercases, drops punctuation but keeps * @ ., and drops accents (not ñ). */
const normalize = (s) => plainVowels(String(s ?? '').replace(/\\(['"\\])/g, '$1').toLowerCase().replace(/[^\w\s*@.áéíóúüñàâäèêëìîïòôöùû]+/g, ''))
   .replace(AGREEING, ' ').replace(/\s+/g, ' ').trim();
const NEGATION_SET = new Set(NEGATIONS.map(plainVowels));
const hasNegation = (s) => String(s).split(' ').some((t) => NEGATION_SET.has(t));

// Said around an answer without changing it: politeness, filler, a form of address.
const COURTESY = ['please', 'por favor', 'thanks', 'thank you', 'thank you so much', 'thanks a lot', 'gracias', 'muchas gracias', 'um', 'umm', 'uh', 'uhm',
   'hmm', 'oh', 'ah', 'well', 'so', 'like', 'este', 'pues', "ma'am", 'maam', 'madam', 'sir', 'miss', 'señor', 'senor', 'señora',
   'senora', 'señorita', 'senorita', 'mija', 'mijo'].map(normalize).map((w) => w.split(' '));
// A bare thanks at a yes/no question is a graceful acceptance (owner decision 2026-10-16): YES, but only at a choice keyed
// 'yes' that does not charge or cancel (pickChoice). "No, gracias" stays NO; isAnswer(…, 'yes') takes thanks only as a
// caller's extra.
const THANKS = ['thanks', 'thank you', 'thank you so much', 'thanks a lot', 'gracias', 'muchas gracias'];
const ACKNOWLEDGEMENTS = ['ok', 'okay', 'okey', 'está bien', 'esta bien', 'bueno', 'fine', "that's fine", 'alright', 'all right',
   'perfect', 'perfecto', 'sounds good', 'great', 'excelente', 'muy bien'].map(normalize).map((w) => w.split(' '));
const CONFIRM_FILLER = CONFIRM_WORDS.map(normalize).map((w) => w.split(' '));
// At a soft question (a yes choice that does not charge or cancel), a word pointing at the offered thing may lead the YES:
// "ese está bien", "esa sí", "that one is fine". It is never a YES alone; a firm question stays strict.
const POINTERS = ['ese', 'esa', 'eso', 'esos', 'esas', 'ese es', 'esa es', 'that', 'this', 'that one', 'this one', 'that one is',
   'this one is', 'that is', 'this is'].map(normalize).map((w) => w.split(' '));
// articles and possessives in front of an exact choice's own words ("Yes, the full balance", "Sí, el saldo completo")
const ARTICLES = ['the', 'my', 'el', 'la', 'mi'].map((w) => [w]);
const YES_SET = new Set(ANSWER_WORDS.yes.map(normalize));
const collapse = (w) => w.replace(/([aeiouáéíóúü])\1+/g, '$1').replace(/(\p{L})\1{2,}/gu, '$1');
const phraseAt = (tokens, i, phrase) => phrase.every((w, j) => tokens[i + j] === w
   || (!/(\p{L})\1/u.test(w) && collapse(tokens[i + j] || '') === w));

/**
 * Whether the answer, with courtesy around it removed (please / thanks / gracias, um, uh, ma'am, señora…), holds NOTHING but
 * words from `words` — at least one of them. A YES that acts must be the whole answer (owner rule, 2026-10-14): "Yeah, sure,
 * thank you" and "Sí, claro, por favor" are YES; "yes, pay it" and "I made payments by 1" are not.
 */
function onlyAffirmative(b, words, needOne = true, filler = []) {
   if (!words.length && needOne) {
      return false;
   } else {
      // words to match
   }
   const tk = String(b).replace(/\./g, ' ').split(' ').filter(Boolean);
   const own = words.map(normalize).filter(Boolean).map((w) => w.split(' '));
   const at = (i, phrase) => phraseAt(tk, i, phrase);
   let i = 0;
   let saw = false;
   while (i < tk.length) {
      const yes = own.filter((p) => at(i, p)).sort((x, y) => y.length - x.length)[0];
      const courtesy = yes ? null : [...COURTESY, ...filler].filter((p) => at(i, p)).sort((x, y) => y.length - x.length)[0];
      if (yes) {
         i += yes.length;
         saw = true;
      } else if (courtesy) {
         i += courtesy.length;
      } else {
         return false;
      }
   }
   return saw || !needOne;
}

// Channel nouns select a channel only inside a complete request. The remainder must describe
// switching/continuing the conversation, not the contents of an OTP or a quoted earlier message.
const TEXT_CHANNELS = ['text', 'text message', 'texto', 'sms', 'message', 'mensaje', 'mensaje de texto', 'whatsapp'];
const TEXT_REQUEST_PREFIXES = ['i want to', 'i need to', 'i would like to', 'id like to', 'i would rather', 'id rather',
   'i want', 'i need', 'i prefer', 'i would like', 'id like', 'can i', 'could i', 'can we', 'could we', 'can you', 'could you', 'would you', 'lets',
   'quiero', 'quisiera', 'me gustaria', 'prefiero', 'necesito', 'podemos', 'podriamos', 'puedes', 'podrias', 'puede', 'podria', 'mejor']
   .map(w => w.split(' ')).sort((a, b) => b.length - a.length);
const TEXT_WRAPPERS = [...COURTESY, ...ACKNOWLEDGEMENTS, ...CONFIRM_FILLER].sort((a, b) => b.length - a.length);
function trimAnswerWrappers(tokens) {
   while (tokens.length) {
      const first = TEXT_WRAPPERS.find(phrase => phraseAt(tokens, 0, phrase));
      const last = first ? null : TEXT_WRAPPERS.find(phrase => phrase.length <= tokens.length && phraseAt(tokens, tokens.length - phrase.length, phrase));
      if (first) tokens = tokens.slice(first.length);
      else if (last) tokens = tokens.slice(0, -last.length);
      else break;
   }
   return tokens;
}
function textRequest(input, words, extra) {
   const raw = String(input ?? '').replace(/\\(['"\\])/g, '$1');
   // Quotation, code, blockquotes and strikethrough mark non-command text before normalization
   // removes their delimiters. Ordinary emphasis and apostrophes remain valid command text.
   const quoted = /["“”«»]|(?:^|\s)'[^']+'(?=$|\s|[.,!?;:])|(?:^|\s)‘[^’]+’(?=$|\s|[.,!?;:])/u.test(raw);
   const markdown = /`|~~|(?:^|\n)[ \t]*>/u.test(raw);
   if (quoted || markdown) return false;
   const command = raw.replace(/(\*{1,2}|_{1,2})(?=\S)([\s\S]*?\S)\1/g, '$2');
   let tokens = trimAnswerWrappers(normalize(command.replace(/[,;!?¿¡]/g, ' ')).replace(/\./g, ' ').split(' ').filter(Boolean));
   if (['instead', 'mejor'].includes(tokens.at(-1))) tokens.pop();
   const prefix = TEXT_REQUEST_PREFIXES.find(phrase => phraseAt(tokens, 0, phrase));
   if (prefix) tokens = trimAnswerWrappers(tokens.slice(prefix.length));
   const body = tokens.join(' ');
   if (!body) return false;
   if (onlyAffirmative(body, words)) return true;
   const channel = value => onlyAffirmative(value, [...TEXT_CHANNELS, ...extra]);
   if (channel(body) || /^(?:text|message) me$|^escrib(?:eme|ame)$/.test(body)) return true;
   const delivery = /^(?:by|via|over|por|en|a|to) (.+)$/.exec(body);
   if (delivery && channel(delivery[1])) return true;
   const continuation = /^(?:continue|communicate|chat|talk|carry on|go on|continuar|continua|continuemos|seguir|sigue|sigamos)(?: with me)? (?:by|via|over|por|en) (.+)$/.exec(body);
   if (continuation && channel(continuation[1])) return true;
   const switching = /^(?:switch(?: me)? (?:over )?to|cambiar(?:me)? a|cambia(?:me)? a|pasame a) (.+)$/.exec(body);
   if (switching && channel(switching[1])) return true;
   const sending = /^(?:send me (?:a )?|mandame (?:un )?|enviame (?:un )?)(.+)$/.exec(body);
   return !!sending && channel(sending[1]);
}

/**
 * Whether the answer is the keypad key `key` with nothing around it but courtesy ("1 please", "um 2", "2 gracias") and,
 * when `yesOk`, a YES word ("yes 1", "sí, 1"). Owner decision 2026-10-15: "Yes 1" at "tell me the product number" was
 * missed. Anything else around the key ("no 1", "1 or 2", "I paid 1 already") is not that key.
 */
// Words that name the key itself when said right before it: "el número 4", "opción 2", "number 4", "the 4" (prod
// 2026-10-25 18:25: "Número 4" and "El número 4" at a numbered product list were not understood, twice).
const KEY_NAMES = new Set(['number', 'numero', 'option', 'opcion', 'item', 'choice', 'the', 'el', 'la'].map(normalize));
function keyWithOnlyCourtesy(b, key, yesOk) {
   const tk = String(b).replace(/\./g, ' ').split(' ').filter(Boolean);
   const at = tk.reduce((acc, t, i) => (t === key ? [...acc, i] : acc), []);
   if (at.length !== 1) {
      return false;
   } else {
      let from = at[0];
      while (from > 0 && at[0] - from < 2 && KEY_NAMES.has(tk[from - 1])) from--;
      const rest = tk.filter((t, i) => i < from || i > at[0]).join(' ');
      return onlyAffirmative(rest, yesOk ? ANSWER_WORDS.yes : [], false);
   }
}

/**
 * Whether the answer is a `kind` answer ('yes' | 'no' | 'agent' | 'exit' | 'text'), with the caller's `extra` words.
 * YES, AGENT and TEXT never match a negated answer ("not sure", "I don't want an agent"); 0 is AGENT, * is EXIT.
 */
export function isAnswer(input, kind, extra = []) {
   const words = [...(ANSWER_WORDS[kind] || []), ...(Array.isArray(extra) ? extra : [])];
   const b = normalize(input);
   if (!b) {
      return false;
   } else if (kind === 'agent' && b === '0') {
      return true;
   } else if (kind === 'exit' && b === '*') {
      return true;
   } else if ((kind === 'yes' || kind === 'agent' || kind === 'text') && hasNegation(b)) {
      return false;
   } else if (kind === 'yes') {
      return onlyAffirmative(b, words);
   } else if (kind === 'text') {
      return textRequest(input, words, Array.isArray(extra) ? extra : []);
   } else {
      return matchesChoice(b, words);
   }
}

/** Whether the WHOLE answer asks for a person ("agent", "I want to talk to a representative", "0") — for free-text prompts. */
export function isAgentRequest(input) {
   // the period normalize() keeps for emails is not part of the answer at its ends ("Operator." on a call, 2026-10-17)
   const b = normalize(input).replace(/^[.\s]+|[.\s]+$/g, '');
   return b === '0' || (!hasNegation(b) && AGENT_ONLY.test(b));
}

// A spoken or typed number: a digit, or a number word (ASR usually writes digits, not always).
const NUMBER_WORD = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciséis|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veinti\w+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|cientos|mil)\b/;
const EMAIL_SHAPE = /@|\b(at|arroba|dot|punto|gmail|hotmail|yahoo|outlook|icloud|aol)\b/;
// An address being spelled: a spelled symbol, or three or more single letters or digits of which at least two are not
// also words ("S o n. N y underscore.", "L e, o s"). The single-letter words a, e, i, o, u, y fill ordinary sentences
// ("quiero ver mi saldo y a la vez pagar o algo"), so they alone never make a spelling.
const SPELLING_WORD = /\b(underscore|guion|gui[oó]n bajo|dash|hyphen)\b/;
const isSpelling = (b) => {
   const singles = b.split(' ').map((w) => w.replace(/[.,]$/, '')).filter((w) => /^[a-z0-9]$/.test(w));
   return SPELLING_WORD.test(b) || (singles.length >= 3 && singles.filter((w) => !'aeiouy'.includes(w)).length >= 2);
};

/** Whether the answer is (part of) a spelled address — letters said one at a time, or a spelled symbol. */
export function isSpelledFragment(input) {
   const b = normalize(input);
   return !/@|\b(?:at|arroba)\b/.test(b) && isSpelling(b);
}
const SHAPES = {
   number: (b) => /\d/.test(b) || NUMBER_WORD.test(b),
   email: (b) => EMAIL_SHAPE.test(b) || isSpelling(b),
   contact: (b) => /\d/.test(b) || NUMBER_WORD.test(b) || EMAIL_SHAPE.test(b) || isSpelling(b),
};

/**
 * Whether a free-text answer to a question that expects a `kind` ('number' | 'email' | 'contact') is the caller
 * changing direction ("what's my balance?" to "how much would you like to pay?") rather than an attempt at the answer:
 * three or more words, none of them the expected shape. Such an answer is DISPATCHed, never counted as a failed try.
 * A short miss ("what?") is not: the asking flow re-asks it.
 */
export function isOtherRequest(input, kind) {
   const b = normalize(input);
   const shape = SHAPES[kind];
   if (!shape) {
      return false;
   } else if (shape(b)) {
      return false;
   } else {
      return b.split(' ').filter((w) => /[a-záéíóúüñ]/.test(w)).length >= 3;
   }
}

// An answer that names an amount: a currency sign or word, cents, or a number with decimals.
const AMOUNT_ANSWER = /\$|\b(dollars?|d[oó]lar(es)?|bucks?|cents?|centavos?)\b|\d[.,]\d{1,2}\b/i;

/**
 * Whether the answer names an amount ("$1", "1 dollar", "un dólar", "50 cents", "12.50") rather than a keypad key.
 * Such an answer never picks a digit choice (pickChoice): "$1" said at "press 1 to pay what is due" chose FULL and
 * the caller was offered $235.90 (2026-10-14).
 */
export function isAmountAnswer(input) {
   return AMOUNT_ANSWER.test(String(input ?? '').replace(/\\(['"\\])/g, '$1'));
}

// A number that names something other than an amount: an account or sub-account, a card's last digits, a code, a ZIP.
const IDENTIFIER_NUMBER = /\b(?:sub[\s-]?accounts?|accounts?|subcuentas?|cuentas?|cards?|tarjetas?|ending(?:\s+in)?|terminad[ao]s?\s+en|que\s+termina(?:\s+en)?|termina(?:\s+en)?|codes?|c[oó]digos?|zip(?:\s+code)?|postal|n[uú]mero|number)\s*(?:de\s+|is\s+|es\s+)?\d[\d\s-]*/gi;
// Digits spoken one at a time ("2 4 8 6"): a card ending or a code read back, never an amount.
const SPELLED_DIGITS = /\b\d(?:\s+\d\b){2,}/g;
// "10 con 18 centavos", "10 dollars and 18 cents", "$10 y 18 centavos"; speech-to-text also writes "76 con50 centavos", and
// callers say "171 con un 6 centavos" (owner 2026-10-18; a prod call went to the guru): an "un" before the cents.
const DOLLARS_AND_CENTS = /(\d+)\s*(?:dollars?|d[oó]lar(?:es)?|bucks?)?\s*(?:and|con|y)\s*(?:un\s+)?(\d{1,2})\s*(?:cents?|centavos?)\b/i;
// Dollars joined to two cent digits with no word for cents: "82 dollars and 50", "$82 y 50", "82 con 50". The joiner
// makes the second number cents when the first is marked as dollars ($ or a dollar word), or always for a joiner in
// CENTS_JOINERS (the languages that say amounts that way: Spanish "ochenta y dos con cincuenta") when two digits follow.
// "82 dollars and 5" is $82.05; "82 and 50" is $82.50; an unmarked "82 con 5", "82 and 5" or "82 y 50" stays two numbers. An "un" before the
// cents is allowed ("171 con un 06").
const CENTS_JOINERS = ['con', 'and'];   // 'and' too (owner 2026-10-18: "87 and 21" = $87.21)
const DOLLARS_JOINED_CENTS = /(\$\s*)?(\d+)(\s*(?:dollars?|d[oó]lar(?:es)?|bucks?))?\s*(and|con|y)\s*(?:un\s+)?(\d{1,2})\b(?!\s*\d)/gi;

/**
 * The amount an answer names, or NaN when it names none or is ambiguous. Prod replay 2026-10-14: the first number in the
 * answer was taken, so "pagar cuenta 50, ciento treinta y cuatro…" paid $50, "$10 con 18 centavos" paid $10.00 and an
 * offer read back with "terminada en 2 4 8 6" paid $2. Numbers that name an account, card, code or ZIP, and digits spoken
 * one by one, are not amounts; two different remaining numbers are ambiguous unless exactly one is marked as money ($,
 * dollars, cents or decimals). "50 cents" alone is $0.50; "82 dollars and 50" and "82 con 50" are $82.50. Amounts said only in words are NaN (not parsed yet).
 */
export function amountInAnswer(input) { return numericAmountReading(input).value; }

/** Internal numeric evidence shared by the opt-in money reader; legacy results stay unchanged. */
export function numericAmountReading(input) {
   const raw = String(input ?? '').replace(/\\(['"\\])/g, '$1');
   // A connector plus cents is a fragment of another amount, not a new standalone payment.
   // A caller can instead explicitly request "51 cents" or provide the complete dollars and cents.
   if (/^\s*(?:and|con|y)\s*(?:un\s+)?\d{1,2}\s*(?:cents?|centavos?)\b/i.test(raw)) return {value:NaN,candidates:0};
   // Last-four references (including a repeated unlabelled number) do not supply an amount.
   // Mixed answers with an explicit monetary marker or payment verb still parse their independent amount.
   if (/\b(?:cards?|tarjetas?|ending|termina(?:d[ao]s?)?|visa|mastercard|amex|discover)\b/i.test(raw) && !isAmountAnswer(raw) && !/\b(?:pay|paying|pagar|abonar)(?:\b|(?=\d))/i.test(raw)) return {value:NaN,candidates:0};
   // 1.234,56 (European) → 1234.56; 1,234.56 → 1234.56; 12,50 → 12.50
   let t = /\d{1,3}(\.\d{3})+,\d{1,2}\b/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,(?=\d{3}\b)/g, '').replace(/(\d),(\d{1,2})\b/g, '$1.$2');
   const dc = t.match(DOLLARS_AND_CENTS);
   if (dc) {
      t = t.replace(DOLLARS_AND_CENTS, () => ` $${dc[1]}.${dc[2].padStart(2, '0')} `);
   } else {
      // no dollars-and-cents phrase
   }
   t = t.replace(IDENTIFIER_NUMBER, ' ').replace(SPELLED_DIGITS, ' ').replace(DOLLARS_JOINED_CENTS, (m, sign, d, word, joiner, c) => (sign || word || (CENTS_JOINERS.includes(joiner.toLowerCase()) && c.length === 2) ? ` $${d}.${c.padStart(2, '0')} ` : m));
   const found = [...t.matchAll(/(\$\s*)?(\d+(?:\.\d{1,2})?)(\s*(?:dollars?|d[oó]lar(?:es)?|bucks?|cents?|centavos?)\b)?/gi)]
      .map((m) => ({ v: parseFloat(m[2]), marked: !!(m[1] || m[3] || m[2].includes('.')), cents: !m[1] && /cent/i.test(m[3] || '') }));
   const values = [...new Set(found.map((f) => f.v))];
   let pick = null;
   if (values.length === 1) {
      pick = found[0];
   } else if (values.length > 1) {
      const marked = found.filter((f) => f.marked);
      pick = new Set(marked.map((f) => f.v)).size === 1 ? marked[0] : null;
   } else {
      // no number at all
   }
   if (!pick) {
      return {value:NaN,candidates:found.length};
   } else {
      // Cents alone only when nothing else was said: "76 con50 centavos" read as $0.50 (prod, 10-15).
      return {value:pick.cents ? (values.length === 1 ? Math.round(pick.v) / 100 : NaN) : pick.v,candidates:found.length};
   }
}

// Number words a caller says for a keypad key (prod 2026-10-16 7:07 AM: "dos" at "presione 2 o diga NO" was re-asked).
const KEY_WORDS = { cero: '0', zero: '0', uno: '1', una: '1', one: '1', dos: '2', two: '2', tres: '3', three: '3', cuatro: '4',
   four: '4', cinco: '5', five: '5', seis: '6', six: '6', siete: '7', seven: '7', ocho: '8', eight: '8', nueve: '9', nine: '9' };
/** The normalized answer with each number word replaced by its digit ("dos por favor" → "2 por favor"). */
function spokenKeys(b) {
   return String(b).replace(/\./g, ' ').split(' ').filter(Boolean).map((t) => KEY_WORDS[t] ?? t).join(' ');
}

/**
 * ask-choice's matcher: the key of the choice the answer picks, '__agent', '__exit', or '' (no choice).
 * choices: [{ key, phrases, negative?, neutral?, exact? }]. A key (digit, * or #) and a YES word pick a choice only as the whole
 * answer, courtesy aside (onlyAffirmative); an `exact` choice (one that charges or cancels) treats ALL its words that way. A choice keyed 'yes' also takes ANSWER_WORDS.yes (CONFIRM_WORDS when `exact`) and, when not `exact`, a bare thanks (THANKS), and the NO-type
 * choice (key no / decline / done / cancel, or negative: true) also takes ANSWER_WORDS.no, so callers list only their
 * extras. A word after a negation in its clause is negated: it picks the NO-type choice; a `neutral` choice still
 * matches unless it follows its negation within two words; any other choice is blocked and NO answers. A deferral
 * (later, mañana) answers NO; a reply led by a bare 'no' turns YES into NO. With acceptOther, AGENT only when the
 * whole answer is an agent request and EXIT only on exit/quit/salir/abort (cancel is an answer there).
 */
export function pickChoice(answer, choices, acceptOther) {
   const raw = String(answer ?? '').replace(/\\(['"\\])/g, '$1');
   const b = normalize(raw);
   const pos = [];
   const negs = [];
   raw.split(/[,;!?]|\.\s|\s(?:but|pero)\s/i).map(normalize).forEach((clause) => {
      const tk = clause.split(' ');
      const k = tk.findIndex((t) => NEGATION_SET.has(t));
      if (k < 0) {
         pos.push(clause);
      } else {
         pos.push(tk.slice(0, k).join(' '));
         negs.push(tk.slice(k).join(' '));
      }
   });
   const P = pos.join(' ~ ');
   const N = negs.join(' ~ ');
   const refused = (w) => {
      const wt = w.split(' ');
      return negs.some((r) => {
         const tk = r.split(' ');
         for (let q = 1; q < tk.length && q <= 2; q++) {
            if (tk.slice(q, q + wt.length).join(' ') === w) {
               return true;
            } else {
               // not at this offset
            }
         }
         return false;
      });
   };
   const leadNo = /^(no|nope|nah|no thanks|no gracias)$/.test(normalize(raw.split(/[,;!?]|\.\s/)[0]));
   const cs = Array.isArray(choices) ? choices.filter((c) => c && c.key) : [];
   const isNoType = (c) => ['no', 'decline', 'done', 'cancel'].includes(c.key) || c.negative === true;
   const noChoice = (cs.find(isNoType) || {}).key || '';
   const deferral = DEFERRAL.test(b);
   const amount = isAmountAnswer(raw);   // an amount never picks a keypad key
   const spoken = spokenKeys(b);          // "dos", "two": a key said as a word picks what the digit would
   let blocked = false;
   let found = '';
   for (const c of cs) {
      const own = Array.isArray(c.phrases) ? c.phrases : Array.isArray(c.words) ? c.words : [];
      const all = c.key === 'yes' ? [...own, ...(c.exact === true ? CONFIRM_WORDS : ANSWER_WORDS.yes)] : (c.key === noChoice ? [...own, ...ANSWER_WORDS.no] : own);
      // Strict words pick this choice only when they are the whole answer (onlyAffirmative): a key, a YES word, or — on an
      // `exact` choice (one that charges or cancels) — every word. The rest (named actions: LINK, RECEIPT…) match inside it.
      const strict = all.filter((w) => c.exact === true || /^[0-9*#]$/.test(String(w).trim()) || YES_SET.has(normalize(w)))
         .filter((w) => !(amount && /^\d+$/.test(String(w).trim())));
      const isKey = (w) => /^[0-9*#]$/.test(String(w).trim());
      const keyed = (w) => isKey(w) && (matchesChoice(raw, [w]) || keyWithOnlyCourtesy(b, String(w).trim(), !isNoType(c)) || (spoken !== b && keyWithOnlyCourtesy(spoken, String(w).trim(), !isNoType(c))));
      // A question is not a confirmation: "sure?" or "1?" never picks a choice that charges or cancels.
      if (c.exact === true && /[?¿]/.test(raw)) {
         // not this choice
      } else if (strict.some(keyed) || onlyAffirmative(b, [...strict.filter((w) => !isKey(w)), ...(c.key === 'yes' && c.exact !== true ? THANKS : [])], true, c.exact === true ? (c.key === 'yes' ? ACKNOWLEDGEMENTS : [...ACKNOWLEDGEMENTS, ...CONFIRM_FILLER, ...ARTICLES]) : (c.key === 'yes' ? POINTERS : []))) {
         found = c.key;
         break;
      } else {
         // not by a strict word
      }
      for (const w of all.map(normalize).filter((w) => !strict.map(normalize).includes(w) && !/^[0-9*#]$/.test(w) && !(c.exact === true))) {
         if (!w || (amount && /^\d+$/.test(w))) {
            continue;
         } else if (c.key === noChoice || c.key === 'no' || c.negative === true || hasNegation(w)) {
            if (matchesChoice(b, [w])) {
               found = c.key;
            } else {
               // a NO-type word matches the whole answer only
            }
         } else if (matchesChoice(P, [w])) {
            found = c.key;
         } else if (matchesChoice(N, [w])) {
            if (c.neutral === true && !refused(w)) {
               found = c.key;
            } else {
               blocked = true;
            }
         } else {
            // not this word
         }
         if (found) {
            break;
         } else {
            // keep looking
         }
      }
      if (found) {
         break;
      } else {
         // next choice
      }
   }
   if (noChoice && deferral && found !== noChoice) {
      return noChoice;
   } else if (found === 'yes' && leadNo && noChoice) {
      return noChoice;
   } else if (found) {
      return found;
   } else if (blocked && noChoice) {
      return noChoice;
   } else if ((b === '0' && !amount) || (!hasNegation(b) && !b.includes('@') && (AGENT_ONLY.test(b) || (!acceptOther && matchesChoice(b, ANSWER_WORDS.agent.filter((w) => !AGENT_AMBIGUOUS.has(w))))))) {
      return '__agent';
   } else if (b === '*' || (acceptOther ? /^(exit|quit|salir|abort)( please| por favor)?$/ : /^(exit|quit|salir|abort|cancel|cancelar)( please| por favor)?$/).test(b)) {
      return '__exit';
   } else {
      return '';
   }
}
