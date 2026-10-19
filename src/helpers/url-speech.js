/**
 * A URL said aloud (urlToSpeech, textWithUrlToSpeech): protocol, query and fragment dropped, "www." dropped, dots,
 * slashes, dashes and underscores as words, in English or Spanish. Pure; part of jsfe/helpers.
 */

export function urlToSpeech(url, language = 'en') {
   if (!url || typeof url !== 'string') {
      return '';
   } else {
      const words = language === 'es'
         ? { dot: 'punto', slash: 'diagonal', dash: 'guión', underscore: 'guión bajo' }
         : { dot: 'dot', slash: 'slash', dash: 'dash', underscore: 'underscore' };
      const bare = url.replace(/^https?:\/\//i, '').replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/+$/, '');
      const slashIdx = bare.indexOf('/');
      const domain = (slashIdx >= 0 ? bare.substring(0, slashIdx) : bare).replace(/^www\./i, '').replace(/\./g, ` ${words.dot} `);
      const path = (slashIdx >= 0 ? bare.substring(slashIdx) : '').replace(/\//g, ` ${words.slash} `).replace(/-/g, ` ${words.dash} `).replace(/_/g, ` ${words.underscore} `);
      return (domain + ' ' + path).replace(/\s+/g, ' ').trim();
   }
}

/** Every URL in a text said aloud. */
export function textWithUrlToSpeech(text, language = 'en') {
   if (!text || typeof text !== 'string') {
      return text;
   } else {
      return text.replace(/https?:\/\/[^\s]+/gi, (url) => urlToSpeech(url, language));
   }
}
