/**
 * Twilio Verify OTP provider.
 *
 * We let Twilio own the SMS send and the actual code value; we layer our own
 * attempt counter on top for parity with the mock provider and to avoid
 * paying Twilio's per-attempt costs during a brute-force.
 */

import twilio from 'twilio';

import { env } from '../../config/env.js';
import { keys, redis } from '../../db/redis.js';
import { OtpError, UpstreamError, ValidationError } from '../../lib/errors.js';
import { childLogger } from '../../lib/logger.js';
import { OTP_TTL_SECONDS } from '../../lib/time.js';
import { hashPhone } from '../../lib/crypto.js';

import type { OtpProvider } from './types.js';

const log = childLogger('otp-twilio');

interface TwilioAttemptState {
  attempts: number;
  expiresAt: number;
}

export class TwilioOtpProvider implements OtpProvider {
  readonly name = 'twilio';
  private readonly client: ReturnType<typeof twilio>;
  private readonly serviceSid: string;

  constructor() {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_VERIFY_SERVICE_SID) {
      throw new ValidationError(
        'TwilioOtpProvider requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID',
      );
    }
    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    this.serviceSid = env.TWILIO_VERIFY_SERVICE_SID;
  }

  async send(phoneE164: string): Promise<{ expiresAt: number }> {
    try {
      await this.client.verify.v2
        .services(this.serviceSid)
        .verifications.create({ to: phoneE164, channel: 'sms' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UpstreamError('twilio', message);
    }
    const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;
    const state: TwilioAttemptState = { attempts: 0, expiresAt };
    await redis.set(
      keys.otp(hashPhone(phoneE164)),
      JSON.stringify(state),
      'EX',
      OTP_TTL_SECONDS,
    );
    log.info({ phoneHash: hashPhone(phoneE164) }, 'twilio verify code sent');
    return { expiresAt };
  }

  async verify(phoneE164: string, code: string): Promise<boolean> {
    const phoneHash = hashPhone(phoneE164);
    const raw = await redis.get(keys.otp(phoneHash));
    if (!raw) throw new OtpError('OTP_EXPIRED', 'No active OTP for this number');

    const state = JSON.parse(raw) as TwilioAttemptState;
    if (Date.now() > state.expiresAt) {
      await redis.del(keys.otp(phoneHash));
      throw new OtpError('OTP_EXPIRED', 'This OTP has expired. Send a new one.');
    }
    if (state.attempts >= 3) {
      throw new OtpError('OTP_LOCKED', 'Too many attempts. Wait 5 minutes and try again.');
    }

    let approved = false;
    try {
      const check = await this.client.verify.v2
        .services(this.serviceSid)
        .verificationChecks.create({ to: phoneE164, code });
      approved = check.status === 'approved';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UpstreamError('twilio', message);
    }

    if (!approved) {
      state.attempts += 1;
      const ttl = Math.max(1, Math.floor((state.expiresAt - Date.now()) / 1000));
      await redis.set(keys.otp(phoneHash), JSON.stringify(state), 'EX', ttl);
      return false;
    }

    await redis.del(keys.otp(phoneHash));
    return true;
  }
}
