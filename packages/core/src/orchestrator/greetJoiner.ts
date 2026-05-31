/**
 * Group Coordinator greeting for new joiners.
 *
 * When a second-or-later diner enters the table, fire the Group
 * Coordinator agent in `user_joined` mode. The output is broadcast as an
 * `ai:message` event to the table channel so every diner (the new one
 * included) sees Zara's hello in their chat drawer.
 *
 * Spec §3.1: "Group Coordinator Agent greets new joiners: 'Hey! Priya is
 * already here. They've added Paneer Tikka — want to browse?'"
 *
 * Gated by a 60-second per-table rate limit (Redis NX) so a flurry of
 * reconnects doesn't spam the same greeting.
 */

import { previewForTrace } from './trace.js';
import { groupCoordinatorAgent } from '../agents/groupCoordinator/index.js';
import { childLogger } from '../lib/logger.js';
import { channels, redis, redisPub } from '../db/redis.js';
import { prisma } from '../db/client.js';
import { cartService, menuService, sessionService } from '../services/index.js';

const log = childLogger('group-greet');

export interface GreetJoinerArgs {
  sessionId: string;
  tableId: string;
  newJoinerName: string;
  participantNames: string[];
}

const GREET_WINDOW_SECONDS = 60;

export async function greetNewJoiner(args: GreetJoinerArgs): Promise<void> {
  try {
    // Per-table rate limit so noisy reconnects don't spam.
    const claimKey = `greet:table:${args.tableId}:${args.newJoinerName}`;
    const claimed = await redis.set(claimKey, '1', 'EX', GREET_WINDOW_SECONDS, 'NX');
    if (claimed !== 'OK') {
      log.debug({ tableId: args.tableId, name: args.newJoinerName }, 'greet rate-limited');
      return;
    }

    const session = await sessionService.getById(args.sessionId).catch(() => null);
    if (!session) return;

    const cart = await cartService.getCart(args.sessionId).catch(() => null);
    const cartItemNames = cart?.items.map((l) => l.menuItem.name) ?? [];
    const language = (session.language as 'en' | 'hinglish' | 'telugu-english') ?? 'en';

    // Pre-fetch candidate sets so the agent has something to offer the
    // joiner. Keep both lists modest to bound tokens.
    const all = await menuService.list();
    const veg = all
      .filter((m) => m.tags.includes('veg') && !cartItemNames.includes(m.name))
      .sort((a, b) => b.popularScore - a.popularScore)
      .slice(0, 4);
    const nonVeg = all
      .filter((m) => !m.tags.includes('veg') && !cartItemNames.includes(m.name))
      .sort((a, b) => b.popularScore - a.popularScore)
      .slice(0, 4);

    const toCandidate = (m: (typeof all)[number]) => ({
      itemId: m.id,
      name: m.name,
      category: m.category,
      price: m.price,
      description: m.description,
      tags: m.tags,
      allergens: m.allergens,
      caloriesKcal: m.caloriesKcal,
      similarity: m.popularScore,
    });

    const result = await groupCoordinatorAgent.invoke(
      {
        trigger: 'user_joined',
        newJoinerName: args.newJoinerName,
        participants: args.participantNames,
        cartItemNames,
        combinedPreferences: session.preferences as Record<string, unknown>,
        language,
        vegCandidates: veg.map(toCandidate),
        nonVegCandidates: nonVeg.map(toCandidate),
      },
      // Minimal context — group coordinator's invoke doesn't touch tools.
      {
        callerAgent: 'groupCoordinator',
        sessionId: args.sessionId,
        tableId: args.tableId,
        addedBy: args.newJoinerName,
        services: {
          menu: menuService,
          session: sessionService,
          cart: cartService,
          order: (await import('../services/order/service.js')).orderService,
          otp: (await import('../services/otp/service.js')).otpService,
        },
        toolTrace: [],
      },
    );

    const out = result.output;

    // Persist assistant message + agent trace.
    const message = await prisma.message.create({
      data: {
        sessionId: args.sessionId,
        sender: 'assistant',
        text: out.message,
        intent: 'GROUP_MERGE',
        metadata: {
          trigger: 'user_joined',
          newJoinerName: args.newJoinerName,
          suggestions: out.suggestions,
        },
      },
    });
    await prisma.agentTrace.create({
      data: {
        sessionId: args.sessionId,
        messageId: message.id,
        agentName: 'groupCoordinator',
        model: groupCoordinatorAgent.metadata.model,
        temperature: groupCoordinatorAgent.metadata.temperature,
        tokensIn: result.metrics.tokensIn,
        tokensOut: result.metrics.tokensOut,
        latencyMs: result.metrics.latencyMs,
        input: previewForTrace({ trigger: 'user_joined', participantNames: args.participantNames }) as object,
        output: previewForTrace(out) as object,
        toolCalls: [] as object,
        costUsd: result.metrics.costUsd,
      },
    });

    // Pick the first suggestion from either slot (favouring veg if cart
    // is empty, non-veg otherwise) so the chat card carries one Add CTA.
    const firstSuggestion =
      out.suggestions.veg[0] ?? out.suggestions.nonVeg[0] ?? null;

    await redisPub.publish(
      channels.table(args.tableId),
      JSON.stringify({
        type: 'ai:message',
        tableId: args.tableId,
        sessionId: args.sessionId,
        messageId: message.id,
        sender: 'assistant',
        text: out.message,
        timestamp: Date.now(),
        suggestion: firstSuggestion,
        trigger: 'group_greet',
      }),
    );

    log.info(
      { tableId: args.tableId, joiner: args.newJoinerName, suggestions: out.suggestions },
      'group greeting fired',
    );
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), tableId: args.tableId },
      'group greeting failed (non-fatal)',
    );
  }
}
