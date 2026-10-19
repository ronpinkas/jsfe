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

/** MM and YY (two digits each), a real month, not expired, at most 20 years out. `now` is for tests. */
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
   return yNum <= curYear + 20;
}
