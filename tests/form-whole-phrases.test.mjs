import test from 'node:test';
import assert from 'node:assert/strict';
import { matchInputs } from '../dist/helpers/match-inputs.js';

const method = (whole) => ({ form: 'f', name: 'method', profile: { kind: 'choice', ...(whole ? { whole_phrases: true } : {}), choices: [
   { key: 'new', phrases: ['nueva', 'new card', 'nueva tarjeta', 'tarjeta nueva'] },
   { key: 'link', phrases: ['link', 'enlace'] },
   { key: 'no', phrases: ['no'], negative: true },
   { key: 'yes', phrases: ['yes', 'si'] },
] } });
const amount = { form: 'f', name: 'amount', profile: { kind: 'amount', min: 1 } };
const read = (text, whole = true) => matchInputs(text, [method(whole), amount], { form: 'f', name: 'method' }).hits.map((h) => `${h.name}=${h.value}`).sort();

test('without whole_phrases a phrase inside a sentence still picks (the default is unchanged)', () => {
   assert.deepEqual(read('Quiero hacer una nueva compra', false), ['method=new']);
});
test('a phrase beside other words does not pick: the ranker decides', () => {
   assert.deepEqual(read('Quiero hacer una nueva compra'), []);
   assert.deepEqual(read('the link you sent did not open'), []);
   assert.deepEqual(read('no se si tengo el enlace'), []);
});
test('a phrase with courtesy and connecting words picks', () => {
   for (const text of ['nueva tarjeta', 'la tarjeta nueva por favor', 'Enlace, gracias.', 'I want the link please', 'with my new card']) {
      assert.equal(read(text).length, 1, text);
   }
});
test('a template keeps every part: phrase, argument, connecting words', () => {
   assert.deepEqual(read('new card 100'), ['method=new']);
   assert.deepEqual(read('quiero pagar $50 con la tarjeta nueva').includes('method=new'), false, 'pagar is not a connecting word here');
   assert.deepEqual(read('I want to use $50 with my new card').includes('method=new'), false, 'use is not a connecting word');
   assert.deepEqual(read('$50 with my new card'), ['amount=50', 'method=new']);
});
test('yes and no as the whole answer pick, and inside a sentence do not', () => {
   assert.deepEqual(read('si'), ['method=yes']);
   assert.deepEqual(read('no gracias'), ['method=no']);
   assert.deepEqual(read('no se que hacer'), []);
});
test('an argument read beside unaccounted words is read as before', () => {
   assert.deepEqual(read('it was around $50 I guess'), ['amount=50']);
});

test('a pattern that reads words is held to the same rule, with its own template words', () => {
   const card = (whole) => ({ form: 'f', name: 'method', profile: { kind: 'pattern', regex: '\\b(?:visa|nueva|new|\\d{4})\\b', ...(whole ? { whole_phrases: true, template_words: ['pay', 'pagar', 'card', 'tarjeta'] } : {}) } });
   const hits = (text, whole = true) => matchInputs(text, [card(whole), amount], { form: 'f', name: 'method' }).hits.map((h) => `${h.name}=${h.value}`).sort();
   assert.deepEqual(hits('Quiero hacer una nueva compra', false), ['method=nueva'], 'the default is unchanged');
   assert.deepEqual(hits('Quiero hacer una nueva compra'), []);
   assert.deepEqual(hits('quiero pagar con la tarjeta nueva'), ['method=nueva']);
   assert.deepEqual(hits('pay $50 with my Visa card'), ['amount=50', 'method=Visa']);
   assert.deepEqual(hits('la que termina en 4242'), ['method=4242'], 'digits are an argument');
});

test('a read-back whose fields may be corrected leaves a partly read reply to the ranker', () => {
   const unit = { form: 'f', name: 'unit', profile: { kind: 'pattern', regex: '(?:\\bapartment|#)\\s*([\\w-]+)', group: 1 } };
   const street = { form: 'f', name: 'street', profile: { kind: 'pattern', regex: '\\b\\d{1,6}\\s+\\w+\\s+(?:st|street)\\b' } };
   const read = (text, whole) => matchInputs(text, [unit, street], { form: 'f', name: '', whole_reply: whole }).hits.map((h) => `${h.name}=${h.value}`);
   assert.deepEqual(read("It's Long Beach, apartment 4", false), ['unit=4'], 'the default is unchanged');
   assert.deepEqual(read("It's Long Beach, apartment 4", true), []);
   assert.deepEqual(read('300 Main Street', true), ['street=300 Main Street']);
   assert.deepEqual(read('it is 300 Main Street', true), ['street=300 Main Street']);
});

test('a correction word beside a phrase stays with the reader', () => {
   const service = { form: 'f', name: 'service', profile: { kind: 'choice', whole_phrases: true, choices: [{ key: 'verizon', phrases: ['verizon'] }] } };
   const read = (text) => matchInputs(text, [service], { form: 'f', name: 'service' }).hits.map((h) => h.value);
   assert.deepEqual(read('actually Verizon'), ['verizon']);
   assert.deepEqual(read('my bill from Verizon is wrong'), []);
});
