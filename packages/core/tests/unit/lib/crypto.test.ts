import './../setup';

import { describe, expect, it } from 'vitest';

import {
  generateOtpCode,
  generateVerifyToken,
  hashPhone,
  signOtp,
  verifyOtpSignature,
} from '../../../src/lib/crypto.js';

describe('crypto', () => {
  describe('hashPhone', () => {
    it('is deterministic for the same input', () => {
      const a = hashPhone('+919876543210');
      const b = hashPhone('+919876543210');
      expect(a).toBe(b);
      expect(a).toHaveLength(64);
    });

    it('produces different hashes for different inputs', () => {
      const a = hashPhone('+919876543210');
      const b = hashPhone('+919876543211');
      expect(a).not.toBe(b);
    });
  });

  describe('generateOtpCode', () => {
    it('produces a 6-digit numeric string', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateOtpCode();
        expect(code).toMatch(/^\d{6}$/);
      }
    });
  });

  describe('signOtp / verifyOtpSignature', () => {
    it('round-trips a valid signature', () => {
      const phone = '+919876543210';
      const code = '123456';
      const exp = Date.now() + 300_000;
      const sig = signOtp(phone, code, exp);
      expect(verifyOtpSignature(phone, code, exp, sig)).toBe(true);
    });

    it('rejects a tampered code', () => {
      const phone = '+919876543210';
      const exp = Date.now() + 300_000;
      const sig = signOtp(phone, '123456', exp);
      expect(verifyOtpSignature(phone, '654321', exp, sig)).toBe(false);
    });

    it('rejects a tampered phone', () => {
      const exp = Date.now() + 300_000;
      const sig = signOtp('+919876543210', '123456', exp);
      expect(verifyOtpSignature('+919876543211', '123456', exp, sig)).toBe(false);
    });

    it('rejects a tampered expiry', () => {
      const phone = '+919876543210';
      const exp = Date.now() + 300_000;
      const sig = signOtp(phone, '123456', exp);
      expect(verifyOtpSignature(phone, '123456', exp + 1, sig)).toBe(false);
    });

    it('handles malformed signatures without throwing', () => {
      const phone = '+919876543210';
      const exp = Date.now() + 300_000;
      expect(verifyOtpSignature(phone, '123456', exp, 'too-short')).toBe(false);
    });
  });

  describe('generateVerifyToken', () => {
    it('produces a unique base64url token each time', () => {
      const tokens = new Set(Array.from({ length: 50 }, () => generateVerifyToken()));
      expect(tokens.size).toBe(50);
      for (const t of tokens) {
        expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(t.length).toBeGreaterThanOrEqual(32);
      }
    });
  });
});
