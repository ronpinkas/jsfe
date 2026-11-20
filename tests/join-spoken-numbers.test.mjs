/** A number is read whole, as the caller said it (owner 2026-11-19): joinSpokenNumbers writes each spoken run as one number,
 * so a reader that splits on its own never takes a piece of a phone or a date as another value. */
import assert from 'node:assert/strict';
import {joinSpokenNumbers} from '../dist/helpers/match-inputs.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const cases=[
 ['323 5713211','3235713211','a phone typed with a space (prod 11-17): one number, never a 7-digit account'],
 ['323-571-3211','3235713211','dashes'],
 ['0 7 13 de 1964','0713 de 1964','a month said digit by digit stays with its day'],
 ['mi cuenta es 56, 0 8 17 58.','mi cuenta es 56081758.','pauses after short groups'],
 ['92610, 56035214','92610, 56035214','a comma after a longer number separates two numbers'],
 ['seguro social 6119','seguro social 6119','one number untouched'],
 ['seguro social 6119 6119','seguro social 6119','the same number said twice is that number (a restart)'],
 ['12 12','1212','short groups are not taken as a repeat'],
 ['','',"no words"],
];
for(const [u,want,why] of cases)assert.equal(joinSpokenNumbers(u),want,`${why}: ${JSON.stringify(u)}`);
assert.equal(typeof STANDARD_FUNCTIONS.joinSpokenNumbers,'function','offered to flows');
console.log(`join-spoken-numbers: ${cases.length+1} checks passed`);
