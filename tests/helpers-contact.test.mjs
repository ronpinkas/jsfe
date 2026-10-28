// jsfe/helpers contact.js — a contact in a customer's answer.
//   node tests/helpers-contact.test.mjs
import assert from 'node:assert/strict';
import { readEmail, readPhone, readIdentifier, last4, maskEmail, callerTextNumber, textDestination, readInternationalPhone, callerIsInternational } from '../dist/helpers/contact.js';

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, what); checks++; };
eq(readEmail('my email is Ron@Example.com.'), 'ron@example.com', 'in a sentence, lowercased, trailing period dropped');
eq(readEmail('juan at gmail dot com'), 'juan@gmail.com', 'spoken');
eq(readEmail('j u a n arroba gmail punto com'), 'juan@gmail.com', 'spelled, Spanish');
eq(readEmail('J u a, n p, e r. E z 1985@gm a i l.com.'), 'juanperez1985@gmail.com', 'spelled with commas and a period, the domain spelled too (prod 2026-10-28)');
eq(readEmail('j u a n @ y a h o o . c o m'), 'juan@yahoo.com', 'a spelled top-level domain');
eq(readEmail('maria@hot mail.com.mx'), 'maria@hotmail.com.mx', 'a domain in two pieces, two-level top-level domain');
eq(readEmail('juan@gmail.com and my phone is 555'), 'juan@gmail.com', 'words after the domain are not joined to it');
eq(readEmail('juan@gmail.com y ya'), 'juan@gmail.com', 'single letters after the domain are not joined to it');
eq(readEmail('my email is ron'), '', 'no address');
eq(readEmail('a@b'), '', 'no domain');
// A local part spoken in several pieces keeps every piece (dev voice calls 2026-10-13 lost all but the last).
eq(readEmail('J. A Garcia at aura.com.'), 'jagarcia@aura.com', 'initials then a name');
eq(readEmail('Maria jose@gmail.com.'), 'mariajose@gmail.com', 'two words before the @');
eq(readEmail('J? A g a r, c i a at i.com.'), 'jagarcia@i.com', 'spelled across punctuation');
eq(readEmail('send it to bob@gmail.com'), 'bob@gmail.com', 'a filler phrase is not part of it');
eq(readEmail('mi correo es juan perez arroba gmail punto com'), 'juanperez@gmail.com', 'Spanish filler');
eq(readEmail('it is jane.doe@gmail.com'), 'jane.doe@gmail.com', 'a typed address keeps its dots');
eq(readEmail('Yes, ann@x.com'), 'ann@x.com', 'a leading yes is not part of it');
// Real prod answers (2026-10-13/14) the earlier reader cut down to their last piece
eq(readEmail('Rivera punto Luis 93@gmail.com'), 'rivera.luis93@gmail.com', 'spoken dot inside the name');
eq(readEmail('correo electrónico Raúl Jiménez Ortega 31@gmail.com'), 'rauljimenezortega31@gmail.com', 'accents dropped');
eq(readEmail('En el correo es Lucia campo@790@gmail.com.'), 'luciacampo790@gmail.com', 'a stray @ inside the name');
eq(readEmail('hola, es maria at hotmail dot com'), 'maria@hotmail.com', 'a greeting is not part of it');
eq(readEmail('my email address is j u a n at gmail dot com'), 'juan@gmail.com', 'spelled after a filler phrase');
eq(readPhone('(213) 555-0147'), '2135550147', 'formatted');
eq(readPhone('1 213 555 0147'), '2135550147', 'leading 1');
eq(readPhone('555-0147'), '', 'seven digits is not a phone');
eq(readIdentifier('my account is 5603521', '^5\\d{6,7}$'), { kind: 'account', value: '5603521' }, 'the tenant account shape');
eq(readIdentifier('213-555-0147', '^5\\d{6,7}$'), { kind: 'phone', value: '2135550147' }, 'a phone');
eq(readIdentifier('juan at gmail dot com'), { kind: 'email', value: 'juan@gmail.com' }, 'a spoken email');
eq(readIdentifier('yes'), null, 'nothing');
eq(readIdentifier('5603521', '['), null, 'an invalid pattern identifies no account');
// last4: spaced on a call, plain otherwise; any value
eq(last4('2135550147', true), '0, 1, 4, 7', 'voice: one by one');
eq(last4('2135550147', false), '0147', 'text: as written');
eq(last4(56035214, false), '5214', 'a number');
eq(last4('', true), '', 'empty');
eq(last4(undefined, false), '', 'undefined');
// maskEmail: said back without reading it all out
eq(maskEmail('Ann.Lee@Gmail.com', true), 'starting with a, n, at gmail.com', 'voice, English');
eq(maskEmail('ann@gmail.com', true, 'es'), 'que empieza con a, n, arroba gmail.com', 'voice, Spanish');
eq(maskEmail('ann@gmail.com', false), 'an***@gmail.com', 'written');
eq(maskEmail('a@x.com', true), 'starting with a, at x.com', 'a one-letter name');
eq(maskEmail('not an email', true), '', 'not an email');
eq(maskEmail(undefined, false), '', 'undefined');
// callerTextNumber / textDestination: one rule for offering TEXT and for sending one
const CALL = { voice: true, twilioNumber: '+12135550100' };
eq(callerTextNumber({ ...CALL, callerId: '+12135550147' }), '2135550147', 'a US caller on a call');
eq(callerTextNumber({ ...CALL, callerId: '+525512345678' }), '', 'a Mexican number: never texted (was cut to 5512345678)');
eq(callerTextNumber({ ...CALL, callerId: '+12135550147', otpUndeliverableTo: '2135550147' }), '', 'a line a code could not reach');
eq(callerTextNumber({ ...CALL, voice: false, callerId: '+12135550147' }), '', 'not on a call');
eq(callerTextNumber({ voice: true, callerId: '+12135550147' }), '', 'no sender');
eq(textDestination({ ...CALL, callerId: '+12135550147', otp_cell_number: '3235550123' }), '3235550123', 'the verified cell first');
eq(textDestination({ ...CALL, callerId: '+525512345678', otp_cell_number: '' }), '', 'no verified cell, a foreign caller: nowhere');
eq(textDestination({ twilioNumber: '+12135550100', otp_cell_number: '3235550123' }), '3235550123', 'a verified cell on a text channel');
// readInternationalPhone / callerIsInternational: a number from outside the US / Canada is recognised, not ignored
eq(readInternationalPhone('525512345678.'), '525512345678', 'Mexico, said without a prefix (12 digits)');
eq(readInternationalPhone('Plus 525512345678.'), '525512345678', '"plus"');
eq(readInternationalPhone('+52 551 234 5678'), '525512345678', 'typed with +');
eq(readInternationalPhone('00 52 551 234 5678'), '525512345678', 'the 00 call prefix');
eq(readInternationalPhone('+44 20 7946 0958'), '442079460958', 'UK');
eq(readInternationalPhone('2135550147'), '', 'a US number is readPhone\'s');
eq(readInternationalPhone('1 213 555 0147'), '', 'a US number with 1');
eq(readInternationalPhone('56035214'), '', 'an account number');
eq(readInternationalPhone('4111111111111111'), '', 'a card number (16 digits, no prefix)');
eq(readInternationalPhone('ann@gmail.com'), '', 'an email');
eq(readIdentifier('+52 551 234 5678', '^5\\d{6,7}$'), { kind: 'international_phone', value: '525512345678' }, 'identified as an international phone');
// a restated number: the last complete one after a sentence break or "area code" (prod 2026-10-26 07:28)
eq(readIdentifier('Area code 21. 213 555 0147.', '^5\\d{6,7}$'), { kind: 'phone', value: '2135550147' }, 'a false start, then the number');
eq(readIdentifier('Area code, 213 555. Area code 213-555-0147.', '^5\\d{6,7}$'), { kind: 'phone', value: '2135550147' }, 'half the number, then all of it');
eq(readPhone('Código de área 213. 213 555 0147'), '2135550147', 'Spanish');
eq(readPhone('818 451 5475. No, 323 555 0147.'), '3235550147', 'a correction: the last number');
eq(readPhone('213.555.0147'), '2135550147', 'a dotted number is one number');
eq(readPhone('Area code 21. 504 9590.'), '', 'no complete number anywhere');
eq(readInternationalPhone('+44. 20 7946 0958'), '442079460958', 'an international prefix is never split into a US number');
eq(readInternationalPhone('Area code 21. 213 555 0147.'), '', 'a restated US number is not international');
eq(callerIsInternational({ voice: true, callerId: '+525512345678' }), true, 'a Mexican caller');
eq(callerIsInternational({ voice: true, callerId: '+12135550147' }), false, 'a US caller');
eq(callerIsInternational({ voice: true, callerId: 'anonymous' }), false, 'no caller ID');
eq(callerIsInternational({ voice: false, callerId: '+525512345678' }), false, 'not a call');
// Spelled addresses (prod 2026-10-18)
eq(readEmail('S o n. N y underscore. L e, o s at gmail dot com'), 'sonny_leos@gmail.com', 'spelled, with underscore, across fragments');
eq(readEmail('s o n n y at gmail dot com'), 'sonny@gmail.com', 'a spelled "y" beside letters is a letter');
eq(readEmail('juan guion perez at gmail dot com'), 'juan-perez@gmail.com', 'guion is a dash');
eq(readEmail('mary y juan at gmail dot com'), 'juan@gmail.com', '"y" between words is still a lead-in');
eq(readEmail('my email is a b at x dot com'), 'ab@x.com', 'two spelled letters after a lead-in');
console.log(`contact: ${checks} checks passed`);
