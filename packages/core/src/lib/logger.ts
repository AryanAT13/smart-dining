/**
 * Structured logger — pino with PII redaction.
 *
 * Singleton. Used everywhere; agents and services bind child loggers via
 * `logger.child({ scope: 'menu-service' })` so log lines self-identify.
 *
 * Redaction rules apply across every log call:
 *   - `*.phone`, `*.customerPhone`, `*.otp` → redacted
 *   - prompt bodies are intentionally NOT redacted at the logger level — we
 *     want to see them in dev. The PII firewall lives at the prompt
 *     construction site (see `lib/promptSafety.ts` when it lands in Phase 2).
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

import { env, isProduction } from '../config/env.js';

const baseOptions: LoggerOptions = {
  level: isProduction ? 'info' : 'debug',
  base: {
    service: 'smart-dining',
    env: env.NODE_ENV,
  },
  redact: {
    paths: [
      '*.phone',
      '*.customerPhone',
      '*.otp',
      '*.code',
      'phone',
      'customerPhone',
      'otp',
      'code',
      'headers.authorization',
      'headers.cookie',
      '*.password',
      'password',
    ],
    censor: '[redacted]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
};

// In dev we want pretty output; in prod we want JSON for the log aggregator.
// `exactOptionalPropertyTypes: true` forbids `transport: undefined`, so we
// build the options object conditionally rather than threading optionality.
const options: LoggerOptions = isProduction
  ? baseOptions
  : {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', singleLine: false },
      },
    };

export const logger: Logger = pino(options);

/**
 * Bind a child logger for a specific subsystem. Always prefer this over the
 * root logger so logs are filterable by scope.
 *
 * @example
 *   const log = childLogger('menu-service');
 *   log.info({ itemId }, 'cache miss');
 */
export function childLogger(scope: string, bindings: Record<string, unknown> = {}): Logger {
  return logger.child({ scope, ...bindings });
}
