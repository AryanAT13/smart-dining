/**
 * OtpService — provider-agnostic facade.
 *
 * Responsibilities:
 *   - dispatch send/verify to the configured provider
 *   - issue and consume opaque verify-tokens (so the OTP code itself never
 *     re-traverses the network during order placement)
 *
 * The verify-token sits between OTP verification and order placement. After
 * a successful verify, the token is stored in Redis with a 10-minute TTL,
 * keyed to the phone hash. Placing an order consumes the token (single use).
 */

import { env, isProduction } from '../../config/env.js';
import { keys, redis } from '../../db/redis.js';
import { OtpError, ValidationError } from '../../lib/errors.js';
import { childLogger } from '../../lib/logger.js';
import { generateVerifyToken, hashPhone } from '../../lib/crypto.js';
import { OTP_VERIFY_TOKEN_TTL_SECONDS } from '../../lib/time.js';

import { MockOtpProvider } from './mockProvider.js';
import { TwilioOtpProvider } from './twilioProvider.js';
import type { OtpProvider, SendOtpResult, VerifiedOtp } from './types.js';

const log = childLogger('otp-service');

interface VerifyTokenRecord {
  phoneHash: string;
  expiresAt: number;
}

export class OtpService {
  // Lazy provider so the singleton constructed at module load doesn't touch
  // env-dependent paths until first use. Critical for Next.js build phase
  // where route modules are loaded for static analysis but never called.
  private _provider: OtpProvider | null;
  private readonly providerOverride: OtpProvider | undefined;

  constructor(provider?: OtpProvider) {
    this.providerOverride = provider;
    this._provider = provider ?? null;
  }

  private get provider(): OtpProvider {
    if (this._provider) return this._provider;
    this._provider = this.providerOverride ?? pickProvider();
    log.info({ provider: this._provider.name }, 'otp service ready');
    return this._provider;
  }

  async send(phoneE164: string): Promise<SendOtpResult> {
    assertE164(phoneE164);
    const result = await this.provider.send(phoneE164);
    return {
      expiresAt: result.expiresAt,
      ...((!isProduction && 'debugCode' in result && result.debugCode
        ? { debugCode: result.debugCode }
        : {}) as { debugCode?: string }),
    };
  }

  async verify(phoneE164: string, code: string): Promise<VerifiedOtp> {
    assertE164(phoneE164);
    if (!/^\d{6}$/.test(code)) throw new OtpError('OTP_INVALID', 'OTP must be 6 digits');

    const ok = await this.provider.verify(phoneE164, code);
    if (!ok) throw new OtpError('OTP_INVALID', 'Incorrect OTP. Try again.');

    const token = generateVerifyToken();
    const expiresAt = Date.now() + OTP_VERIFY_TOKEN_TTL_SECONDS * 1000;
    const record: VerifyTokenRecord = { phoneHash: hashPhone(phoneE164), expiresAt };
    await redis.set(
      keys.otpToken(token),
      JSON.stringify(record),
      'EX',
      OTP_VERIFY_TOKEN_TTL_SECONDS,
    );
    return { token, expiresAt };
  }

  /**
   * Single-use consumption. Returns the phone hash bound to this token.
   * Used by OrderService to assert the verifier of the phone is the placer.
   */
  async consumeToken(token: string, phoneE164: string): Promise<void> {
    const raw = await redis.get(keys.otpToken(token));
    if (!raw) throw new OtpError('OTP_EXPIRED', 'Verification token is invalid or expired.');
    const record = JSON.parse(raw) as VerifyTokenRecord;
    if (record.expiresAt < Date.now()) {
      await redis.del(keys.otpToken(token));
      throw new OtpError('OTP_EXPIRED', 'Verification token has expired.');
    }
    if (record.phoneHash !== hashPhone(phoneE164)) {
      throw new OtpError('OTP_INVALID', 'Token does not match the verified phone.');
    }
    await redis.del(keys.otpToken(token));
  }
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

function pickProvider(): OtpProvider {
  if (env.OTP_PROVIDER === 'twilio') return new TwilioOtpProvider();
  // Mock is allowed in dev/test only — the env schema already blocks
  // OTP_PROVIDER=mock in production via the demo-mode guard, but we
  // defence-in-depth here too.
  if (isProduction) {
    throw new ValidationError(
      'OTP_PROVIDER=mock is not allowed in production. Configure Twilio Verify.',
    );
  }
  return new MockOtpProvider();
}

function assertE164(phone: string): void {
  if (!/^\+?[1-9]\d{6,14}$/.test(phone)) {
    throw new ValidationError('Invalid E.164 phone', { phone: '[redacted]' });
  }
}

export const otpService = new OtpService();
