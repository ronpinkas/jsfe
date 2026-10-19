/**
 * Shape checks flows call in conditions (validateDigits, validatePhone, validateEmail). Pure; part of jsfe/helpers.
 */

/** Only digits, and between minDigits and maxDigits of them. */
export function validateDigits(input, minDigits, maxDigits) {
   if (!/^\d+$/.test(input)) {
      return false;
   } else {
      return input.length >= minDigits && input.length <= maxDigits;   // as the host had it: a Number input has no length
   }
}

/**
 * A US phone number (10 digits, or 11 starting with 1), or with acceptInternational any 11–15 digits. String() first:
 * a flow can hand over a number (an all-digit answer evaluated to Number).
 */
export function validatePhone(phone, acceptInternational = false) {
   const cleaned = String(phone ?? '').replace(/\D/g, '');
   if (cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'))) {
      return true;
   } else if (acceptInternational && cleaned.length >= 11 && cleaned.length <= 15) {
      return true;
   } else {
      return false;
   }
}

/** Something@something.tld, no spaces. */
export function validateEmail(email) {
   return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? ''));
}
