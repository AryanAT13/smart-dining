/**
 * Session memory facade — reads/writes ride on SessionService + Redis.
 *
 * Why this lives outside `services/session/`: it adds memory-specific
 * concerns (turn history, last upsell timestamps, budget counter) on top of
 * the canonical session row. SessionService owns the *durable* fields;
 * SessionMemory owns the *agent-specific* hot fields.
 */

import { keys, redis } from '../db/redis.js';
import { childLogger } from '../lib/logger.js';
import { SESSION_TTL_SECONDS } from '../lib/time.js';
import type { Turn } from './working.js';

const log = childLogger('session-memory');

const HISTORY_KEY = (sessionId: string) => `${keys.session(sessionId)}:history`;
const UPSELL_KEY = (sessionId: string) => `${keys.session(sessionId)}:upsell-last`;
const TURN_COUNT_KEY = (sessionId: string) => `${keys.session(sessionId)}:turn-count`;
const BUDGET_KEY = (sessionId: string) => keys.llmBudget(sessionId);

const MAX_HISTORY_TURNS = 30;

export class SessionMemory {
  /** Persist a turn into the Redis-backed history. Trimmed to MAX_HISTORY_TURNS. */
  async pushTurn(sessionId: string, turn: Turn): Promise<void> {
    const key = HISTORY_KEY(sessionId);
    await redis
      .multi()
      .rpush(key, JSON.stringify(turn))
      .ltrim(key, -MAX_HISTORY_TURNS, -1)
      .expire(key, SESSION_TTL_SECONDS)
      .incr(TURN_COUNT_KEY(sessionId))
      .expire(TURN_COUNT_KEY(sessionId), SESSION_TTL_SECONDS)
      .exec();
  }

  async recentTurns(sessionId: string, n = 5): Promise<Turn[]> {
    const raw = await redis.lrange(HISTORY_KEY(sessionId), -n, -1);
    return raw
      .map((r) => {
        try {
          return JSON.parse(r) as Turn;
        } catch {
          return null;
        }
      })
      .filter((t): t is Turn => t !== null);
  }

  async turnCount(sessionId: string): Promise<number> {
    const raw = await redis.get(TURN_COUNT_KEY(sessionId));
    return raw ? Number.parseInt(raw, 10) : 0;
  }

  // ---- Upsell rate-limit -------------------------------------------------

  /** Returns true if an upsell is allowed (no fire in the last `windowSeconds`). */
  async tryClaimUpsell(sessionId: string, windowSeconds = 30): Promise<boolean> {
    const key = UPSELL_KEY(sessionId);
    // SET key now EX window NX → returns 'OK' iff key didn't exist.
    const res = await redis.set(key, Date.now().toString(), 'EX', windowSeconds, 'NX');
    return res === 'OK';
  }

  async lastUpsellAt(sessionId: string): Promise<number | null> {
    const raw = await redis.get(UPSELL_KEY(sessionId));
    return raw ? Number.parseInt(raw, 10) : null;
  }

  // ---- LLM budget cap ---------------------------------------------------

  /** Accumulate cost (in USD-microcents to keep counters integer). */
  async chargeBudget(sessionId: string, costUsd: number): Promise<number> {
    const micros = Math.round(costUsd * 1_000_000);
    const total = await redis.incrby(BUDGET_KEY(sessionId), micros);
    await redis.expire(BUDGET_KEY(sessionId), SESSION_TTL_SECONDS);
    return total / 1_000_000;
  }

  async getBudgetUsd(sessionId: string): Promise<number> {
    const raw = await redis.get(BUDGET_KEY(sessionId));
    return raw ? Number.parseInt(raw, 10) / 1_000_000 : 0;
  }

  // ---- Reset / cleanup --------------------------------------------------

  async clear(sessionId: string): Promise<void> {
    await redis.del(
      HISTORY_KEY(sessionId),
      UPSELL_KEY(sessionId),
      TURN_COUNT_KEY(sessionId),
      BUDGET_KEY(sessionId),
    );
    log.debug({ sessionId }, 'session memory cleared');
  }
}

export const sessionMemory = new SessionMemory();
