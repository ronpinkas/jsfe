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
console.log(`capture: ${checks} checks passed`);
