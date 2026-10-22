/** Opt-in currency grammar. Existing amountInAnswer/isAmountAnswer retain their published 1.6 semantics. */
import {numericAmountReading} from './answer.js';
import {scanSpokenMoney} from './spoken-money.js';

/** A profile must declare its currency; currently only USD grammar is supported. No exchange-rate inference. */
export function validateMoneyOptions(options) {
   if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['currency','cardinals','intent'].includes(key))||options.currency!=='USD'||options.cardinals!==undefined&&typeof options.cardinals!=='boolean'||options.intent!==undefined&&options.intent!=='payment')throw new Error('Money options require currency USD, optional boolean cardinals and optional payment intent');
   return options;
}
/** One declared intent acceptance rule, shared by parsing and domain validation. Uncertainty is not refusal. */
export function moneyIntentAllows(input,intent) {
   if(intent===undefined||intent===null||intent==='')return true;
   if(intent!=='payment')throw new Error('Unsupported money intent');
   const raw=String(input??'').replace(/\\(['"\\])/g,'$1').toLowerCase().replace(/[’‘]/g,"'");
   const refused=/\b(?:can't|cannot|can not|won't|will not|don't|do not|refuse to)\s+(?:want\s+to\s+)?pay(?:\b|(?=\d))|\bno\s+(?:lo\s+)?(?:se\s+)?(?:puede|pudo|puedo|quiero|voy\s+a)\s+pagar(?:\b|(?=\d))/.test(raw);
   const unable=/\b(?:unable|not able)\s+to\s+pay(?:\b|(?=\d))|\bno\s+(?:soy|somos|es|son)\s+capaz(?:es)?\s+de\s+pagar(?:\b|(?=\d))|\bincapaz\s+de\s+pagar(?:\b|(?=\d))|\b(?:no\s+(?:me\s+)?es\s+posible|me\s+es\s+imposible|no\s+podr[eé])\s+pagar(?:\b|(?=\d))/.test(raw);
   const deferred=/\b(?:pay|paying|pagar|abonar)(?:\b|(?=\d))/.test(raw)&&/\b(?:later|tomorrow|next week|not today|despu[eé]s|m[aá]s tarde|ma[nñ]ana|hasta)\b/.test(raw);
   return !refused&&!unable&&!deferred&&!isPastPaymentStatement(raw);
}
/** A cents-only continuation needs a complete amount; it is not an independent replacement. */
export function isPartialMoneyAnswer(input) {
   return /^\s*(?:and|con|y)\s*(?:un\s+)?\d{1,2}\s*(?:cents?|centavos?)\b/i.test(String(input??''));
}
/** Reports of money already paid cannot supply prospective payment amounts or consent. */
export function isPastPaymentStatement(input) {
   const raw=String(input??'').replace(/\\(['"\\])/g,'$1').toLowerCase().replace(/[’‘]/g,"'");
   return /(?<!\b(?:what|that|than|as|if|when|whether)\s)\b(?:i|we)(?:'ve|\s+have|\s+had)?\s+(?:already\s+|just\s+|recently\s+)*paid\b|\b(?:already|just)\s+paid\b|(?<!\b(?:no|nunca|que|cuando)\s)\b(?:ya\s+)?pagu[eé](?![a-záéíóúüñ])|\b(?:acabo|acabamos)\s+de\s+pagar\b/.test(raw);
}
function unsupportedCurrency(raw) {
   return /(?:^|[^a-záéíóúüñ])(?:pesos?|mxn|euros?|eur|pounds?|gbp|yen|jpy|cad|aud|nzd|hkd|sgd|chf|canadian|canadienses?|australian|australianos?)(?![a-záéíóúüñ])|[€£¥₱₹₩₽]|\bmx\s*\$/i.test(raw);
}
function negativeAmount(raw) {
   return /\b(?:minus|negative|menos|negativo)\b|(?:^|[\s,(;:])[-−]\s*\$?\s*(?:\d|[a-záéíóúüñ])/i.test(raw);
}
/** Explicit identifier labels cannot become amounts merely because their number words precede a currency. */
function introducedAsIdentifier(raw,start) {
   return /\b(?:sub[ -]?accounts?|accounts?|subcuentas?|cuentas?|cards?(?:\s+number)?|tarjetas?|ending(?:\s+in)?|terminad[ao]s?\s+en|que\s+termina\s+en|termina\s+en|codes?|c[oó]digos?|zip(?:\s+code)?|postal|n[uú]mero|number)\s*(?:de\s+|is\s+|es\s+)?$/i.test(raw.slice(0,start));
}
/** Number or NaN. currency is required; cardinals defaults false and intent is optional.
 * Explicit foreign currencies, negative amounts and independent unequal readings fail closed.
 * Refusal is rejected only under the explicitly declared payment intent; it never grants consent.
 */
export function readMoneyAmount(input,options) {
   validateMoneyOptions(options);
   const raw=String(input??'').replace(/\\(['"\\])/g,'$1');
   if(unsupportedCurrency(raw)||negativeAmount(raw)||!moneyIntentAllows(raw,options.intent))return NaN;
   const {readings,invalid}=scanSpokenMoney(raw);
   if(invalid.length||options.cardinals!==true&&readings.length||readings.some(reading=>introducedAsIdentifier(raw,reading.start)))return NaN;
   const numeric=readings.reduce((text,reading)=>text.slice(0,reading.start)+' '.repeat(reading.end-reading.start)+text.slice(reading.end),raw);
   const remaining=numericAmountReading(numeric);
   if(!readings.length)return remaining.value;
   if(remaining.candidates&&Number.isNaN(remaining.value))return NaN;
   const values=readings.map(reading=>reading.value).concat(Number.isNaN(remaining.value)?[]:[remaining.value]);
   return new Set(values).size===1?values[0]:NaN;
}
/** True exactly when the opted-in reader returns a finite amount (bare digits included). */
export function isMoneyAmount(input,options) {return Number.isFinite(readMoneyAmount(input,options));}
