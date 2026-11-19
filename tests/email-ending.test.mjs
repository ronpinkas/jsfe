// A known provider without its ending (owner 2026-11-18): emailWithoutEnding holds it, emailEnding reads the ending said alone.
import assert from 'node:assert/strict';
import { emailWithoutEnding, emailEnding, emailSaid, readEmail } from '../dist/helpers/index.js';
let n = 0; const eq = (a, b, label) => { assert.equal(a, b, label); n++; };
eq(emailWithoutEnding('Cecilia 41, at Yahoo.'), 'cecilia41@yahoo', 'prod 11-18 CA9cc00f');
eq(emailWithoutEnding('maria at hotmail'), 'maria@hotmail', 'hotmail');
eq(emailWithoutEnding('maria arroba hot mail'), 'maria@hotmail', 'hot mail, arroba');
eq(emailWithoutEnding('juan at gmail'), '', 'gmail is completed by readEmail, never held');
eq(emailWithoutEnding('pedro at curacao'), '', 'an unknown domain is never guessed');
eq(emailWithoutEnding('cecilia41 at yahoo dot com'), '', 'a whole address is not held');
eq(emailWithoutEnding('yahoo'), '', 'a provider with no name');
for (const [said, end] of [['Punto com.', '.com'], ['dot com', '.com'], ['.com', '.com'], ['com', '.com'], ['punto con', '.com'], ['dot net', '.net'], ['punto com punto mx', '.com.mx'], ['dot co dot uk', '.co.uk'], ['Yes', ''], ['it is dot com I think', ''], ['', '']]) eq(emailEnding(said), end, JSON.stringify(said));
eq(readEmail('cecilia41@yahoo' + emailEnding('Punto com.')), 'cecilia41@yahoo.com', 'joined address reads');
eq(emailSaid('a.b@aol.com', true), 'a dot b at a o l dot c o m', 'read letter by letter on a call');
eq(emailSaid('a.b@aol.com', false), 'a.b@aol.com', 'written as is');
console.log(`email ending: ${n} checks passed`);
