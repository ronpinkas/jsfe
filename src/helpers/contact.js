/**
 * Reading a contact out of a customer's answer, ONE way for every flow set (APPROVED_FUNCTIONS readEmail, readPhone,
 * readIdentifier), saying it back masked (last4, maskEmail), and where a text can reach the customer
 * (callerTextNumber, textDestination). Before it, an email was read four different ways: only ask-email understood a spoken or spelled
 * address ("juan at gmail dot com", "j u a n arroba gmail punto com"), so the same answer worked for a statement and
 * failed at the identity question (flow design review 2026-10-13).
 *
 * An email and a phone claim the part of the answer they were read from, and a number inside the email is never read as
 * another field (owner 2026-11-24: the longest match wins; a fragment of a match is never another field's). When the email
 * and a complete phone overlap, the one that begins first keeps its part (a tie: the phone) and the other is read again on
 * the rest. Prod 2026-11-23: the digits inside an address were read as an account number, an address's digits joined an
 * account number into a phone, and a phone typed before an address became the start of the address.
 *
 * Part of jsfe/helpers; imports its sibling numbers.js.
 */
import { findNumbers } from './numbers.js';

// Words that introduce an address and are never part of it ("my email is", "mi correo es", "send it to").
const EMAIL_LEAD_IN = new Set(['my', 'mi', 'su', 'your', 'email', 'e-mail', 'mail', 'correo', 'electronico', 'electrónico',
   'address', 'dirección', 'direccion', 'de', 'is', 'es', "it's", 'its', 'it', 'the', 'el', 'la', 'to', 'para', 'send',
   'sent', 'envíalo', 'envialo', 'envía', 'envia', 'mandalo', 'mándalo', 'use', 'usa', 'please', 'por', 'favor', 'and', 'y',
   'yes', 'yeah', 'yep', 'si', 'sí', 'ok', 'okay', 'sure', 'claro', 'hi', 'hello', 'hola', 'um', 'uh', 'eh', 'this', 'thats',
   "that's", 'here', 'aqui', 'aquí', 'with', 'con', 'try', 'now', 'ahora']);

/**
 * The email address in the answer, lowercased, or ''. At / arroba and dot / punto may be spoken, and the name before
 * the @ may come in several pieces ("J. A Garcia at example.com", "j u a n", "Maria jose@example.com"): every piece
 * back to the first lead-in word ("my email is", "mi correo es") is kept and joined. On a call the address is read
 * back for a YES / NO, so a misheard piece can be corrected; a dropped one could not. Accents are dropped from the
 * name (an address cannot carry them), and only the last @ counts.
 * With `{literal:true}`, a complete visible address wins over surrounding prose; absent one,
 * the same spoken/spelled parsing applies. Distinct visible addresses are ambiguous and return empty.
 */
export function readEmail(text, options = {}) {
   return emailClaim(text, options).email;
}

/** readEmail's reading of the whole answer, before any phone claims its part. */
function rawEmail(text, { literal = false } = {}) {
   // Contextual prose must not become part of an already complete, visible address. This
   // explicit mode preserves the default spoken/spelled-name grammar for existing callers.
   if (literal) {
      const addresses = [...String(text ?? '').matchAll(/(?<![a-z0-9._%+@-])([a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,})(?![a-z0-9_@-])/gi)].map(match=>match[1].toLowerCase());
      if (addresses.length) return new Set(addresses).size === 1 ? addresses[0] : '';
   }
   let spoken = String(text ?? '')
      // how speech engines write the commonest providers and endings (prod 2026-11-10..17): "g mail", "Gmaildot",
      // "punt com", "ponto com", "Gmail com"
      .replace(/\b(?:g[\s-]mail|gee\s?mail|gmai|gmial|gamil|gmaill)\b/gi, 'gmail')
      .replace(/\b(gmail|hotmail|yahoo|outlook|icloud|aol)dot\b/gi, '$1')   // its "com" was lost: read as the bare provider
      .replace(/(?:^|\s+)(?:at|arroba)\s+/gi, ' @ ')
      .replace(/\s+(?:dot|punto|punt|ponto)\s+/gi, '.')
      .replace(/\b(gmail|hotmail|yahoo|outlook|icloud|aol)\s+(?:com|con)\b/gi, '$1.com')
      .replace(/\s+(?:underscore|gui[oó]n bajo)[.,]?(?:\s+|$)/gi, '_')
      .replace(/\s+(?:dash|hyphen|gui[oó]n)[.,]?(?:\s+|$)/gi, '-');
   // a provider with its ending and no "at" (the speech engine dropped it): "Castillo Mónica 22 Gmail punto com"
   const inferred = !spoken.includes('@') && PROVIDER_WITH_ENDING.test(spoken);
   if (inferred) {
      spoken = spoken.replace(PROVIDER_WITH_ENDING, ' @ $1');
   } else {
      // the @ was said or typed, or there is none
   }
   const at = spoken.lastIndexOf('@');   // a speech engine may write an @ inside the name too: the last one is the address's
   if (at < 0) {
      return '';
   } else {
      // a spelled domain arrives in pieces ("gm a i l.com", "y a h o o . c o m"): join them up to its top-level domain
      const after = spoken.slice(at + 1).trim();
      const spelled = after.match(/^[a-z0-9-]+(?:\s+[a-z0-9-]+){1,12}?(?:\s*\.\s*(?:[a-z]{2,}|[a-z](?:\s+[a-z]){1,2})\b){1,2}/i);
      const domain = (spelled ? spelled[0].replace(/\s+/g, '') : (after.match(/^[^\s@]+/) || [''])[0]).replace(/[.,;:!?]+$/, '');
      const pieces = spoken.slice(0, at).replace(/@/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[\s,;:!?]+/).map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')).filter(Boolean);
      const local = [];
      for (let k = pieces.length - 1; k >= 0 && local.join('').length < 64; k--) {
         // a one-letter lead-in ("y" = and) beside another single letter is a spelled letter ("s o n n y")
         if (EMAIL_LEAD_IN.has(pieces[k].toLowerCase()) && !(pieces[k].length === 1 && k > 0 && pieces[k - 1].length === 1)) {
            break;
         } else {
            local.unshift(pieces[k]);
         }
      }
      // "gmail dot" cut short (a window of "gmail dot com") is no bare gmail
      const fixed = /^\s*(?:dot|punto|punt|ponto)\b/i.test(after.slice(after.toLowerCase().indexOf(domain.toLowerCase()) + domain.length)) ? domain : providerDomain(domain);
      const email = (local.join('') + '@' + fixed).toLowerCase();
      // a guessed @ or ending needs a name with a letter: "8 4 Gmail punto com" is the end of an address given across turns
      const guessed = inferred || fixed !== domain.toLowerCase();
      return /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) && (!guessed || /[a-z]/i.test(local.join(''))) ? email : '';
   }
}

/**
 * An address at a known provider said without its ending ("Cecilia 41, at Yahoo."): its name and provider
 * ("cecilia41@yahoo"), so the caller is asked only for what comes after the provider (owner 2026-11-18, prod 11-18 17:30:
 * the whole address was asked again). gmail is completed by readEmail; an unknown domain is never guessed, so it is ''.
 */
export function emailWithoutEnding(text) {
   const t = String(text ?? '').trim().replace(/[.,;:!?]+$/, '');
   if (!t || readEmail(t) || !/\b(?:hotmail|hot mail|yahoo|outlook|icloud|aol)\s*$/i.test(t)) {
      return '';
   } else {
      const whole = readEmail(t.replace(/hot mail\s*$/i, 'hotmail') + ' dot com');
      const m = whole.match(/^(.+@(?:hotmail|yahoo|outlook|icloud|aol))\.com$/);
      return m ? m[1] : '';
   }
}

/**
 * The ending a caller gives on its own after being asked what comes after the provider ("Punto com.", "dot net",
 * ".com", "com", "punto com punto mx"): ".com", ".net", ".es", ".com.mx" … or '' for any other reply. Whole reply only.
 */
export function emailEnding(text) {
   const t = String(text ?? '').trim().toLowerCase().replace(/[!?,;]+$/, '').replace(/\.$/, '').trim();
   const dot = '(?:dot|punto|punt|ponto|\\.)';
   const m = t.match(new RegExp('^(?:' + dot + '\\s*)?(com|con|net|org|edu|es|mx|co)(?:\\s*' + dot + '?\\s*(mx|uk|ar|co|es))?$'));
   if (!m) {
      return '';
   } else {
      return '.' + (m[1] === 'con' ? 'com' : m[1]) + (m[2] ? '.' + m[2] : '');
   }
}

/** An address as it is read back: on a call letter by letter, with at / dot (arroba / punto) said as words. */
export function emailSaid(address, voice, es = false) {
   const said = String(address || '');
   return voice ? said.split('').join(' ').replace(/ @ /, es ? ' arroba ' : ' at ').replace(/ \. /g, es ? ' punto ' : ' dot ').replace(/ _ /g, es ? ' guion bajo ' : ' underscore ').replace(/ - /g, es ? ' guion ' : ' dash ') : said;
}

const PROVIDER_WITH_ENDING = /\s+((?:gmail|hotmail|yahoo|outlook|icloud|aol)\.(?:com|net|es|com\.mx|co\.uk)\b)/i;

/**
 * A provider's domain as callers say it: "gmail" alone is gmail.com (the one consumer Gmail address), and a misheard
 * ending of a known provider (".con", ".cmo") is ".com". Another provider without its ending is left alone: hotmail and
 * yahoo have country domains, so the caller is asked again (owner 2026-11-17).
 */
function providerDomain(domain) {
   const d = domain.toLowerCase();
   if (d === 'gmail') {
      return 'gmail.com';
   } else if (/^(?:gmail|hotmail|yahoo|outlook|icloud|aol)\.(?:con|cmo|calm|come|comm|om)$/.test(d)) {
      return d.replace(/\.[a-z]+$/, '.com');
   } else {
      return d;
   }
}

/**
 * True when an answer tries to give an email address that could not be read: an @, "arroba", or a known provider's name
 * ("at gmail", "Yahoo"), so the caller hears the email was incomplete rather than that a phone number was invalid (prod
 * 2026-11-17: "Juana Perez 12 34 at gmail." heard "the phone number you provided isn't valid").
 */
export function emailAttempt(text) {
   return /@|\barroba\b|\b(?:g\s?mail|gmai|hotmail|hot mail|yahoo|outlook|icloud|aol)\b/i.test(String(text ?? ''));
}

const northAmerican = (digits) => digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.length === 10 ? digits : '';

/** Where the address rawEmail read sits in the answer: [[start, end], ...]. Typed, the address itself; spoken (at / arroba /
 * dot / punto), the shortest run of words that reads as it, with a spoken ending after it. */
export function emailSpans(raw, value) {
   const literal = raw.toLowerCase().indexOf(value);
   if (literal >= 0) return [[literal, literal + value.length]];
   // Spoken addresses may use at / arroba / dot / punto. Select the shortest source window yielding this address.
   const tokens = [...raw.matchAll(/\S+/g)];
   if (tokens.length > 128) return [[0,raw.length]];
   for (let size = 1; size <= tokens.length; size++) {
      const spans = [];
      for (let i = 0; i + size <= tokens.length; i++) {
         const a = tokens[i].index, b = tokens[i+size-1].index + tokens[i+size-1][0].length;
         if (rawEmail(raw.slice(a,b)) === value) {
            // "juan at gmail" already reads as gmail.com: the spoken ending after it belongs to the same address
            let j = i + size;
            while (j < tokens.length && /^(?:dot|punto|punt|ponto|com|con|\.com)[.,;:!?]*$/i.test(tokens[j][0])) j++;
            spans.push([a, j > i + size ? tokens[j-1].index + tokens[j-1][0].length : b]);
         } else {
            // this window is not the address
         }
      }
      if (spans.length) return spans;
   }
   return [[0,raw.length]];
}

const blank = (text, spans) => spans.reduce((out, [a, b]) => out.slice(0, a) + ' '.repeat(b - a) + out.slice(b), text);

/** The email in the answer and the part it claims: {email, spans}. A complete North American phone number overlapping it
 * that begins no later than the email keeps its part, and the email is read again on the rest. */
function emailClaim(text, options = {}) {
   const t = String(text ?? '');
   const email = rawEmail(t, options);
   if (!email) {
      return { email: '', spans: [] };
   } else {
      const spans = emailSpans(t, email);
      const start = Math.min(...spans.map(([a]) => a));
      const phone = findNumbers(t).find((n) => northAmerican(n.value) && spans.some(([a, b]) => n.start < b && n.end > a));
      if (phone && phone.start <= start) {
         const rest = blank(t, [[phone.start, phone.end]]);
         const again = rawEmail(rest, options);
         return again ? { email: again, spans: emailSpans(rest, again) } : { email: '', spans: [] };
      } else {
         return { email, spans };
      }
   }
}

/** The answer with the email's part blanked, for the digit readers: its digits are the email's. */
function withoutEmail(text) {
   const t = String(text ?? '');
   return blank(t, emailClaim(t).spans);
}

/**
 * The 10-digit North American number in the answer (a leading 1 dropped), or ''. A caller who restates the number
 * ("Area code 21. 213 555 0147.", "Area code, 213 555. Area code 213-555-0147.") is read by the last complete number
 * after a sentence break or an "area code": prod 2026-10-26 07:28, the first read as a Mexican number, the second as
 * nothing. An answer with an international prefix (+, plus, más, 00) is never split, so it stays international.
 */
export function readPhone(text) {
   const t = withoutEmail(text);
   const whole = northAmerican(t.replace(/[^0-9]/g, ''));
   if (whole) {
      return whole;
   } else if (/(^|[\s(])(\+|00|plus\b|m[aá]s\b)\s*\d/i.test(t)) {
      return '';
   } else {
      const restated = t.split(/[.!?;](?:\s+|$)|\barea\s+code\b|\bc[oó]digo\s+de\s+[aá]rea\b/i).map((part) => northAmerican(part.replace(/[^0-9]/g, ''))).filter(Boolean);
      return restated.length ? restated[restated.length - 1] : '';
   }
}

/**
 * A phone number from outside the US / Canada in the answer, as its digits with the country code, or ''. With an
 * explicit prefix ("+", "plus", "más", "00") 8-15 digits; without one 11-13 digits not starting with 1 (a card or an
 * account number is not mistaken for one). US / Canada numbers are readPhone's. The flows say what such a number
 * cannot be used for instead of "I didn't get that" (owner, 2026-10-14).
 */
export function readInternationalPhone(text) {
   const t = String(text ?? '');
   const prefixed = /(^|[\s(])(\+|00|plus\b|m[aá]s\b)\s*\d/i.test(t);
   let d = t.replace(/[^0-9]/g, '');
   if (prefixed && d.startsWith('00')) {
      d = d.slice(2);
   } else {
      // no international call prefix
   }
   if (readEmail(t) || readPhone(t) || d.startsWith('1')) {
      return '';
   } else if (prefixed) {
      return d.length >= 8 && d.length <= 15 ? d : '';
   } else {
      return d.length >= 11 && d.length <= 13 ? d : '';
   }
}

/** Whether the caller's own number (cargo.callerId) is from outside the US / Canada: on a call, a real caller ID. */
export function callerIsInternational(cargo) {
   const c = cargo || {};
   const d = String(c.callerId ?? '').replace(/\D/g, '');
   return !!c.voice && d.length >= 8 && !(d.length === 10 || (d.length === 11 && d[0] === '1'));
}

/**
 * What the customer identified themselves with: { kind: 'account' | 'phone' | 'international_phone' | 'email', value } or
 * null.
 * accountPattern (a regex source, e.g. '^5\\d{6,7}$') is the tenant's account-number shape; its digits win first.
 */
export function readIdentifier(text, accountPattern = '') {
   const digits = withoutEmail(text).replace(/[^0-9]/g, '');
   let account = false;
   try {
      account = !!accountPattern && new RegExp(accountPattern).test(digits);
   } catch {
      account = false; // an invalid tenant pattern identifies no account
   }
   if (account) {
      return { kind: 'account', value: digits };
   } else if (readPhone(text)) {
      return { kind: 'phone', value: readPhone(text) };
   } else if (readInternationalPhone(text)) {
      return { kind: 'international_phone', value: readInternationalPhone(text) };
   } else if (readEmail(text)) {
      return { kind: 'email', value: readEmail(text) };
   } else {
      return null;
   }
}

/**
 * The last four characters of a number (card, account, phone, tracking) as said to the customer: spaced one by one on a
 * call ("5, 4, 7, 5"), as written otherwise ("5475"). Written ~25 times inline across the flow sets before it.
 */
export function last4(value, voice) {
   const tail = String(value ?? '').slice(-4);
   if (voice) {
      return tail.split('').join(', ');
   } else {
      return tail;
   }
}

/**
 * An email said back to the customer without reading all of it out. On a call: its first two characters spaced
 * one by one and its domain ("starting with r, o, at gmail.com" / "que empieza con r, o, arroba gmail.com"): "ending
 * in @gmail.com" alone is ambiguous on a call, and "ro***" makes the speech engine read the asterisks. Written:
 * "ro***@gmail.com". '' for anything that is not an email.
 */
export function maskEmail(email, voice, lang = 'en') {
   const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(email ?? '').trim().toLowerCase());
   if (!m) {
      return '';
   } else if (voice) {
      const head = m[1].slice(0, 2).split('').join(', ');
      return lang === 'es' ? `que empieza con ${head}, arroba ${m[2]}` : `starting with ${head}, at ${m[2]}`;
   } else {
      return `${m[1].slice(0, 2)}***@${m[2]}`;
   }
}

/** A US / Canada number as 10 digits (a leading 1 dropped), or '' for anything else: we text only those. */
function nanp(value) {
   const d = String(value ?? '').replace(/\D/g, '');
   return d.length === 10 ? d : (d.length === 11 && d[0] === '1' ? d.slice(1) : '');
}

/**
 * The number we can text the caller at, 10 digits, or '': ONE rule for offering TEXT and for sending one. Only on a
 * call with a sender (cargo.twilioNumber), a US / Canada caller ID, and not the number a code could not be texted to
 * (cargo.otpUndeliverableTo). A number from another country used to be cut to its last 10 digits and offered TEXT,
 * which then failed (dev calls from +52, 2026-10-13).
 */
export function callerTextNumber(cargo) {
   const c = cargo || {};
   const n = c.voice && c.twilioNumber ? nanp(c.callerId) : '';
   return n && n !== String(c.otpUndeliverableTo || '') ? n : '';
}

/** Where a text to the customer can go, 10 digits or '': the verified cell, else the caller (callerTextNumber). */
export function textDestination(cargo) {
   const c = cargo || {};
   const cell = c.twilioNumber ? nanp(c.otp_cell_number) : '';
   return cell && cell !== String(c.otpUndeliverableTo || '') ? cell : callerTextNumber(c);
}
