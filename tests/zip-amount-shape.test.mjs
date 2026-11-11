// ZIP fields refuse an amount-shaped number ("119 19") out of order and the card's billing ZIP takes a bare number out of order only
// beside its word (owner 2026-11-11; prod "119 19." at a save-card question replaced the billing ZIP and the charge failed AVS).
//   node tests/zip-amount-shape.test.mjs
import assert from 'node:assert/strict';
import { matchInputs } from '../dist/helpers/match-inputs.js';
import { FIELD_PRESETS } from '../dist/forms/index.js';

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, what); checks++; };
const names = (r) => r.hits.map((h) => `${h.name}=${h.value}`).sort();
const zip = { ...FIELD_PRESETS.card_zip, form: 'card', name: 'card_zip' };
const save = { form: 'card', name: 'save_card', profile: { kind: 'choice', choices: [{ key: 'yes', words: ['yes', 'sí', 'si'], keys: ['1'] }, { key: 'no', words: ['no'], keys: ['2'] }] } };
const addressZip = { ...FIELD_PRESETS.zip, form: 'address', name: 'zip' };

// The prod turn: at the save-card question, "119 19." fills nothing (not the billing ZIP 11919).
let r = matchInputs('119 19.', [save, zip], { form: 'card', name: 'save_card' });
eq(names(r), [], '"119 19." at the save-card question fills nothing');

// At the ZIP question itself the field was asked for: the amount shape reads as the ZIP.
for (const [said, want] of [['119 19', '11919'], ['119 19.', '11919'], ['900 15', '90015']]) {
   eq(names(matchInputs(said, [zip], { form: 'card', name: 'card_zip' })), [`card_zip=${want}`], `"${said}" at the billing ZIP question`);
   eq(names(matchInputs(said, [addressZip], { form: 'address', name: 'zip' })), [`zip=${want}`], `"${said}" at the address ZIP question`);
}
// Out of order it is not a ZIP, even beside the word, and not the address ZIP either.
eq(names(matchInputs('zip 119 19', [save, zip], { form: 'card', name: 'save_card' })), [], '"zip 119 19" out of order fills nothing');
eq(names(matchInputs('119 19', [save, addressZip], { form: 'card', name: 'save_card' })), [], 'nor the address ZIP out of order');

// Every other way a ZIP is said still reads, at its question.
for (const [said, want] of [['90015', '90015'], ['9 0 0 1 5', '90015'], ['90 0 15', '90015'], ['90 2 21', '90221'], ['9001 5', '90015'], ['el código postal es 90015', '90015']]) {
   eq(names(matchInputs(said, [zip], { form: 'card', name: 'card_zip' })), [`card_zip=${want}`], `"${said}" at the billing ZIP question`);
   eq(names(matchInputs(said, [addressZip], { form: 'address', name: 'zip' })), [`zip=${want}`], `"${said}" at the address ZIP question`);
}

// Out of order a bare five-digit number is not the billing ZIP: the caller hears how to mean it.
r = matchInputs('11919', [save, zip], { form: 'card', name: 'save_card' });
eq(names(r), [], 'a bare 11919 at the save-card question fills nothing');
eq(r.clarify?.[0]?.name, 'card_zip', 'the caller is told to add the word');
for (const said of ['zip 11919', 'the zip code is 11919', 'el código postal es 11919']) eq(names(matchInputs(said, [save, zip], { form: 'card', name: 'save_card' })), ['card_zip=11919'], `"${said}" out of order: taken`);

console.log(`zip-amount-shape: ${checks} checks passed`);
