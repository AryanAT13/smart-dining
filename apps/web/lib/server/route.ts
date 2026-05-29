/**
 * Shared route-handler helpers.
 *
 * Every API route:
 *   - validates inputs with a Zod schema
 *   - returns the standard {ok: true, data} | {ok: false, error} envelope
 *   - catches DomainError subclasses and translates to the right HTTP status
 *
 * `withErrors()` is the wrapper every handler exports.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';

import { DomainError, childLogger } from '@smart-dining/core';

const log = childLogger('api');

export type RouteHandler<C = Record<string, never>> = (
  req: NextRequest,
  ctx: { params: C },
) => Promise<NextResponse> | NextResponse;

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

/**
 * Wrap a handler so all DomainError + ZodError + unknown failures produce
 * consistent envelopes and structured logs.
 */
export function withErrors<C = Record<string, never>>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof DomainError) {
        log.info(
          { code: err.code, message: err.message, path: req.nextUrl.pathname },
          'domain error',
        );
        return jsonError(err.code, err.message, err.statusCode, err.details);
      }
      if (err instanceof ZodError) {
        log.info({ issues: err.issues, path: req.nextUrl.pathname }, 'validation error');
        return jsonError('VALIDATION', 'Invalid request body', 400, {
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      const message = err instanceof Error ? err.message : 'Internal error';
      log.error({ err: message, path: req.nextUrl.pathname }, 'unhandled route error');
      return jsonError('INTERNAL', 'Something went wrong', 500);
    }
  };
}

/**
 * Validate a request body against a Zod schema. Throws ZodError on mismatch
 * which `withErrors` translates to a 400.
 */
export async function parseBody<S extends ZodSchema>(req: NextRequest, schema: S): Promise<ReturnType<S['parse']>> {
  const body = (await req.json().catch(() => null)) as unknown;
  return schema.parse(body) as ReturnType<S['parse']>;
}
