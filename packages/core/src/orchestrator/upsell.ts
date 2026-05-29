/**
 * Cart-event upsell — fire-and-forget after add_to_cart.
 *
 * Flow:
 *   1. Cart route handler completes addItem (DB write + table:* publish for sync).
 *   2. Calls `triggerPostAddUpsell()` without await.
 *   3. This function:
 *      - rate-limits via sessionMemory (one upsell per 30s/session)
 *      - pulls complements
 *      - invokes the Upsell agent
 *      - publishes the resulting message as an `ai:message` event to the
 *        table channel so all connected clients see it in their chat panel
 *      - persists an assistant Message row + agent traces
 *
 * On error: logs and moves on. Upsell failures must never break add-to-cart.
 */

import { childLogger } from '../lib/logger.js';
import { channels, redisPub } from '../db/redis.js';
import { prisma } from '../db/client.js';
import { sessionMemory } from '../memory/session.js';
import { cartService, menuService, sessionService } from '../services/index.js';
import { upsellAgent } from '../agents/upsell/index.js';
import { previewForTrace } from './trace.js';

const log = childLogger('upsell-trigger');

export interface PostAddUpsellArgs {
  sessionId: string;
  tableId: string;
  addedBy: string;
  addedMenuItemId: string;
  addedMenuItemName: string;
}

export async function triggerPostAddUpsell(args: PostAddUpsellArgs): Promise<void> {
  try {
    // Rate-limit: skip if a previous upsell fired in the window.
    const claimed = await sessionMemory.tryClaimUpsell(args.sessionId, 30);
    if (!claimed) {
      log.debug({ sessionId: args.sessionId }, 'upsell rate-limited; skipping');
      return;
    }

    const session = await sessionService.getById(args.sessionId);
    const cart = await cartService.getCart(args.sessionId);
    const cartItemNames = cart.items.map((l) => l.menuItem.name);

    const complements = await menuService.getComplementary(args.addedMenuItemId, 3);
    if (complements.length === 0) {
      log.debug({ addedMenuItemId: args.addedMenuItemId }, 'no complements; skipping upsell');
      return;
    }

    const result = await upsellAgent.invoke(
      {
        trigger: 'post_add',
        triggerItemName: args.addedMenuItemName,
        triggerItemId: args.addedMenuItemId,
        cartSubtotal: cart.subtotal,
        cartItemCount: cart.items.reduce((acc, l) => acc + l.quantity, 0),
        cartItemNames,
        complements: complements.map((c) => ({
          itemId: c.item.id,
          name: c.item.name,
          price: c.item.price,
          weight: c.weight,
        })),
        language: (session.language as 'en' | 'hinglish' | 'telugu-english') ?? 'en',
        addedBy: args.addedBy,
      },
      // The orchestrator's full context isn't needed here — we go straight to
      // the agent. Minimal AgentContext is enough; no tool calls fire.
      {
        callerAgent: 'upsell',
        sessionId: args.sessionId,
        tableId: args.tableId,
        addedBy: args.addedBy,
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
    if (!out.shouldFire || !out.message) {
      log.debug({ sessionId: args.sessionId }, 'upsell agent declined to fire');
      return;
    }

    // Persist assistant message + agent trace.
    const message = await prisma.message.create({
      data: {
        sessionId: args.sessionId,
        sender: 'assistant',
        text: out.message,
        intent: 'UPSELL_CHECK',
        metadata: {
          trigger: 'post_add',
          triggerItemId: args.addedMenuItemId,
          suggestion: out.suggestion,
        },
      },
    });
    await prisma.agentTrace.create({
      data: {
        sessionId: args.sessionId,
        messageId: message.id,
        agentName: 'upsell',
        model: upsellAgent.metadata.model,
        temperature: upsellAgent.metadata.temperature,
        tokensIn: result.metrics.tokensIn,
        tokensOut: result.metrics.tokensOut,
        latencyMs: result.metrics.latencyMs,
        input: previewForTrace({ trigger: 'post_add', cartItemNames }) as object,
        output: previewForTrace(out) as object,
        toolCalls: [] as object,
        costUsd: result.metrics.costUsd,
      },
    });

    // Broadcast as ai:message — the chat UI picks this up and renders it.
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
        suggestion: out.suggestion,
      }),
    );

    log.info(
      { sessionId: args.sessionId, suggestionId: out.suggestion?.itemId },
      'post-add upsell fired',
    );
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), sessionId: args.sessionId },
      'upsell trigger failed (non-fatal)',
    );
  }
}
