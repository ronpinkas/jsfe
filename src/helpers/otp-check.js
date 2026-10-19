/**
 * Is this one-time code accepted — and if not, WHY? (validateOTP)
 *
 * validateOTP returns a boolean, which every flow condition depends on. Until 2026-10-05 the reason
 * a code was refused was lost: an EXPIRED code (which validateOTP also clears) and a wrong one
 * both read as "That code didn't match. Let's try again." — and the flow asked again for a code
 * that could no longer exist. A WhatsApp customer looped for 19 minutes on
 * exactly that (2026-10-05). The reason now rides on the container as `otpFailure`, so the
 * flow can send a fresh code for 'expired' / 'missing' and re-ask only on 'mismatch'.
 *
 * Pure, no imports. Tested by scripts/tests/otp-check.mjs in CI.
 */

export const OTP_EXPIRY_MS = 10 * 60 * 1000;

/**
 * @param {{otpHash?: string|null, otpTimestamp?: number|null}} stored  the container's pending code
 * @param {string} providedHash  sha256 of what the customer entered
 * @param {number} now
 * @returns {{ok: boolean, failure: null|'missing'|'expired'|'mismatch'}}
 */
export function checkOtp(stored, providedHash, now) {
   if (!stored || !stored.otpHash || !stored.otpTimestamp) {
      return { ok: false, failure: 'missing' };
   } else if (now - stored.otpTimestamp > OTP_EXPIRY_MS) {
      return { ok: false, failure: 'expired' };
   } else if (providedHash !== stored.otpHash) {
      return { ok: false, failure: 'mismatch' };
   } else {
      return { ok: true, failure: null };
   }
}

/** A destination for a log line: the last 4 digits of a phone, or the domain of an email. */
export function maskDestination(to) {
   const s = String(to || '');
   if (s.includes('@')) {
      return `…@${s.split('@').pop()}`;
   } else {
      const digits = s.replace(/\D/g, '');
      return digits ? `…${digits.slice(-4)}` : '(none)';
   }
}

/**
 * A flow's code check (validateOTP): hashes what the customer entered (SHA-256, the hash the code senders store in
 * container.otpHash) and checks it with checkOtp. Accepted: the pending code is cleared and container.otpVerified /
 * otpVerifiedAt are set. Expired: the code is cleared (it can never be accepted again). Every refusal leaves its reason
 * in container.otpFailure ('missing' | 'expired' | 'mismatch'). Uses the platform's Web Crypto, so it needs no host.
 */
export async function validateOTP(otp, container) {
   const bytes = new TextEncoder().encode(String(otp ?? ''));
   const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
   const providedHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
   const verdict = checkOtp(container, providedHash, Date.now());
   if (verdict.ok) {
      container.otpHash = null;
      container.otpTimestamp = null;
      delete container.otpFailure;
      container.otpVerified = true;
      container.otpVerifiedAt = Date.now();
      return true;
   } else if (verdict.failure === 'expired') {
      container.otpHash = null;
      container.otpTimestamp = null;
      container.otpVerified = false;
      container.otpFailure = 'expired';
      return false;
   } else {
      container.otpFailure = verdict.failure;
      return false;
   }
}
