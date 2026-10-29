/** Opt-in currency grammar. Existing amountInAnswer/isAmountAnswer retain their published 1.6 semantics. */
import {numericAmountReading} from './answer.js';
import {scanSpokenMoney} from './spoken-money.js';

/** A profile must declare its currency; currently only USD grammar is supported. No exchange-rate inference. */
export function validateMoneyOptions(options) {
   if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['currency','cardinals','intent'].includes(key))||options.currency!=='USD'||options.cardinals!==undefined&&typeof options.cardinals!=='boolean'||options.intent!==undefined&&options.intent!=='payment')throw new Error('Money options require currency USD, optional boolean cardinals and optional payment intent');
   return options;
}
// This is an input grammar, not a conversation classifier. Anything outside one complete
// monetary answer belongs to DISPATCH, including refusals, corrections with context and reports. "157 95" is dollars and
// cents said with no word between them (owner 2026-10-29); "95 52" is not (a card's last four read in pairs).
const NUMERIC_MONEY=/^(?:\$\s*)?(?:\d{1,3}(?:[,.]\d{3})+|\d+)(?:[.,]\d{1,2})?(?:\s*(?:dollars?|d[oó]lar(?:es)?|bucks?))?(?:\s*(?:and|con|y)\s*(?:un\s*)?\d{1,2}(?:\s*(?:cents?|centavos?))?)?$|^\d{1,2}\s*(?:cents?|centavos?)$|^(?:\$\s*)?(?:\d|\d{3,})\s+\d{2}$/i;
const PAYMENT_PREFIX=/^(?:(?:i (?:want to|would like to|can|am able to|will) |i['’]d like to )?pay|(?:quiero |quisiera |puedo |s[ií] puedo |voy a )?(?:pagar|abonar)|(?:no,?\s+)?make it)\s*(?=\$|\d|[a-záéíóúüñ])/i;
const ACCOUNT_PREFIX=/^(?:(?:sub[ -]?account|subcuenta|cuenta)\s+\d{1,8}\s*,\s*)/i;
const DIGIT_WORD='(?:zero|one|two|three|four|five|six|seven|eight|nine|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)';
const CARD_SUFFIX=new RegExp('\\s+(?:with (?:the |my )?card(?: (?:ending(?: in)?|number))?|con (?:la |mi )?tarjeta(?: (?:que termina en|terminad[ao] en))?)\\s+(?:\\d(?:[ -]?\\d){3}|'+DIGIT_WORD+'(?: '+DIGIT_WORD+'){3})$','i');
const ACCOUNT_SUFFIX=/\s+(?:(?:on|to) (?:sub[ -]?account|account)|(?:a|en) (?:la )?(?:subcuenta|cuenta))\s+\d{1,8}$/i;
function completeMoneyAnswer(input) {
   let raw=String(input??'').replace(/\\(['"\\])/g,'$1').trim().replace(/^[¡!]+|[.!]+$/g,'').trim();
   raw=raw.replace(/^(?:please|por favor)[, ]+/i,'').replace(/[, ]+(?:please|por favor)$/i,'').trim();
   raw=raw.replace(PAYMENT_PREFIX,'').replace(ACCOUNT_PREFIX,'').replace(CARD_SUFFIX,'').replace(ACCOUNT_SUFFIX,'').trim();
   if(NUMERIC_MONEY.test(raw))return true;
   const {readings,invalid}=scanSpokenMoney(raw);
   return !invalid.length&&readings.length===1&&readings[0].start===0&&readings[0].end===raw.length;
}
/** Accept only a complete monetary answer or a simple explicit payment instruction.
 * A false result makes no claim about intent, refusal, tense or the caller's next request. */
export function moneyIntentAllows(input,intent) {
   if(intent===undefined||intent===null||intent==='')return true;
   if(intent!=='payment')throw new Error('Unsupported money intent');
   return completeMoneyAnswer(input);
}
/** A cents-only continuation needs a complete amount; it is not an independent replacement. */
export function isPartialMoneyAnswer(input) {
   return /^\s*(?:and|con|y)\s*(?:un\s+)?\d{1,2}\s*(?:cents?|centavos?)\b/i.test(String(input??''));
}
/** Compatibility predicate for a whole short historical report, never a search through prose.
 * Payment collectors do not use this to route or answer the caller; DISPATCH owns that decision. */
export function isPastPaymentStatement(input) {
   const raw=String(input??'').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[.!]+$/,'').trim();
   return /^(?:(?:i|we)(?:'ve| have)? (?:already |just )?paid|(?:ya )?pagu[eé])(?: \$?\d+(?:[.,]\d{1,2})?(?: (?:dollars?|d[oó]lares?))?)?$/.test(raw);
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
 * Payment intent accepts a bounded whole answer; unrelated prose is never mined for an amount or consent.
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
