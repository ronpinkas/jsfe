// sorryNotCaught (jsfe 1.20.0): the re-ask acknowledgement names the customer only when the flows opt in. Synthetic data.
import assert from 'node:assert/strict';
import { sorryNotCaught, formInputPrompt } from '../dist/helpers/index.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
ok(sorryNotCaught('en', {}) === "Sorry, I didn't catch that. ", 'default en unchanged');
ok(sorryNotCaught('es', { displayName: 'ANA' }) === 'Disculpe, no le entendí. ', 'a name alone does not opt in');
ok(sorryNotCaught('en', { sorryByName: true, displayName: 'ANA TEST' }) === "Sorry, Ana Test, I didn't catch that. ", 'opt-in en, title case');
ok(sorryNotCaught('es', { sorryByName: true, displayName: 'Ana' }) === 'Disculpe, Ana, no le entendí. ', 'opt-in es');
ok(sorryNotCaught('es', { sorryByName: true, displayName: '' }) === 'Disculpe, no le entendí. ', 'opt-in without a name');
const cargo = { sorryByName: true, displayName: 'ANA', forms: { f: { feedback: { x: 'miss' } } } };
ok(formInputPrompt(cargo, 'f', 'x', { question: 'Q?', question_es: '¿Q?' }, {}, 'es') === 'Disculpe, Ana, no le entendí. ¿Q?', 'form re-ask uses it');
console.log(`sorry-by-name: ${n} checks passed`);
