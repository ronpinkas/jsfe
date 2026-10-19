// jsfe/helpers date-words.js — a date as words.
//   node tests/helpers-date-words.test.mjs
import assert from 'node:assert/strict';
import { dateToWords } from '../dist/helpers/date-words.js';

let checks = 0;
const eq = (got, want, what) => { assert.equal(got, want, what); checks++; };
eq(dateToWords('2026-12-31'), 'December 31, 2026', 'English with the year');
eq(dateToWords('2026-11-05', 'es'), '5 de noviembre de 2026', 'Spanish with the year');
eq(dateToWords('2026-11-05', 'en', false), 'November 5', 'English without the year');
eq(dateToWords('2026-11-05T00:00:00Z', 'es', false), '5 de noviembre', 'a timestamp, Spanish without the year');
eq(dateToWords('next week'), 'next week', 'not a date: unchanged');
eq(dateToWords('2026-13-01'), '2026-13-01', 'no such month: unchanged');
eq(dateToWords(null), '', 'nothing');
console.log(`date-words: ${checks} checks passed`);
