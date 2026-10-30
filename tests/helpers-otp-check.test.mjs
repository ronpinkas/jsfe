#!/usr/bin/env node
/**
 * Hermetic test of jsfe/helpers otp-check.js — whether a one-time code is accepted, and why not.
 *
 *   node tests/helpers-otp-check.test.mjs
 */
import assert from 'node:assert/strict';
import { checkOtp, clearOtp, maskDestination, validateOTP, OTP_EXPIRY_MS } from '../dist/helpers/otp-check.js';

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

// A second code emailed beside the texted one: either is accepted while it is live; neither replaces the other.
const both = { otpHash: 'sms', otpTimestamp: T0, otpAltHash: 'mail', otpAltTimestamp: T0 + 120_000 };
is(checkOtp(both, 'sms', T0 + 180_000), { ok: true, failure: null }, 'the texted code still works after an emailed one');
is(checkOtp(both, 'mail', T0 + 180_000), { ok: true, failure: null }, 'the emailed code works');
is(checkOtp(both, 'xyz', T0 + 180_000), { ok: false, failure: 'mismatch' }, 'neither: a mismatch');
is(checkOtp(both, 'mail', T0 + OTP_EXPIRY_MS + 60_000), { ok: true, failure: null }, 'each expires on its own clock: the later emailed code outlives the texted one');
is(checkOtp(both, 'sms', T0 + OTP_EXPIRY_MS + 60_000), { ok: false, failure: 'mismatch' }, 'an expired code among live ones is a mismatch, not an expiry');
is(checkOtp(both, 'mail', T0 + 120_000 + OTP_EXPIRY_MS + 1), { ok: false, failure: 'expired' }, 'both past their time: expired');
is(checkOtp({ otpHash: null, otpTimestamp: null, otpAltHash: 'mail', otpAltTimestamp: T0 }, 'mail', T0), { ok: true, failure: null }, 'the emailed code alone is a pending code');
{
   const c = { ...both };
   is(clearOtp(c) && [c.otpHash, c.otpTimestamp, c.otpAltHash, c.otpAltTimestamp], [null, null, null, null], 'clearOtp clears both codes');
   const sha = async (v) => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))).map((b) => b.toString(16).padStart(2, '0')).join('');
   const live = { otpHash: await sha('111111'), otpTimestamp: Date.now(), otpAltHash: await sha('222222'), otpAltTimestamp: Date.now() };
   is(await validateOTP('222222', live), true, 'validateOTP accepts the emailed code');
   is([live.otpHash, live.otpAltHash, live.otpVerified], [null, null, true], 'and clears both codes once one is accepted');
}

is(maskDestination('+17025550199'), '…0199', 'a phone keeps its last 4');
is(maskDestination('someone@example.com'), '…@example.com', 'an email keeps its domain');
is(maskDestination(''), '(none)', 'nothing');

console.log(`otp-check: ${checks} checks passed`);
