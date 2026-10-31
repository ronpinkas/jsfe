// formAcknowledges (jsfe 1.20.0): a form declaring acknowledge: 'data' acknowledges only a value the caller supplied, never a pick.
import assert from 'node:assert/strict';
import { formAcknowledges, openFormInstance } from '../dist/helpers/index.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const specs = [{ name: 'amount', profile: { kind: 'amount' } }, { name: 'method', profile: { kind: 'pattern', regex: 'new' } },
   { name: 'selection', any_of: [{ name: 'plan', profile: { kind: 'choice' } }, { name: 'zip', profile: { kind: 'digits' } }] }];
const cargo = {};
const all = openFormInstance(cargo, 'pay-all', specs, {});
ok(formAcknowledges(cargo, { form: all, name: 'method' }) === true, 'default: every input is acknowledged');
const data = openFormInstance(cargo, 'pay-data', specs, { acknowledge: 'data' });
ok(formAcknowledges(cargo, { form: data, name: 'amount' }) === true, 'data: an amount');
ok(formAcknowledges(cargo, { form: data, name: 'zip' }) === true, 'data: digits inside an any_of');
ok(formAcknowledges(cargo, { form: data, name: 'method' }) === false, 'data: a pattern pick (NEW CARD) is not');
ok(formAcknowledges(cargo, { form: data, name: 'plan' }) === false, 'data: a choice is not');
const child = openFormInstance(cargo, 'card', [{ name: 'card_number', profile: { kind: 'digits' } }, { name: 'kind', profile: { kind: 'choice' } }], { parent: data, input: 'method' });
ok(formAcknowledges(cargo, { form: child, name: 'card_number' }) === true && formAcknowledges(cargo, { form: child, name: 'kind' }) === false, 'a sub-form inherits the nearest declaration');
assert.throws(() => openFormInstance({}, 'x', specs, { acknowledge: 'some' }), /acknowledge/); n++;
console.log(`acknowledge-data: ${n} checks passed`);
const { formFlow } = await import('../dist/forms/index.js');
const decl = (extra) => formFlow({ id: 'probe-form', name: 'ProbeForm', version: '1.0.0', description: 'Worker: probe.', inputs: [{ name: 'amount', label: 'amount', label_es: 'monto', profile: { kind: 'amount' }, question: 'How much?', question_es: '¿Cuánto?' }], ...extra });
ok(!JSON.stringify(decl({})).includes("acknowledge"), 'a form without it is generated exactly as before');
ok(JSON.stringify(decl({ acknowledge: 'data' })).includes("acknowledge: 'data'"), 'acknowledge data reaches the form instance');
assert.throws(() => decl({ acknowledge: 'none' }), /acknowledge/); n++;
console.log(`acknowledge-data declarations: ${n} checks passed`);
