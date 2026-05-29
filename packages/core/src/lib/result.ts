/**
 * Result<T, E> — explicit success/failure type for cases where exceptions are
 * the wrong tool. We use this for:
 *   - OTP verification (failure is a normal flow, not an exception)
 *   - Cart conflicts surfaced to the UI
 *   - Agent output validation (parse-fail-then-repair is part of the loop)
 *
 * Anywhere else, throw a DomainError.
 */

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

/**
 * Unwrap or throw. Use sparingly — it defeats the purpose of Result.
 * Acceptable in tests and in glue code where failure has already been handled.
 */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error(String(r.error));
}
