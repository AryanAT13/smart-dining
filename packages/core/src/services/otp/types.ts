export interface OtpProvider {
  readonly name: string;
  /** Send an OTP to the phone. The actual code is returned only by the mock provider. */
  send(phoneE164: string): Promise<{ expiresAt: number; debugCode?: string }>;
  /** Verify a code. Returns true on success, false on mismatch. Throws on lockout / expiry. */
  verify(phoneE164: string, code: string): Promise<boolean>;
}

export interface SendOtpResult {
  expiresAt: number;
  /** Only populated in dev / mock mode. */
  debugCode?: string;
}

export interface VerifiedOtp {
  /** Opaque token consumed once at order placement. */
  token: string;
  expiresAt: number;
}
