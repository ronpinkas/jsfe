/**
 * dateToWords (APPROVED_FUNCTIONS): an ISO date ('2026-11-05', or a timestamp starting with one) as words —
 * 'November 5, 2026' / '5 de noviembre de 2026', or without the year 'November 5' / '5 de noviembre'.
 * ONE formatter for every flow: three ai-ar flows wrote their own month tables, and one read the raw '2026-12-31'
 * aloud (flow design review 2026-10-13). Anything that is not a date comes back unchanged.
 *
 * Part of jsfe/helpers; zero imports.
 */
const MONTHS = {
   en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
   es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};

export function dateToWords(date, lang = 'en', withYear = true) {
   const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(date ?? '').trim());
   const month = m ? MONTHS[lang === 'es' ? 'es' : 'en'][parseInt(m[2], 10) - 1] : '';
   if (!m || !month) {
      return String(date ?? '');
   } else {
      const day = parseInt(m[3], 10);
      const year = parseInt(m[1], 10);
      if (lang === 'es') {
         return withYear ? `${day} de ${month} de ${year}` : `${day} de ${month}`;
      } else {
         return withYear ? `${month} ${day}, ${year}` : `${month} ${day}`;
      }
   }
}
