/**
 * Per-IP connection rate limiter — fixed window of 60 seconds.
 *
 * Tuned conservatively: 30 connection attempts per IP per minute. Real diners
 * connect once per session; this leaves headroom for a noisy NAT but blocks
 * attempted floods.
 */

import type { Socket } from 'socket.io';

import { childLogger } from '@smart-dining/core';

const log = childLogger('gateway-ratelimit');
const WINDOW_MS = 60_000;
const LIMIT = 30;

const counters = new Map<string, { count: number; resetAt: number }>();

export function connectionRateLimiter() {
  return (socket: Socket, next: (err?: Error) => void): void => {
    const ip = (
      socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
      socket.handshake.address ??
      'unknown'
    );

    const now = Date.now();
    const entry = counters.get(ip);
    if (!entry || entry.resetAt < now) {
      counters.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }
    entry.count += 1;
    if (entry.count > LIMIT) {
      log.warn({ ip, count: entry.count }, 'connection rate limit exceeded');
      return next(new Error('Too many connection attempts. Try again in a minute.'));
    }
    next();
  };
}

// Sweep expired entries every minute to keep memory bounded.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of counters) {
    if (entry.resetAt < now) counters.delete(ip);
  }
}, WINDOW_MS).unref();
