/** Every numeric reader takes a number said in pieces (owner 2026-11-03; prod 11-02 CA6621f: "5 0 9 Lazy Lane" asked again). */
import assert from 'node:assert/strict';
import { joinSpokenDigits, readInputProfile, amountInAnswer } from '../dist/helpers/index.js';
import { addressDraft } from '../dist/forms/index.js';
const eq = (a, b, m) => assert.deepEqual(a, b, m);
for (const [said, want] of [['5 0 9 Lazy Lane', '509 Lazy Lane'], ['50 9 Lazy Lane', '509 Lazy Lane'], ['5, 0, 9 Lazy Lane', '509 Lazy Lane'], ['5-0-9 Lazy Lane', '509 Lazy Lane'], ['5. 0. 9 Lazy Lane', '509 Lazy Lane'],
   ['509 Lazy Lane', '509 Lazy Lane'], ['2 18, Nice Dr', '218 Nice Dr'], ['6 33, North Normandy Avenue', '633 North Normandy Avenue'], ['509, Lazy Lane', '509 Lazy Lane'], ['509 12 Ave', '509 12 Ave'], ['12-34 Main St', '12-34 Main St'], ['5 0 9 5th Street', '509 5th Street']]) {
   eq(joinSpokenDigits(said, 'house_number'), want, said);
}
eq(joinSpokenDigits('654 6'), '6546'); eq(joinSpokenDigits('90 023'), '90023'); eq(joinSpokenDigits('apt 2 0 4'), 'apt 204'); eq(joinSpokenDigits('5.50 and 7.25'), '5.50 and 7.25');
const street = { kind: 'pattern', regex: '\\b\\d{1,6}\\s+(?:[A-Za-z0-9.\\xC0-\\xFF-]+\\s+){1,8}(?:ln|lane|st(?:reet)?)\\b', spoken_digits: 'house_number', accept_other: true };
for (const said of ['5 0 9 Lazy Lane', '5, 0, 9 Lazy Lane.', '5-0-9 Lazy Lane', '50 9 Lazy Lane']) eq(readInputProfile(street, said, true).value, '509 Lazy Lane', said);
const located = readInputProfile(street, 'calle 5 0 9 Lazy Lane ok', true);
eq(located.spans, [[6, 21]], 'the span indexes the answer as said');
const unit = { kind: 'pattern', regex: '(?:\\bapt\\.?|#)\\s*([\\w-]+)', group: 1, spoken_digits: true, accept_other: true };
for (const said of ['apt 2 0 4', '# 2 0 4', '2 0 4', '2-0-4', '204']) eq(readInputProfile(unit, said, true).value, '204', said);
eq(readInputProfile(unit, 'apt 12B', true).value, '12B');
// Without the attribute a pattern reads the answer as it always did.
eq(readInputProfile({ kind: 'pattern', regex: '\\d{4}' }, '6 5 4 6', true), null);
const amount = { kind: 'amount', min: 0.5 };
for (const [said, want] of [['1 5 0', '150'], ['1, 5, 0.', '150'], ['150', '150'], ['129 94', '129.94']]) eq(readInputProfile(amount, said, true).value, want, said);
// Parity: said in pieces, the amount reader answers exactly as it does for the joined number.
for (const isCurrent of [true, false]) {
   for (const [spaced, joined] of [['6 5 4 6', '6546'], ['1 5 0', '150'], ['1, 5, 0.', '150'], ['1-5-0', '150'], ['1. 5. 0.', '150'], ['9 0 0', '900']]) {
      eq(readInputProfile(amount, spaced, isCurrent)?.value, readInputProfile(amount, joined, isCurrent)?.value, `${spaced} reads as ${joined}`);
   }
}
const cardChoice = { kind: 'choice', choices: [{ key: 'card', phrases: ['6546'] }, { key: 'one', keys: ['1'] }, { key: 'two', keys: ['2'] }] };
for (const said of ['6546', '6 5 4 6', '6, 5, 4, 6.', '6-5-4-6']) eq(readInputProfile(cardChoice, said, true)?.value, 'card', `a declared number: ${said}`);
eq(readInputProfile(amount, '4.5', true)?.value, readInputProfile(amount, '4.50', true)?.value, 'a period with no space is a decimal point');
eq(readInputProfile({ ...amount, marked: 'out_of_order' }, '1 5 0', false), null, 'out of order, digit by digit is never an amount');
eq(amountInAnswer('1 5 0 dollars'), 150);
eq(readInputProfile({ kind: 'amount', min: 0.01, marked: false, money: { currency: 'USD', cardinals: true, intent: 'payment' } }, '1 5 0 dollars', true).value, '150', 'the money reader too'); eq(Number.isNaN(amountInAnswer('2 4 8 6')), true, 'alone, a card ending or a code');
eq(addressDraft('5 0 9 Lazy Lane').street, '509 Lazy Lane');
console.log('helpers-spoken-digits: ok');
