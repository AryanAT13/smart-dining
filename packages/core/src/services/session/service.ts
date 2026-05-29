/**
 * SessionService — owns the lifecycle of a table session.
 *
 * Durability model (per ADR-006):
 *   - Postgres `sessions` is the source of truth.
 *   - Redis `session:{id}` mirrors a hot subset (preferences, summary, language,
 *     last_upsell_at) so agents read at sub-ms latency without a DB hop.
 *   - `table:active-session:{tableId}` indexes the currently-active session
 *     for a table so the QR landing can resolve in one Redis GET.
 *
 * TTL handling: Postgres `expires_at` is the canonical expiry; Redis keys
 * carry a matching TTL. A session that's been "ordered" survives both — its
 * status is the terminator, not its TTL.
 */

import type { Prisma, PrismaClient, Session } from '@prisma/client';

import {
  type Language,
  LanguageSchema,
  UserPreferencesSchema,
  type UserPreferences,
  mergePreferences,
} from '@smart-dining/shared';

import { prisma } from '../../db/client.js';
import { keys, redis } from '../../db/redis.js';
import { NotFoundError, SessionExpiredError, ValidationError } from '../../lib/errors.js';
import { childLogger } from '../../lib/logger.js';
import { plusHours, SESSION_TTL_HOURS, SESSION_TTL_SECONDS } from '../../lib/time.js';

import type { SessionView } from './types.js';

const log = childLogger('session-service');

interface RedisSessionShape {
  preferences: UserPreferences;
  conversationSummary: string | null;
  language: Language | null;
  lastUpsellAt: number | null;
}

export class SessionService {
  constructor(private readonly db: PrismaClient = prisma) {}

  // -------------------------------------------------------------------------
  // Lookup / lifecycle
  // -------------------------------------------------------------------------

  /**
   * Resolve or create the active session for a table. Idempotent: concurrent
   * QR scans by multiple diners converge on the same row via the active-session
   * Redis index plus a unique constraint at the DB level (status filter).
   */
  async getOrCreateForTable(tableId: string): Promise<SessionView> {
    const normalized = normalizeTableId(tableId);

    // Fast path: Redis index.
    const cachedId = await redis.get(keys.sessionByTable(normalized));
    if (cachedId) {
      const cached = await this.db.session.findUnique({ where: { id: cachedId } });
      if (cached && cached.status === 'active' && cached.expiresAt > new Date()) {
        return toView(cached);
      }
      // Stale cache; clear and fall through.
      await redis.del(keys.sessionByTable(normalized));
    }

    // Slow path: query for an active row.
    const existing = await this.db.session.findFirst({
      where: { tableId: normalized, status: 'active', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      await this.indexInRedis(existing);
      return toView(existing);
    }

    // Create.
    const expiresAt = plusHours(new Date(), SESSION_TTL_HOURS);
    const created = await this.db.session.create({
      data: { tableId: normalized, status: 'active', expiresAt, preferences: {} },
    });
    await this.indexInRedis(created);
    log.info({ sessionId: created.id, tableId: normalized }, 'session created');
    return toView(created);
  }

  async getById(sessionId: string): Promise<SessionView> {
    const row = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!row) throw new NotFoundError('Session', sessionId);
    return toView(row);
  }

  /** Validate that a session exists and is still usable. */
  async assertActive(sessionId: string): Promise<SessionView> {
    const view = await this.getById(sessionId);
    if (view.status !== 'active') throw new SessionExpiredError(sessionId);
    if (view.expiresAt < new Date()) {
      await this.markExpired(sessionId).catch((err) =>
        log.warn({ sessionId, err: String(err) }, 'failed to flip expired flag'),
      );
      throw new SessionExpiredError(sessionId);
    }
    return view;
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  /**
   * Merge a preferences patch into both Postgres and Redis.
   * Atomicity: we write Postgres first (durable), Redis second (cache).
   * A Redis failure logs and continues — the next read repopulates from PG.
   */
  async updatePreferences(sessionId: string, patch: UserPreferences): Promise<SessionView> {
    const parsed = UserPreferencesSchema.safeParse(patch);
    if (!parsed.success) {
      throw new ValidationError('Invalid preferences patch', { issues: parsed.error.issues });
    }

    const updated = await this.db.$transaction(async (tx) => {
      const current = await tx.session.findUnique({ where: { id: sessionId } });
      if (!current) throw new NotFoundError('Session', sessionId);
      const currentPrefs = parseStoredPreferences(current.preferences);
      const merged = mergePreferences(currentPrefs, parsed.data);
      return tx.session.update({
        where: { id: sessionId },
        data: { preferences: merged as Prisma.InputJsonValue },
      });
    });

    await this.refreshRedisFromRow(updated).catch((err) =>
      log.warn({ sessionId, err: String(err) }, 'redis refresh failed (non-fatal)'),
    );
    return toView(updated);
  }

  async updateSummary(sessionId: string, summary: string): Promise<void> {
    const updated = await this.db.session.update({
      where: { id: sessionId },
      data: { conversationSummary: summary },
    });
    await this.refreshRedisFromRow(updated).catch(() => undefined);
  }

  async setLanguage(sessionId: string, language: Language): Promise<void> {
    const parsed = LanguageSchema.safeParse(language);
    if (!parsed.success) throw new ValidationError('Invalid language', { language });
    const updated = await this.db.session.update({
      where: { id: sessionId },
      data: { language: parsed.data },
    });
    await this.refreshRedisFromRow(updated).catch(() => undefined);
  }

  /** Bump expires_at by the full TTL. Called on user activity. */
  async extendTtl(sessionId: string): Promise<void> {
    const updated = await this.db.session.update({
      where: { id: sessionId },
      data: { expiresAt: plusHours(new Date(), SESSION_TTL_HOURS) },
    });
    await this.indexInRedis(updated);
  }

  async markOrdered(sessionId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.db;
    await client.session.update({
      where: { id: sessionId },
      data: { status: 'ordered', closedAt: new Date() },
    });
    await this.removeFromRedis(sessionId).catch(() => undefined);
  }

  async markExpired(sessionId: string): Promise<void> {
    await this.db.session.update({
      where: { id: sessionId },
      data: { status: 'expired', closedAt: new Date() },
    });
    await this.removeFromRedis(sessionId).catch(() => undefined);
  }

  // -------------------------------------------------------------------------
  // Redis cache management
  // -------------------------------------------------------------------------

  private async indexInRedis(row: Session): Promise<void> {
    const ttl = Math.max(
      1,
      Math.floor((row.expiresAt.getTime() - Date.now()) / 1000),
    );
    const ttlActual = Math.min(ttl, SESSION_TTL_SECONDS);

    const cache: RedisSessionShape = {
      preferences: parseStoredPreferences(row.preferences),
      conversationSummary: row.conversationSummary,
      language: row.language as Language | null,
      lastUpsellAt: null,
    };

    const pipeline = redis.pipeline();
    pipeline.set(keys.session(row.id), JSON.stringify(cache), 'EX', ttlActual);
    pipeline.set(keys.sessionByTable(row.tableId), row.id, 'EX', ttlActual);
    await pipeline.exec();
  }

  private async refreshRedisFromRow(row: Session): Promise<void> {
    const existing = await redis.get(keys.session(row.id));
    const merged: RedisSessionShape = existing
      ? {
          ...(JSON.parse(existing) as RedisSessionShape),
          preferences: parseStoredPreferences(row.preferences),
          conversationSummary: row.conversationSummary,
          language: row.language as Language | null,
        }
      : {
          preferences: parseStoredPreferences(row.preferences),
          conversationSummary: row.conversationSummary,
          language: row.language as Language | null,
          lastUpsellAt: null,
        };
    const ttl = Math.max(
      1,
      Math.floor((row.expiresAt.getTime() - Date.now()) / 1000),
    );
    await redis.set(keys.session(row.id), JSON.stringify(merged), 'EX', ttl);
  }

  private async removeFromRedis(sessionId: string): Promise<void> {
    const row = await this.db.session.findUnique({
      where: { id: sessionId },
      select: { tableId: true },
    });
    const pipeline = redis.pipeline();
    pipeline.del(keys.session(sessionId));
    if (row) pipeline.del(keys.sessionByTable(row.tableId));
    await pipeline.exec();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toView(row: Session): SessionView {
  return {
    id: row.id,
    tableId: row.tableId,
    status: row.status,
    preferences: parseStoredPreferences(row.preferences),
    conversationSummary: row.conversationSummary,
    language: row.language as Language | null,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    closedAt: row.closedAt,
  };
}

function parseStoredPreferences(raw: Prisma.JsonValue): UserPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const parsed = UserPreferencesSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

function normalizeTableId(tableId: string): string {
  const trimmed = tableId.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,20}$/.test(trimmed)) {
    throw new ValidationError('Invalid tableId', { tableId });
  }
  return trimmed;
}

export const sessionService = new SessionService();
