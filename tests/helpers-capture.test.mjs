// jsfe/helpers capture.js — a contact in a free answer.
//   node tests/helpers-capture.test.mjs
import assert from 'node:assert/strict';
import { normalizeAndFindCapture as f } from '../dist/helpers/capture.js';

const P = [{ variable: 'cell_number', regex: '[0-9\\-\\(\\)\\.\\s]{10,}', normalizer: '[^0-9]' }, { variable: 'email', regex: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}' }];
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, what); checks++; };
eq(f('my email is ron@example.com', P), { variable: 'email', value: 'ron@example.com' }, 'only the address');
eq(f('213-555-0147', P), { variable: 'cell_number', value: '2135550147' }, 'digits of a phone');
eq(f('my phone is (213) 555 0147 thanks', P), { variable: 'cell_number', value: '2135550147' }, 'a phone in a sentence');
eq(f('yes', P), null, 'no contact');
eq(f('x', null), null, 'no patterns');
let warned = '';
eq(f('abc', [{ variable: 'v', regex: '[' }, { variable: 'w', regex: 'abc' }], (m) => { warned = m; }), { variable: 'w', value: 'abc' }, 'an invalid pattern is skipped');
assert.match(warned, /Invalid regex/); checks++;
const R = [{ variable: 'cell_number', reader: 'phone' }, { variable: 'email', reader: 'email' }];
eq(f('juan at gmail dot com', R), { variable: 'email', value: 'juan@gmail.com' }, 'a reader pattern reads a spoken email');
eq(f('1 (213) 555-0147', R), { variable: 'cell_number', value: '2135550147' }, 'a reader pattern reads a phone');
eq(f('yes', R), null, 'a reader pattern finds nothing');
// The retry menu's account capture reads with readIdentifier (owner 2026-11-24: one reader, no copy).
const A = [...R, { variable: 'acct_number', reader: 'account', regex: '^5\\d{6,7}$' }];
eq(f('5623 1348', A), { variable: 'acct_number', value: '56231348' }, 'an account in the tenant pattern');
eq(f('my account is 5 6 2 3 1 3 4 8', A), { variable: 'acct_number', value: '56231348' }, 'said digit by digit');
eq(f('ab5123456@gmail.com', A), { variable: 'email', value: 'ab5123456@gmail.com' }, 'the digits inside an email are the email\'s');
eq(f('1234', A), null, 'not the tenant pattern');
console.log(`capture: ${checks} checks passed`);
