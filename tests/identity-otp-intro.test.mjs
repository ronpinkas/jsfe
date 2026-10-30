// A contact question answered without being asked (the caller ID on file, a contact given) keeps its intro for the first
// verification code question; a spoken question clears it. Synthetic numbers.
import assert from 'node:assert/strict';
import { otpPrompt, FLOWS } from '../dist/forms/identity-flows.js';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const base = { voice: true, verb: 'say', verb_es: 'diga', otp_cell_number: '2135550000' };
ok(/^To check your balance, I first need to verify your account\. Please say or enter the 6-digit/.test(otpPrompt({ ...base, otpIntro: 'To check your balance, I first need to verify your account.' })), 'the intro leads the code question');
ok(/^Para revisar su saldo, primero necesito verificar su cuenta\. Por favor diga/.test(otpPrompt({ ...base, otpIntro_es: 'Para revisar su saldo, primero necesito verificar su cuenta.' }, true)), 'in Spanish');
ok(/^Please say/.test(otpPrompt(base)), 'no intro, no lead');

const find = (steps, id) => { for (const s of steps || []) { if (s.id === id) return s; const inner = find([...(s.steps || []), ...Object.values(s.branches || {})], id); if (inner) return inner; } return null; };
const step = (flow, id) => find(FLOWS.find((f) => f.id === flow).steps, id);
const unsaid = step('get-cell-or-email', 'identity_contact_intro_unsaid');
const run = (cargo, contact_prefill, contact_options) => { new Function('cargo', 'contact_prefill', 'contact_options', 'return ' + unsaid.value)(cargo, contact_prefill, contact_options); return cargo; };
const intro = { intro: 'To pay, I first need to verify your account.', intro_es: 'Para pagar, primero necesito verificar su cuenta.' };
ok(run({}, '2135550000', intro).otpIntro_es === intro.intro_es, 'answered without asking: the intro is kept');
ok(run({ otpIntro: 'x', otpIntro_es: 'y' }, '2135550000', { intro: '' }).otpIntro === 'x', 'a later unasked question without an intro keeps it');
ok(run({ otpIntro: 'x', otpIntro_es: 'y' }, '', intro).otpIntro === '', 'an asked question said it: cleared');
ok(run({ contactIntroSkip: true }, '2135550000', intro).otpIntro === undefined, 'a declined caller ID keeps no intro');
ok(!!step('get-and-validate-otp-code', 'otp_intro_said'), 'the code question clears it once said');
console.log(`identity otp intro: ${checks} checks passed`);
