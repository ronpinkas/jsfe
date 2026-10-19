// jsfe/helpers match-inputs.js — which of a form's inputs an answer fills (the FORM convention's collect-input).
//   node tests/helpers-match-inputs.test.mjs
import assert from 'node:assert/strict';
import { matchInputs } from '../dist/helpers/match-inputs.js';

let checks = 0;
const reasonFree = () => ({ form: 'return', name: 'reason', profile: { kind: 'text' } });
const eq = (got, want, what) => { assert.deepEqual(got, want, what); checks++; };
const names = (r) => r.hits.map((h) => `${h.name}=${h.value}`).sort();
const amb = (r) => r.ambiguous.map((h) => `${h.name}=${h.value}`).sort();

// A return/exchange form (Shopify) and a payment form, as collect-input passes them: the inputs that apply now.
const order = { form: 'return', name: 'order_number', profile: { kind: 'digits', min: 4, max: 6 } };
const action = { form: 'return', name: 'action', profile: { kind: 'choice', choices: [{ key: 'refund', words: ['refund', 'reembolso', 'money back'] }, { key: 'exchange', words: ['exchange', 'cambiar', 'cambio', 'swap'] }] } };
const item = { form: 'return', name: 'item', profile: { kind: 'choice', choices: [{ key: 'shirt_blue', words: ['blue shirt', 'camisa azul'] }, { key: 'shirt_white', words: ['white shirt', 'camisa blanca'] }] } };
const size = { form: 'return', name: 'size', profile: { kind: 'choice', choices: [{ key: 'L', words: ['large', 'grande'] }, { key: 'M', words: ['medium', 'mediana'] }] } };
const color = { form: 'return', name: 'color', profile: { kind: 'choice', choices: [{ key: 'white', words: ['white', 'blanco', 'blanca'] }, { key: 'black', words: ['black', 'negro'] }] } };
const ret = [item, order, action, size, color];

// Compound: one answer fills four inputs, whatever was asked
let r = matchInputs('I want to exchange the blue shirt from order 1043 for a large', ret, { form: 'return', name: 'item' });
eq(names(r), ['action=exchange', 'item=shirt_blue', 'order_number=1043', 'size=L'], 'a compound answer fills every input it names');
eq(r.ambiguous, [], 'nothing in it is ambiguous');

// Out of order: asked the item, given the order number
r = matchInputs('it is 1043', ret, { form: 'return', name: 'item' });
eq(names(r), ['order_number=1043'], 'the order number lands in order_number while the item was asked');

// Scope (owner decision 2026-10-19, A). The same words for two inputs of one form: the current input takes them
const whiteItem = { ...item, profile: { kind: 'choice', choices: [{ key: 'shirt_white', words: ['white'] }] } };
r = matchInputs('make it white', [whiteItem, color], { form: 'return', name: 'color' });
eq(names(r), ['color=white'], 'the current input takes words that fit two inputs');
// …and when neither is current, two inputs of the nearest form are asked, never ranked
r = matchInputs('make it white', [whiteItem, color, reasonFree()], { form: 'return', name: 'reason' });
eq(amb(r), ['color=white', 'item=shirt_white'], 'two inputs of the same form are asked about');
// The asked input wins a tie with a same-shape sibling: four digits asked as the SSN's last four, a PIN also open
const ssn = { form: 'verify', name: 'ssn_last4', profile: { kind: 'digits', min: 4, max: 4 } };
const pin = { form: 'verify', name: 'pin', profile: { kind: 'digits', min: 4, max: 4 } };
r = matchInputs('4321', [ssn, pin], { form: 'verify', name: 'ssn_last4' });
eq(names(r), ['ssn_last4=4321'], 'the asked input takes a same-shape answer');

// Already known: the SSN after the account was found (prod call 2026-10-19 08:55)
r = matchInputs('Y mi número de seguro social es 8944.', [{ ...ssn, value: '8944' }], { form: 'verify', name: 'dob' });
eq(r.hits, [{ form: 'verify', name: 'ssn_last4', value: '8944', known: true }], 'a value equal to the stored one is marked known');

// A direct pick of the current input's own choice wins outright
r = matchInputs('2', [size, color], { form: 'return', name: 'size' }, 'M');
eq(names(r), ['size=M'], "ask-choice's key for the current input is taken as is");

// Amounts vs a sub-account number (prod 2026-10-19 07:38: '62' at the offer): a declared confirm_against pair is asked
const amount = { form: 'pay', name: 'amount', profile: { kind: 'amount' }, confirm_against: ['sub_account'] };
const sub = { form: 'pay', name: 'sub_account', profile: { kind: 'choice', choices: [{ key: '62', words: ['62', 'sixty two'] }] } };
r = matchInputs('62', [amount, sub], { form: 'pay', name: 'amount' });
eq(amb(r), ['amount=62', 'sub_account=62'], 'a declared pair is asked even though the amount was the current input');
r = matchInputs('62', [{ ...amount, confirm_against: undefined }, sub], { form: 'pay', name: 'amount' });
eq(names(r), ['amount=62'], 'without the declaration the current input takes it');
r = matchInputs('62', [sub, amount], { form: 'pay', name: 'sub_account' }, '62');
eq(amb(r), ['amount=62', 'sub_account=62'], "the pair is asked even when ask-choice picked the current input's own choice");
r = matchInputs('$62', [{ ...amount, profile: { kind: 'amount', marked: true } }, { form: 'pay', name: 'account', profile: { kind: 'identifier', pattern: '^5\\d{6,7}$' } }], { form: 'pay', name: 'amount' });
eq(names(r), ['amount=62'], 'a marked amount is an amount');
r = matchInputs('pay 50 on account 5447294', [{ ...amount, profile: { kind: 'amount', marked: true } }, { form: 'pay', name: 'account', profile: { kind: 'identifier', pattern: '^5\\d{6,7}$' } }], { form: 'pay', name: 'amount' });
eq(names(r).includes('amount=50'), false, 'an unmarked number is not taken by a marked amount input');

// Contact shapes
r = matchInputs('my email is juan at gmail dot com', [{ form: 'c', name: 'email', profile: { kind: 'email' } }, { form: 'c', name: 'phone', profile: { kind: 'phone' } }], { form: 'c', name: 'phone' });
eq(names(r), ['email=juan@gmail.com'], 'a spoken email goes to email while the phone was asked');
r = matchInputs('2 1 3 5 5 5 0 1 4 7', [{ form: 'c', name: 'phone', profile: { kind: 'phone' } }], { form: 'c', name: 'phone' });
eq(names(r), ['phone=2135550147'], 'digits said one by one are one phone number');

// Nested forms: a parent's input answered inside the card sub-form
const cvv = { form: 'collect-credit-card', name: 'card_cvv', profile: { kind: 'digits', min: 3, max: 4 } };
const payAmount = { form: 'pay-bill', name: 'amount', profile: { kind: 'amount', marked: true } };
r = matchInputs('make it $40', [cvv, payAmount], { form: 'collect-credit-card', name: 'card_cvv' });
eq(r.hits, [{ form: 'pay-bill', name: 'amount', value: '40', known: false }], 'the amount goes to the parent form, not the CVV');
// A sub-form's own input wins over a parent's that fits the same words; the parent is not considered
const cardZip = { form: 'collect-credit-card', name: 'card_zip', profile: { kind: 'digits', min: 5, max: 5 } };
const homeZip = { form: 'pay-bill', name: 'home_zip', profile: { kind: 'digits', min: 5, max: 5 } };
r = matchInputs('90012', [cvv, cardZip, homeZip], { form: 'collect-credit-card', name: 'card_cvv' });
eq(names(r), ['card_zip=90012'], "the sub-form's one fitting input takes it over the parent's");
// Two parents' inputs that fit, nothing in the sub-form: the nearest parent's
const grandZip = { form: 'checkout', name: 'ship_zip', profile: { kind: 'digits', min: 5, max: 5 } };
r = matchInputs('90012', [cvv, homeZip, grandZip], { form: 'collect-credit-card', name: 'card_cvv' });
eq(names(r), ['home_zip=90012'], 'the nearest form up takes it');

// Free text fills only the input that was asked
const reason = { form: 'return', name: 'reason', profile: { kind: 'text' } };
r = matchInputs('it shrank in the wash', [reason, size], { form: 'return', name: 'size' });
eq(names(r), [], 'free text is not taken by a text input that was not asked');
r = matchInputs('it shrank in the wash', [reason, size], { form: 'return', name: 'reason' });
eq(names(r), ['reason=it shrank in the wash'], 'free text fills the asked text input');

// Escaped input (jsfe stores don\'t) and agent requests
r = matchInputs("I don\\'t want a refund, exchange it", [action], { form: 'return', name: 'action' });
eq(names(r), ['action=exchange'], "a negated choice is not taken; the escaped quote is read as said");
r = matchInputs('agent', [action, size], { form: 'return', name: 'action' });
eq(r, { hits: [], ambiguous: [] }, 'an agent request fills nothing (ask-choice owns it)');

// An any_of group: phone, email or account number asked together; whichever fits is the current input
const gPhone = { form: 'id', name: 'phone', profile: { kind: 'phone' } };
const gEmail = { form: 'id', name: 'email', profile: { kind: 'email' } };
const gAcct = { form: 'id', name: 'account', profile: { kind: 'identifier', pattern: '^5\\d{6,7}$' } };
r = matchInputs('5447294', [gPhone, gEmail, gAcct], { form: 'id', names: ['phone', 'email', 'account'] });
eq(names(r), ['account=5447294'], 'a group member fills the asked group');
r = matchInputs('213 555 0147', [gPhone, gEmail, gAcct], { form: 'id', names: ['phone', 'email', 'account'] });
eq(names(r), ['phone=2135550147'], 'a phone fills the phone member');

// Unknown kinds and bad patterns read nothing
r = matchInputs('August 8 1975', [{ form: 'v', name: 'dob', profile: { kind: 'date' } }], { form: 'v', name: 'dob' });
eq(r, { hits: [], ambiguous: [] }, 'no date reader yet: nothing');
r = matchInputs('abc', [{ form: 'v', name: 'x', profile: { kind: 'pattern', regex: '(' } }], { form: 'v', name: 'x' });
eq(r, { hits: [], ambiguous: [] }, 'an invalid pattern reads nothing');
eq(matchInputs('', null, null), { hits: [], ambiguous: [] }, 'no candidates');

console.log(`match-inputs: ${checks} checks passed`);
