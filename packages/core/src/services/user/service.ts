/**
 * UserService — Tier-3 long-term memory.
 *
 * Keyed by HMAC hash of phone (never the plaintext). On every order
 * placement we upsert: increment visit_count, merge preferences, refresh
 * last_visit_at. On next visit, the OrderService surfaces a "return visit"
 * signal so the UI can display "Welcome back, 3rd time visitor!" copy.
 *
 * We intentionally do NOT use this tier to pre-seed sessions before
 * checkout, because we'd have to recognise the user without their phone —
 * which would require browser fingerprinting or a localStorage shortcut,
 * both of which have ugly privacy implications. ADR-006 documents the
 * boundary.
 */

import type { Prisma, PrismaClient, User } from '@prisma/client';

import {
  type UserPreferences,
  UserPreferencesSchema,
  mergePreferences,
} from '@smart-dining/shared';

import { prisma } from '../../db/client.js';
import { hashPhone } from '../../lib/crypto.js';
import { childLogger } from '../../lib/logger.js';

import type { UpsertUserInput, UserView } from './types.js';

const log = childLogger('user-service');

export class UserService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findByPhone(phoneE164: string): Promise<UserView | null> {
    const phoneHash = hashPhone(phoneE164);
    const row = await this.db.user.findUnique({ where: { phoneHash } });
    return row ? toView(row) : null;
  }

  /**
   * Upsert called from OrderService.place() after a successful checkout.
   * Returns the user row so the caller can include visitCount in the
   * confirmation event.
   */
  async upsertFromOrder(input: UpsertUserInput): Promise<UserView> {
    const phoneHash = hashPhone(input.phoneE164);
    const cleanPrefs = UserPreferencesSchema.safeParse(input.preferencesPatch);
    const patch: UserPreferences = cleanPrefs.success ? cleanPrefs.data : {};

    const existing = await this.db.user.findUnique({ where: { phoneHash } });

    if (existing) {
      const merged = mergePreferences(
        parseStoredPreferences(existing.preferences),
        patch,
      );
      const updated = await this.db.user.update({
        where: { phoneHash },
        data: {
          preferences: merged as Prisma.InputJsonValue,
          visitCount: { increment: 1 },
          lastVisitAt: new Date(),
          ...(input.displayName ? { displayName: input.displayName } : {}),
        },
      });
      log.info(
        { phoneHash, visitCount: updated.visitCount },
        'user updated (return visit)',
      );
      return toView(updated);
    }

    const created = await this.db.user.create({
      data: {
        phoneHash,
        ...(input.displayName ? { displayName: input.displayName } : {}),
        preferences: patch as Prisma.InputJsonValue,
        visitCount: 1,
        lastVisitAt: new Date(),
      },
    });
    log.info({ phoneHash }, 'user created (first visit)');
    return toView(created);
  }

  /**
   * Attach a session to a known user. Called from OrderService.place() — this
   * is the only place a session ever links to a user row.
   */
  async linkSessionToUser(sessionId: string, userId: string): Promise<void> {
    await this.db.session.update({
      where: { id: sessionId },
      data: { userId },
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toView(row: User): UserView {
  return {
    id: row.id,
    phoneHash: row.phoneHash,
    displayName: row.displayName,
    preferences: parseStoredPreferences(row.preferences),
    visitCount: row.visitCount,
    lastVisitAt: row.lastVisitAt,
    createdAt: row.createdAt,
  };
}

function parseStoredPreferences(raw: Prisma.JsonValue): UserPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const parsed = UserPreferencesSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export const userService = new UserService();
