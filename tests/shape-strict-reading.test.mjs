// A number is evidence for one field, read in its own shape (prod 2026-10-30, WhatsApp, at "Which sub account should the
// payment go to? … Sub account 51: $72.45 due."):
//  - "51:72.45" names sub account 51 and its amount: the amount's digits are the amount's, and the separate "51" is still
//    the sub account. It was read as neither: every numeric choice word was dropped because the answer held an amount.
//  - A decimal amount is never another field's digits: "72.45" was joined into "7245" and filled the security code out of
//    order, and "287.15" into "28715", offered as the billing ZIP code.
import assert from 'node:assert/strict';
import { matchInputs } from '../dist/helpers/match-inputs.js';

let checks = 0;
const equal = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const pay = 'make-payment:1', card = 'collect-credit-card:2';
const SUBS = ['50', '51', '52', '80'].map((n) => ({ key: n, phrases: [`sub account ${n}`, `account ${n}`, n] }));
const candidates = [
   { form: pay, name: 'sub_account', profile: { kind: 'choice', choices: SUBS } },
   { form: pay, name: 'amount', profile: { kind: 'amount', min: 0.01 } },
   { form: card, name: 'card_cvv', profile: { kind: 'digits', min: 3, max: 4 } },
   { form: card, name: 'card_zip', profile: { kind: 'digits', min: 5, max: 5 } },
];
const atSub = { form: pay, name: 'sub_account' };
const hits = (said, current = atSub) => { const m = matchInputs(said, candidates, current); return { hits: m.hits.map((h) => [h.name, h.value]).sort(), ambiguous: m.ambiguous.length }; };

for (const said of ['51:72.45', '51 72.45', 'sub 51 $72.45', 'Sub account 51: $72.45 due']) {
   equal(hits(said), { hits: [['amount', '72.45'], ['sub_account', '51']], ambiguous: 0 }, `"${said}": sub account 51 and $72.45`);
}
equal(hits('Sub account 80'), { hits: [['sub_account', '80']], ambiguous: 0 }, 'a sub account alone, as before');
equal(hits('80 dollars'), { hits: [['amount', '80']], ambiguous: 0 }, 'a marked amount is not a sub account, as before');
equal(hits('72.45'), { hits: [['amount', '72.45']], ambiguous: 0 }, '"72.45" is an amount, never the security code 7245');
equal(hits('287.15'), { hits: [['amount', '287.15']], ambiguous: 0 }, '"287.15" is an amount, never the ZIP code 28715');
equal(hits('287,15'), { hits: [['amount', '287.15']], ambiguous: 0 }, 'a comma decimal too');

// At its own question a digits field still reads what it is asked, and out of order a whole number of its shape still fills it.
const atCvv = { form: card, name: 'card_cvv' };
equal(matchInputs('494', candidates, atCvv).hits.map((h) => [h.name, h.value]), [['card_cvv', '494']], 'asked: the security code');
equal(hits('90044').hits, [['card_zip', '90044']], 'out of order: a whole five-digit ZIP code, as before');
equal(hits('9 0 0 4 4').hits, [['card_zip', '90044']], 'out of order: spoken digits still join');
// The payment's own profiles, with an amount already given (prod 2026-10-30 03:37): written cents change it from the sub
// account question; a bare whole number there is still not an amount.
const live = candidates.map((c) => (c.name === 'amount' ? { ...c, value: '512.80', profile: { kind: 'amount', min: 0.01, marked: false, money: { currency: 'USD', cardinals: true, intent: 'payment' } } } : c));
const liveHits = (said) => matchInputs(said, live, atSub).hits.map((h) => [h.name, h.value]).sort();
equal(liveHits('51:72.45'), [['amount', '72.45'], ['sub_account', '51']], 'payment profile: "51:72.45" is sub account 51 and $72.45');
equal(liveHits('51 72.45'), [['amount', '72.45'], ['sub_account', '51']], 'payment profile: "51 72.45" too');
equal(liveHits('51 100'), [['sub_account', '51']], 'payment profile: a bare whole number out of order is not an amount');
equal(liveHits('I paid 120.00 yesterday'), [], 'payment profile: written cents with no other field read are not taken as an amount');
console.log(`shape-strict reading: ${checks} checks passed`);
