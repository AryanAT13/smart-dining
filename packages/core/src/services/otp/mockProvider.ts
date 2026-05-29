/**
 * Mock OTP provider.
 *
 * Behaviour:
 *   - `send()` returns a fixed code "123456" so demos and Playwright tests
 *     don't need a real SMS.
 *   - State (attempts, expiry) is held in Redis under the same keys as the
 *     real provider so verification logic doesn't branch by provider.
 *
 * Hard rule: this provider must be unreachable in production. The env schema
 * (`packages/core/src/config/env.ts`) does not enforce that — the OtpService
 * factory function does, by refusing to construct it when NODE_ENV=production.
 */

import { keys, redis } from '../../db/redis.js';
import { OtpError } from '../../lib/errors.js';
import { childLogger } from '../../lib/logger.js';
import { OTP_TTL_SECONDS } from '../../lib/time.js';
import { hashPhone, signOtp } from '../../lib/crypto.js';

import type { OtpProvider } from './types.js';

const log = childLogger('otp-mock');

const FIXED_CODE = '123456';

interface OtpStoredState {
  signature: string;
  expiresAt: number;
  attempts: number;
}

export class MockOtpProvider implements OtpProvider {
  readonly name = 'mock';

  async send(phoneE164: string): Promise<{ expiresAt: number; debugCode: string }> {
    const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;
    const phoneHash = hashPhone(phoneE164);
    const signature = signOtp(phoneE164, FIXED_CODE, expiresAt);
    const state: OtpStoredState = { signature, expiresAt, attempts: 0 };

    await redis.set(keys.otp(phoneHash), JSON.stringify(state), 'EX', OTP_TTL_SECONDS);
    log.info({ phoneHash, expiresAt }, 'mock otp issued (use 123456 to verify)');
    return { expiresAt, debugCode: FIXED_CODE };
  }

  async verify(phoneE164: string, code: string): Promise<boolean> {
    return verifyShared(phoneE164, code);
  }
}

/**
 * Shared verification routine — used by both mock and Twilio providers
 * because the Redis-backed attempt counter and expiry checks are identical.
 *
 * Twilio's own verify endpoint also does this, but we keep our own counter
 * so we get the same UX in mock mode and so rate limits are enforced even
 * if a future provider lacks them.
 */
export async function verifyShared(phoneE164: string, code: string): Promise<boolean> {
  const phoneHash = hashPhone(phoneE164);
  const raw = await redis.get(keys.otp(phoneHash));
  if (!raw) throw new OtpError('OTP_EXPIRED', 'No active OTP for this number');

  const state = JSON.parse(raw) as OtpStoredState;
  if (Date.now() > state.expiresAt) {
    await redis.del(keys.otp(phoneHash));
    throw new OtpError('OTP_EXPIRED', 'This OTP has expired. Send a new one.');
  }
  if (state.attempts >= 3) {
    throw new OtpError('OTP_LOCKED', 'Too many attempts. Wait 5 minutes and try again.');
  }

  const expected = signOtp(phoneE164, code, state.expiresAt);
  const matches = constantTimeEqual(expected, state.signature);

  if (!matches) {
    state.attempts += 1;
    await redis.set(
      keys.otp(phoneHash),
      JSON.stringify(state),
      'EX',
      Math.max(1, Math.floor((state.expiresAt - Date.now()) / 1000)),
    );
    return false;
  }

  // Success: clear the entry so it can't be replayed.
  await redis.del(keys.otp(phoneHash));
  return true;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
