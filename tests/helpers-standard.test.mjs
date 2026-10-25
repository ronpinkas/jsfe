// jsfe/helpers: validateOTP (Web Crypto), the shape validators, URL speech, and the STANDARD_FUNCTIONS map.
//   node tests/helpers-standard.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as H from '../dist/helpers/index.js';

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, what); checks++; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// validateOTP: the hash it computes is the hash a sender stores (node's SHA-256 of the code)
let c = { otpHash: sha('123456'), otpTimestamp: Date.now() };
eq(await H.validateOTP('654321', c), false, 'a wrong code is refused');
eq(c.otpFailure, 'mismatch', '…as a mismatch, the code kept');
eq(await H.validateOTP('123456', c), true, 'the right code is accepted');
eq([c.otpVerified, c.otpHash, c.otpTimestamp, 'otpFailure' in c], [true, null, null, false], 'accepted: verified, the code cleared');
c = { otpHash: sha('123456'), otpTimestamp: Date.now() - H.OTP_EXPIRY_MS - 1 };
eq(await H.validateOTP('123456', c), false, 'an expired code is refused');
eq([c.otpFailure, c.otpHash, c.otpVerified], ['expired', null, false], '…and cleared');
eq(await H.validateOTP('123456', {}), false, 'no pending code');

// validators (the host's rules, moved as they were)
eq([H.validateDigits('12345', 5, 5), H.validateDigits('12a45', 5, 5), H.validateDigits('123', 4, 6)], [true, false, false], 'validateDigits');
eq([H.validatePhone('(213) 555-0147'), H.validatePhone('12135550147'), H.validatePhone('525512345678'), H.validatePhone('525512345678', true)], [true, true, false, true], 'validatePhone');
eq([H.validateEmail('a@b.co'), H.validateEmail('a b@c.co'), H.validateEmail('ab.co')], [true, false, false], 'validateEmail');

// URL speech
eq(H.urlToSpeech('https://www.example.com/forgot-password?x=1'), 'example dot com slash forgot dash password', 'English');
eq(H.urlToSpeech('https://example.com/a_b', 'es'), 'example punto com diagonal a guión bajo b', 'Spanish');
eq(H.textWithUrlToSpeech('Visit https://example.com today'), 'Visit example dot com today', 'inside a text');

// STANDARD_FUNCTIONS: every entry is a function, and every system flow's expression function is in it or is a host's
const host = ['sendTwilioSMS', 'sendSMSOTP', 'sendEmail', 'sendEmailOTP', 'sendWhatsAppInvite', 'getLiveConnectLink', 'getWhatsAppLink', 'switchToSMS', 'geocodeAddress', 'findClosestLocation', 'setUserName'];
eq(Object.values(H.STANDARD_FUNCTIONS).every((f) => typeof f === 'function'), true, 'all functions');
const fs = await import('node:fs');
const text = fs.readFileSync(new URL('../flows/system.flows.json', import.meta.url), 'utf8');
// expressions only: step values and CASE keys, never descriptions (prose like "question(s)")
const exprs = [];
const walk = (o, key) => { if (Array.isArray(o)) { o.forEach((x) => walk(x, key)); } else if (o && typeof o === 'object') { Object.entries(o).forEach(([k, v]) => { if (k.startsWith('condition:')) { exprs.push(k); } else { /* a field */ } if (k !== 'description') { walk(v, k); } else { /* prose */ } }); } else if (typeof o === 'string' && ['value', 'value_es', 'asSpoken', 'pii'].includes(key)) { exprs.push(o); } else { /* not an expression */ } };
walk(JSON.parse(text).map((fl) => fl.steps));
// a name followed by '(?' is a regular expression group (have(?:…)), not a call
const called = [...new Set(exprs.flatMap((e) => [...e.matchAll(/(?<![.\w$])([a-z][A-Za-z0-9]+)\((?!\?)/g)].map((m) => m[1])))];
const known = new Set([...Object.keys(H.STANDARD_FUNCTIONS), ...host]);
const jsNames = new Set(['function', 'if', 'test', 'replace', 'split', 'join', 'filter', 'map', 'indexOf', 'slice', 'trim', 'toLowerCase', 'toUpperCase', 'parseInt', 'parseFloat', 'isNaN', 'some', 'every', 'forEach', 'push', 'concat', 'match', 'exec', 'keys', 'assign', 'max', 'min', 'round', 'floor', 'abs', 'now', 'charAt', 'substring', 'lastIndexOf', 'startsWith', 'endsWith', 'includes', 'reduce', 'find', 'toFixed', 'padStart', 'sort', 'reverse', 'from', 'isArray', 'stringify', 'parse', 'getTime', 'toString', 'repeat', 'pop', 'shift', 'splice', 'values', 'entries', 'normalize', 'search', 'getDate', 'getMonth', 'getFullYear', 'getHours', 'getDay', 'toLocaleString', 'trunc', 'ceil', 'encodeURIComponent', 'decodeURIComponent', 'fromCharCode', 'charCodeAt', 'flat', 'findIndex', 'toISOString', 'setDate', 'setMonth', 'getMinutes', 'catch', 'then', 'apply', 'call', 'bind', 'fn', 'function', 'while', 'for', 'switch', 'return', 'typeof', 'new', 'take', 'date', 'd', 'n', 'p', 'k', 'f', 'g', 'add', 'set', 'has', 'get', 'hasOwnProperty']);
const unknown = called.filter((n) => !known.has(n) && !jsNames.has(n) && !/^[a-z]$/.test(n));
// names a flow defines for itself inside an expression (var x = function …, or a named function expression as
// expression() writes them: (function otpPrompt(…){…})(cargo), or an arrow assigned to a name) are not functions it
// needs from a host
const local = new Set([...text.matchAll(/(?:var|let|const)\s+([a-zA-Z0-9_]+)\s*=\s*(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_]+\s*=>)|function ([a-zA-Z0-9_]+)\(|[,;{(]\s*([a-zA-Z0-9_]+)\s*=\s*(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_]+\s*=>)/g)].map((m) => m[1] || m[2] || m[3]));
eq(unknown.filter((n) => !local.has(n)), [], 'every function the system flows call is standard or a known host function');

console.log(`helpers-standard: ${checks} checks passed`);
