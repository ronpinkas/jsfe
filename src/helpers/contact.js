/**
 * Reading a contact out of a customer's answer, ONE way for every flow set (APPROVED_FUNCTIONS readEmail, readPhone,
 * readIdentifier), saying it back masked (last4, maskEmail), and where a text can reach the customer
 * (callerTextNumber, textDestination). Before it, an email was read four different ways: only ask-email understood a spoken or spelled
 * address ("juan at gmail dot com", "j u a n arroba gmail punto com"), so the same answer worked for a statement and
 * failed at the identity question (flow design review 2026-10-13).
 *
 * Part of jsfe/helpers; zero imports.
 */

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
export function readEmail(text, { literal = false } = {}) {
   // Contextual prose must not become part of an already complete, visible address. This
   // explicit mode preserves the default spoken/spelled-name grammar for existing callers.
   if (literal) {
      const addresses = [...String(text ?? '').matchAll(/(?<![a-z0-9._%+@-])([a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,})(?![a-z0-9_@-])/gi)].map(match=>match[1].toLowerCase());
      if (addresses.length) return new Set(addresses).size === 1 ? addresses[0] : '';
   }
   const spoken = String(text ?? '')
      .replace(/\s+(?:at|arroba)\s+/gi, ' @ ')
      .replace(/\s+(?:dot|punto)\s+/gi, '.')
      .replace(/\s+(?:underscore|gui[oó]n bajo)[.,]?(?:\s+|$)/gi, '_')
      .replace(/\s+(?:dash|hyphen|gui[oó]n)[.,]?(?:\s+|$)/gi, '-');
   const at = spoken.lastIndexOf('@');   // a speech engine may write an @ inside the name too: the last one is the address's
   if (at < 0) {
      return '';
   } else {
      const domain = (spoken.slice(at + 1).trim().match(/^[^\s@]+/) || [''])[0].replace(/[.,;:!?]+$/, '');
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
      const email = (local.join('') + '@' + domain).toLowerCase();
      return /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) ? email : '';
   }
}

/** The 10-digit North American number in the answer (a leading 1 dropped), or ''. */
export function readPhone(text) {
   const digits = String(text ?? '').replace(/[^0-9]/g, '');
   if (digits.length === 11 && digits.startsWith('1')) {
      return digits.slice(1);
   } else if (digits.length === 10) {
      return digits;
   } else {
      return '';
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
   const digits = String(text ?? '').replace(/[^0-9]/g, '');
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
