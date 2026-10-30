// An amount the current question invites ("To pay another way, type NEW CARD, type LINK, or type a different amount") owns
// the caller's number over a correction of a card field read out of order, and the payment grammar reads "100$" and
// "100 amount" as that amount. Prod 2026-10-29 22:06: "Pay 100$" and "100 amount" there were asked "Is 100 your expiration
// date or your security code?", which offered no AMOUNT, and every answer missed.
import assert from 'node:assert/strict';
import { readMoneyAmount } from '../dist/helpers/money.js';
import { matchInputs } from '../dist/helpers/match-inputs.js';

let checks = 0;
const equal = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

const money = { currency: 'USD', cardinals: true, intent: 'payment' };
for (const said of ['100', 'pay 100', '100$', 'Pay 100$', '100 $', '$100', '100 dollars', 'pagar 100$', '100 amount', 'amount 100', 'the amount is 100', 'monto 100', '100 de monto']) {
   equal(readMoneyAmount(said, money), 100, `"${said}" is the amount 100`);
}
for (const said of ['New card 100', 'pay later 100', '100 card', 'no']) {
   equal(Number.isNaN(readMoneyAmount(said, money)), true, `"${said}" is not one whole monetary answer`);
}

const recovery = 'payment-recovery:9', card = 'collect-credit-card:8';
const candidates = [
   { form: recovery, name: 'next', invites: ['revised_amount'], profile: { kind: 'choice', choices: [{ key: 'new', phrases: ['new card'] }, { key: 'link', phrases: ['link'] }, { key: 'done', phrases: ['no'] }] } },
   { form: recovery, name: 'revised_amount', profile: { kind: 'amount', min: 0.01, marked: 'out_of_order', money } },
   { form: card, name: 'card_expiration', value: '0231', profile: { kind: 'pattern', regex: '\\b\\d{3,4}\\b' } },
   { form: card, name: 'card_cvv', value: '494', profile: { kind: 'digits', min: 3, max: 4 } },
];
const current = { form: recovery, name: 'next' };
for (const said of ['Pay 100$', '100 amount', '100$', '100']) {
   const m = matchInputs(said, candidates, current);
   equal(m.ambiguous.length, 0, `"${said}": no ambiguity`);
   equal(m.hits.map((h) => [h.name, h.value]), [['revised_amount', '100']], `"${said}": the invited amount`);
}
const compound = matchInputs('New card 100', candidates, current);
equal(compound.ambiguous.length, 0, '"New card 100": no ambiguity');
equal(compound.hits.map((h) => [h.name, h.value]).sort(), [['next', 'new'], ['revised_amount', '100']], '"New card 100": a new card and the invited amount');

// Not invited: a bare number at a question that does not invite an amount is still not read as one.
const notInvited = candidates.map((c) => (c.name === 'next' ? { ...c, invites: [] } : c));
equal(matchInputs('100', notInvited, current).hits.some((h) => h.name === 'revised_amount'), false, 'an uninvited amount does not take a bare number');

console.log(`invited amount: ${checks} checks passed`);
