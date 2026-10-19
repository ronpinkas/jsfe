#!/usr/bin/env node
/**
 * Hermetic test of jsfe/helpers otp-check.js — whether a one-time code is accepted, and why not.
 *
 *   node tests/helpers-otp-check.test.mjs
 */
import assert from 'node:assert/strict';
import { checkOtp, maskDestination, OTP_EXPIRY_MS } from '../dist/helpers/otp-check.js';

let checks = 0;
const is = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++; };

const T0 = 1_791_000_000_000;
const pending = { otpHash: 'abc', otpTimestamp: T0 };

is(checkOtp(pending, 'abc', T0 + 60_000), { ok: true, failure: null }, 'the right code inside 10 minutes');
is(checkOtp(pending, 'xyz', T0 + 60_000), { ok: false, failure: 'mismatch' }, 'a wrong code: re-ask');
is(checkOtp(pending, 'abc', T0 + OTP_EXPIRY_MS + 1), { ok: false, failure: 'expired' },
   'the right code too late is EXPIRED, not a mismatch (10-05: 37 minutes old, told "didn\'t match")');
is(checkOtp(pending, 'xyz', T0 + OTP_EXPIRY_MS + 1), { ok: false, failure: 'expired' },
   'expiry is decided before comparing: an expired code cannot be matched by any input');
is(checkOtp({ otpHash: null, otpTimestamp: null }, 'abc', T0), { ok: false, failure: 'missing' },
   'nothing pending (10-05 3:32 PM, after expiry cleared it): a fresh code is needed');
is(checkOtp(undefined, 'abc', T0), { ok: false, failure: 'missing' }, 'no container');
is(checkOtp({ otpHash: 'abc' }, 'abc', T0), { ok: false, failure: 'missing' }, 'a hash without a timestamp is not a pending code');
is(checkOtp(pending, 'abc', T0 + OTP_EXPIRY_MS), { ok: true, failure: null }, 'exactly 10 minutes is still valid');

is(maskDestination('+17025550199'), '…0199', 'a phone keeps its last 4');
is(maskDestination('someone@example.com'), '…@example.com', 'an email keeps its domain');
is(maskDestination(''), '(none)', 'nothing');

console.log(`otp-check: ${checks} checks passed`);
