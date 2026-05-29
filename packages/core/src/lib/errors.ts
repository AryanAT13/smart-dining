/**
 * Typed error hierarchy.
 *
 * Every service throws `DomainError` subclasses. API route handlers translate
 * them to `{ ok: false, error: { code, message } }` envelopes by switching on
 * the class — no string matching on error messages.
 */

export type ErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'STOCK_UNAVAILABLE'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_LOCKED'
  | 'SESSION_EXPIRED'
  | 'CART_VERSION_MISMATCH'
  | 'BUDGET_EXCEEDED'
  | 'UPSTREAM_FAILED'
  | 'INTERNAL';

export abstract class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown>;

  protected constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    // Preserve stack across V8.
    if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
  }

  toJSON(): { code: ErrorCode; message: string; details: Record<string, unknown> } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, identifier?: string | number) {
    super('NOT_FOUND', `${resource} not found${identifier ? `: ${identifier}` : ''}`, 404, {
      resource,
      identifier,
    });
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('CONFLICT', message, 409, details);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('VALIDATION', message, 400, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class RateLimitError extends DomainError {
  constructor(scope: string, retryAfterSeconds: number) {
    super('RATE_LIMITED', `Rate limit exceeded for ${scope}`, 429, { scope, retryAfterSeconds });
  }
}

export class StockUnavailableError extends DomainError {
  constructor(itemName: string, itemId: string) {
    super('STOCK_UNAVAILABLE', `"${itemName}" is no longer available`, 409, { itemName, itemId });
  }
}

export class OtpError extends DomainError {
  constructor(code: 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_LOCKED', message: string) {
    super(code, message, code === 'OTP_LOCKED' ? 429 : 400);
  }
}

export class SessionExpiredError extends DomainError {
  constructor(sessionId: string) {
    super('SESSION_EXPIRED', 'This dining session has expired. Please rescan the QR code.', 410, {
      sessionId,
    });
  }
}

export class CartVersionMismatchError extends DomainError {
  constructor(cartItemId: string, expected: number, actual: number) {
    super(
      'CART_VERSION_MISMATCH',
      'This item was just updated by another diner. Refreshing your cart.',
      409,
      { cartItemId, expected, actual },
    );
  }
}

export class BudgetExceededError extends DomainError {
  constructor(sessionId: string, capUsd: number) {
    super(
      'BUDGET_EXCEEDED',
      'AI budget exceeded for this session — falling back to suggestions without AI.',
      402,
      { sessionId, capUsd },
    );
  }
}

export class UpstreamError extends DomainError {
  constructor(upstream: string, message: string, details: Record<string, unknown> = {}) {
    super('UPSTREAM_FAILED', `Upstream ${upstream} failed: ${message}`, 502, {
      upstream,
      ...details,
    });
  }
}

/**
 * Narrow an unknown caught value to a DomainError or wrap it.
 * Keeps catch blocks honest under `useUnknownInCatchVariables: true`.
 */
class InternalError extends DomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('INTERNAL', message, 500, details);
  }
}

export function toDomainError(err: unknown, fallbackMessage = 'Internal error'): DomainError {
  if (err instanceof DomainError) return err;
  if (err instanceof Error) {
    return new InternalError(err.message || fallbackMessage, { cause: err.name });
  }
  return new InternalError(fallbackMessage);
}
