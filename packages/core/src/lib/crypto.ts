/**
 * Cryptographic helpers — HMAC-SHA256 for OTP signing and phone hashing.
 *
 * All keys come from env. Functions are pure and synchronous; Node's `crypto`
 * is C++-bound and faster than awaiting.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// PII — phone hashing (per spec §12.4, never store unhashed phones in logs
// or analytical tables). Used as the lookup key for the `users` table.
// ---------------------------------------------------------------------------

export function hashPhone(phoneE164: string): string {
  return createHmac('sha256', env.PII_HASH_SECRET).update(phoneE164).digest('hex');
}

// ---------------------------------------------------------------------------
// OTP — HMAC-signed codes so we can verify without storing the plaintext.
// Storage shape (Redis): otp:{phoneHash} → { signature, expiresAt, attempts }
// ---------------------------------------------------------------------------

const OTP_DIGITS = 6;

export function generateOtpCode(): string {
  // 6-digit numeric, leading zeros allowed.
  const n = randomBytes(4).readUInt32BE(0) % 10 ** OTP_DIGITS;
  return n.toString().padStart(OTP_DIGITS, '0');
}

export function signOtp(phoneE164: string, code: string, expiresAt: number): string {
  return createHmac('sha256', env.JWT_SECRET)
    .update(`${phoneE164}|${code}|${expiresAt}`)
    .digest('hex');
}

export function verifyOtpSignature(
  phoneE164: string,
  code: string,
  expiresAt: number,
  signature: string,
): boolean {
  const expected = signOtp(phoneE164, code, expiresAt);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Opaque verify tokens — issued after OTP success, consumed once at order
// placement. Avoids requiring the OTP code to be re-sent.
// ---------------------------------------------------------------------------

export function generateVerifyToken(): string {
  return randomBytes(24).toString('base64url');
}
