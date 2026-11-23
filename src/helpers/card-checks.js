/**
 * Card checks the payment flows call (validateCardNumber / validateExpiration). Pure; part of jsfe/helpers.
 */

/** 12–19 digits passing the Luhn checksum (catches nearly every typo, on every network). */
export function validateCardNumber(input) {
   const cleaned = String(input || '').replace(/\D/g, '');
   if (cleaned.length < 12 || cleaned.length > 19) {
      return false;
   } else {
      let sum = 0;
      let double = false;
      for (let i = cleaned.length - 1; i >= 0; i--) {
         let d = parseInt(cleaned[i], 10);
         if (double) {
            d *= 2;
            if (d > 9) d -= 9;
         } else {
            // undoubled digit
         }
         sum += d;
         double = !double;
      }
      return sum % 10 === 0;
   }
}

/** MM and YY (two digits each), a real month, not expired, at most 6 years out (owner 2026-11-23: issuers set at most 5;
 * one more for safety). `now` is for tests. */
export function validateExpiration(month, year, now = new Date()) {
   const m = String(month || '').replace(/\D/g, '');
   const y = String(year || '').replace(/\D/g, '');
   if (m.length !== 2 || y.length !== 2) return false;
   const mNum = parseInt(m, 10);
   const yNum = parseInt(y, 10);
   if (mNum < 1 || mNum > 12) return false;
   const curYear = now.getFullYear() % 100;
   const curMonth = now.getMonth() + 1;
   if (yNum < curYear) return false;
   if (yNum === curYear && mNum < curMonth) return false;
   return yNum <= curYear + 6;
}

/** A spoken or typed expiration's digits as MMYY when they are a valid one (validateExpiration), else ''. Month then year,
 * as the card expiration validator reads digits: "0929", "929", "150" (01/50, past the window: ''), "09 2029", "09029". */
export function expirationDigits(value, now = new Date()) {
   const digits = String(value ?? '').replace(/\D/g, '');
   const m = /^(0?[1-9]|1[0-2])(?:20)?(\d{2})$/.exec(digits) || /^(0[1-9])0(\d{2})$/.exec(digits);
   const mm = m ? m[1].padStart(2, '0') : '';
   return m && validateExpiration(mm, m[2], now) ? mm + m[2] : '';
}
