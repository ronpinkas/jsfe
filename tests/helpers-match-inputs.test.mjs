// jsfe/helpers match-inputs.js — which of a form's inputs an answer fills (the FORM convention's collect-input).
//   node tests/helpers-match-inputs.test.mjs
import assert from 'node:assert/strict';
import { matchInputs, formAcceptanceTrace } from '../dist/helpers/match-inputs.js';

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

// Fully consumed question punctuation cannot become a text fallback or consume a protocol attempt.
const {readFormAnswer}=await import('../dist/helpers/match-inputs.js');
const questionCatalog=[{key:'balance',words:['balance']}];
let answer=readFormAnswer('what is my balance?', [reason], {form:'return',name:'reason'},'',questionCatalog);
eq(answer.hits,[],'question punctuation is not a text answer');eq(answer.questions,['balance'],'the question remains requested');
answer=readFormAnswer('what is my balance? and 123456',[{form:'return',name:'code',profile:{kind:'digits',min:6,max:6}}],{form:'return',name:'code'},'',questionCatalog);
eq(answer.hits.map(h=>h.value),['123456'],'an independent OTP clause remains collected');

// Context-aware acceptance, the standard rules for every form (owner 2026-10-25; every case a prod turn of 2026-10-24).
const C = (input) => input;
const route = C({ form: 'pay', name: 'route', profile: { kind: 'choice', choices: [{ key: 'pay', phrases: ['pay', 'pagar'], keys: ['1'] }, { key: 'link', phrases: ['link', 'enlace'], keys: ['2'] }] } });
const saveCard = C({ form: 'pay', name: 'save_card', confirmation: 'firm', profile: { kind: 'choice', choices: [{ key: 'yes', phrases: ['save', 'guardar'], exact: true }, { key: 'no', phrases: ['no guardar'] }] } });
const payAmt = C({ form: 'pay', name: 'amount', profile: { kind: 'amount' } });
const method = C({ form: 'pay', name: 'method', profile: { kind: 'pattern', regex: '\\b(?:visa|new|\\d{4})\\b' } });
const pan = C({ form: 'card', name: 'card_number', profile: { kind: 'digits', min: 13, max: 19 } });
const code = [C({ form: 'otp', name: 'code', profile: { kind: 'digits', min: 6, max: 6 } }), C({ form: 'otp', name: 'raw', profile: { kind: 'text' } })];
for (const said of ['sí', 'claro', 'Yes.', 'no', 'guardar']) {
   const r = matchInputs(said, [route, saveCard], { form: 'pay', name: 'route' });
   eq(names(r), [], `rule 2: "${said}" at PAY or LINK fills no confirmation out of order`);
}
eq(matchInputs('sí', [route, saveCard], { form: 'pay', name: 'route' }).refused, [{ form: 'pay', name: 'save_card', rule: 'confirmation_out_of_order' }], 'rule 2: the refusal is recorded');
eq(names(matchInputs('claro', [saveCard], { form: 'pay', name: 'save_card' })), ['save_card=yes'], 'rule 2: firm YES when asked (claro is a confirm word)');
eq(names(matchInputs('ok', [saveCard], { form: 'pay', name: 'save_card' })), [], 'rule 2: an acknowledgement is not a firm YES');
eq(names(matchInputs('ok', [{ ...saveCard, confirmation: 'soft' }], { form: 'pay', name: 'save_card' })), ['save_card=yes'], 'rule 2: a soft offer takes the wider YES');
eq(names(matchInputs('no', [saveCard], { form: 'pay', name: 'save_card' })), ['save_card=no'], 'rule 2: NO when asked');
eq(names(matchInputs('8528777', [route, payAmt], { form: 'pay', name: 'route' })), [], 'rule 4: a bare number is not an amount out of order');
eq(names(matchInputs('50 dollars', [route, payAmt], { form: 'pay', name: 'route' })), ['amount=50'], 'rule 4: a marked amount out of order is taken');
eq(matchInputs('50 dollars', [route, payAmt], { form: 'pay', name: 'route' }).decisions[0].rule, 'out_of_order', 'the rule is recorded');
eq(names(matchInputs('45', [payAmt], { form: 'pay', name: 'amount' })), ['amount=45'], 'rule 1: a bare number at the amount question');
const next = C({ form: 'rec', name: 'next', invites: ['revised_amount'], profile: { kind: 'choice', choices: [{ key: 'new', phrases: ['new card'], keys: ['1'] }, { key: 'link', phrases: ['link'], keys: ['2'] }] } });
const revised = C({ form: 'rec', name: 'revised_amount', profile: { kind: 'amount' } });
eq(names(matchInputs('50', [next, revised], { form: 'rec', name: 'next' })), ['revised_amount=50'], 'rule 1: an invited amount takes a bare number');
eq(matchInputs('50', [next, revised], { form: 'rec', name: 'next' }).decisions[0].rule, 'invited', 'recorded as invited');
eq(names(matchInputs('2', [next, revised], { form: 'rec', name: 'next' })), ['next=link'], 'rule 4: a single digit the question offers as a key is that key');
eq(names(matchInputs('7', [next, revised], { form: 'rec', name: 'next' })), ['revised_amount=7'], 'rule 4: a single digit no key claims reaches the invited amount (its validator decides)');
eq(names(matchInputs('88 91 7112', [...code, method], { form: 'otp', names: ['code', 'raw'] })), ['raw=88 91 7112'], 'rule 3: the last four of a longer number fill nothing');
eq(matchInputs('88 91 7112', [...code, method], { form: 'otp', names: ['code', 'raw'] }).refused.map((x) => x.rule), ['fragment'], 'rule 3: the refusal is recorded');
eq(names(matchInputs('4111111111111111', [...code, pan], { form: 'otp', names: ['code', 'raw'] })), ['card_number=4111111111111111'], 'rule 3: a whole card number at the code question is taken out of order');
eq(names(matchInputs('my zip is 90012 and the card 4111111111111111', [C({ form: 'card', name: 'card_zip', profile: { kind: 'digits', min: 5, max: 5 } }), pan], { form: 'card', name: 'card_number' })), ['card_number=4111111111111111', 'card_zip=90012'], 'rule 5: two separate parts fill two fields');
eq(matchInputs('2', [route, payAmt], { form: 'pay', name: 'route' }).refused, undefined, 'a key the current question took records no refused amount');
eq(matchInputs('799604', [...code, payAmt], { form: 'otp', names: ['code', 'raw'] }).refused, undefined, 'a code the current question took records no refused amount');
eq(matchInputs('8528777', [route, payAmt], { form: 'pay', name: 'route' }).refused.map((x) => x.rule), ['bare_amount_out_of_order'], 'a bare number nothing current took is a recorded refusal');
const trace = formAcceptanceTrace(null, matchInputs('88 91 7112', [...code, method], { form: 'otp:3', names: ['code', 'raw'] }));
eq(trace, { filled: [], refused: [{ form: 'pay', name: 'method', rule: 'fragment' }] }, 'the trace records the refusal by field and rule, no value');
eq(formAcceptanceTrace(trace, matchInputs('50 dollars', [route, payAmt], { form: 'pay', name: 'route' })).filled, [{ form: 'pay', name: 'amount', rule: 'out_of_order' }], 'the trace appends an out-of-order fill');
eq(formAcceptanceTrace(null, matchInputs('45', [payAmt], { form: 'pay', name: 'amount' })), null, 'an in-order answer adds nothing');
console.log(`match-inputs: ${checks} checks passed`);
