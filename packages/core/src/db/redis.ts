/**
 * Redis singletons.
 *
 * We expose THREE clients:
 *   - `redis`        — main client for commands (GET, SET, HSET, ...)
 *   - `redisPub`     — dedicated publisher
 *   - `redisSub`     — dedicated subscriber (blocking; must not be shared)
 *
 * Why three: ioredis (correctly) refuses to use a subscribed connection for
 * regular commands. The Socket.io Redis adapter also expects pub/sub on
 * separate connections.
 *
 * The gateway boots all three; the Next.js runtime only needs `redis` and
 * `redisPub` because it never subscribes — it publishes cart events and the
 * gateway broadcasts them.
 */

import Redis, { type Redis as RedisClient } from 'ioredis';

import { env, isDevelopment } from '../config/env.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('redis');

function buildClient(role: string): RedisClient {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    reconnectOnError: (err) => {
      log.warn({ role, err: err.message }, 'redis reconnect-on-error');
      return true;
    },
  });

  client.on('connect', () => log.info({ role }, 'redis connected'));
  client.on('ready', () => log.debug({ role }, 'redis ready'));
  client.on('error', (e) => log.error({ role, err: e.message }, 'redis error'));
  client.on('close', () => log.warn({ role }, 'redis connection closed'));
  client.on('reconnecting', (delay: number) =>
    log.warn({ role, delayMs: delay }, 'redis reconnecting'),
  );

  return client;
}

declare global {
  // eslint-disable-next-line no-var
  var __REDIS__: { main?: RedisClient; pub?: RedisClient; sub?: RedisClient } | undefined;
}

const cache = (globalThis.__REDIS__ ??= {});
if (isDevelopment) globalThis.__REDIS__ = cache;

export const redis: RedisClient = cache.main ?? (cache.main = buildClient('main'));
export const redisPub: RedisClient = cache.pub ?? (cache.pub = buildClient('pub'));

/**
 * Subscriber is lazily instantiated. The web API doesn't need it; only the
 * gateway calls `redisSub()` at boot.
 */
export function redisSub(): RedisClient {
  if (!cache.sub) cache.sub = buildClient('sub');
  return cache.sub;
}

// ---------------------------------------------------------------------------
// Key conventions — single source of truth for every Redis key in the app.
// Centralising these prevents the "what's that key again?" archaeology that
// plagues Redis-heavy systems.
// ---------------------------------------------------------------------------

export const keys = {
  session: (sessionId: string) => `session:${sessionId}`,
  sessionByTable: (tableId: string) => `table:active-session:${tableId}`,
  cart: (sessionId: string) => `cart:${sessionId}`,
  otp: (phoneHash: string) => `otp:${phoneHash}`,
  otpToken: (token: string) => `otp:verified:${token}`,
  rateLimit: (scope: string, identifier: string, bucket: number) =>
    `rate:${scope}:${identifier}:${bucket}`,
  llmBudget: (sessionId: string) => `budget:${sessionId}`,
} as const;

export const channels = {
  /** Per-table fan-out for cart, AI message, and order events. */
  table: (tableId: string) => `table:${tableId}`,
  /** Global kitchen channel — every kitchen dashboard subscribes here. */
  kitchen: () => 'kitchen',
} as const;
