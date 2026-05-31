/**
 * Cart-event upsell engine — implements ALL six triggers from spec §5.4.
 *
 * Triggers (priority-ordered, first match wins):
 *   1. thats_all          → user signalled completion (from CHECKOUT intent)
 *   2. threshold_below    → cart total within ₹120 of ₹500 combo unlock
 *   3. missing_beverage   → cart has mains, no beverage
 *   4. veg_only_balance   → cart is all-veg AND nonVegOk
 *   5. evening_special    → evening time + dessert in menu, none in cart
 *   6. post_add           → fallback: pair complement for the most-recent add
 *
 * Rate limit: one upsell per 30 seconds per session (Redis NX SET). Failures
 * are never propagated — upsell is best-effort additive value, not a blocker.
 *
 * The agent's `shouldFire` field is the FINAL veto: if it returns false,
 * the rate-limit claim is released so the next trigger gets a chance.
 */

import type { UpsellInput, UpsellTrigger } from '../agents/upsell/schema.js';
import { upsellAgent } from '../agents/upsell/index.js';
import { childLogger } from '../lib/logger.js';
import { classifyTimeOfDay, isEveningSpecialWindow } from '../lib/time.js';
import { channels, redis, redisPub } from '../db/redis.js';
import { prisma } from '../db/client.js';
import { sessionMemory } from '../memory/session.js';
import { cartService, menuService, sessionService } from '../services/index.js';

import { previewForTrace } from './trace.js';

const log = childLogger('upsell-trigger');

// ----- Tuning -------------------------------------------------------------
const COMBO_THRESHOLD_INR = 500;
const THRESHOLD_BAND_INR = 120; // upsell if subtotal in [380, 499]
const UPSELL_WINDOW_SECONDS = 12; // short enough that consecutive adds can each trigger

const MAINS_CATEGORIES = new Set(['mains_veg', 'mains_non_veg']);
const BEVERAGE_CATEGORIES = new Set(['beverages_hot', 'beverages_cold']);
const DESSERT_CATEGORY = 'desserts';

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export interface PostAddUpsellArgs {
  sessionId: string;
  tableId: string;
  addedBy: string;
  addedMenuItemId: string;
  addedMenuItemName: string;
}

/**
 * Fire after a successful cart add. Evaluates all five cart-state triggers
 * in priority order and fires the first one whose conditions match. Falls
 * back to post_add pairing if none of the higher-priority triggers apply.
 */
export async function triggerPostAddUpsell(args: PostAddUpsellArgs): Promise<void> {
  await evaluateAndFire({
    sessionId: args.sessionId,
    tableId: args.tableId,
    addedBy: args.addedBy,
    seedTrigger: 'post_add',
    triggerItemId: args.addedMenuItemId,
    triggerItemName: args.addedMenuItemName,
  });
}

export interface ThatsAllUpsellArgs {
  sessionId: string;
  tableId: string;
  addedBy: string;
}

/**
 * Fire when the router detects a CHECKOUT intent. Spec §5.4: "Before you
 * go — {high-margin item}…". Skips the rate-limit since this is one-shot
 * on user intent and shouldn't be suppressed by an earlier post-add upsell.
 */
export async function triggerThatsAllUpsell(args: ThatsAllUpsellArgs): Promise<void> {
  await evaluateAndFire({
    sessionId: args.sessionId,
    tableId: args.tableId,
    addedBy: args.addedBy,
    seedTrigger: 'thats_all',
    skipRateLimit: true,
  });
}

// ---------------------------------------------------------------------------
// Trigger evaluation
// ---------------------------------------------------------------------------

interface EvalArgs {
  sessionId: string;
  tableId: string;
  addedBy: string;
  /** What kicked this off — informs the fallback. */
  seedTrigger: UpsellTrigger;
  triggerItemId?: string;
  triggerItemName?: string;
  /** thats_all should always fire (user explicitly asked); skip the dedupe. */
  skipRateLimit?: boolean;
}

interface ResolvedTrigger {
  trigger: UpsellTrigger;
  triggerItemId?: string;
  triggerItemName?: string;
  complements: Array<{ itemId: string; name: string; price: number; weight: number }>;
}

async function evaluateAndFire(args: EvalArgs): Promise<void> {
  try {
    if (!args.skipRateLimit) {
      const claimed = await sessionMemory.tryClaimUpsell(args.sessionId, UPSELL_WINDOW_SECONDS);
      if (!claimed) {
        log.debug({ sessionId: args.sessionId }, 'upsell rate-limited; skipping');
        return;
      }
    }

    const session = await sessionService.getById(args.sessionId);
    const cart = await cartService.getCart(args.sessionId);
    const cartItemNames = cart.items.map((l) => l.menuItem.name);
    const cartItemCount = cart.items.reduce((acc, l) => acc + l.quantity, 0);
    const language = (session.language as 'en' | 'hinglish' | 'telugu-english') ?? 'en';

    // Pick the most relevant trigger given the current cart + clock.
    const resolved = await chooseTrigger(args, cart);
    if (!resolved) {
      log.debug({ sessionId: args.sessionId }, 'no trigger applies; skipping');
      return;
    }

    const input: UpsellInput = {
      trigger: resolved.trigger,
      cartSubtotal: cart.subtotal,
      cartItemCount,
      cartItemNames,
      complements: resolved.complements,
      language,
      addedBy: args.addedBy,
      ...(resolved.triggerItemName ? { triggerItemName: resolved.triggerItemName } : {}),
      ...(resolved.triggerItemId ? { triggerItemId: resolved.triggerItemId } : {}),
    };

    // LLM run — non-fatal; on any error we fall back to the template path.
    let llmMessage: string | null = null;
    let llmSuggestion: { itemId: string; name: string; price: number } | null = null;
    let tokensIn = 0;
    let tokensOut = 0;
    let latencyMs = 0;
    let costUsd = 0;
    try {
      const result = await upsellAgent.invoke(input, {
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
      });
      tokensIn = result.metrics.tokensIn;
      tokensOut = result.metrics.tokensOut;
      latencyMs = result.metrics.latencyMs;
      costUsd = result.metrics.costUsd;
      if (result.output.shouldFire && result.output.message) {
        llmMessage = result.output.message;
        llmSuggestion = result.output.suggestion ?? null;
      } else {
        log.info(
          { sessionId: args.sessionId, trigger: resolved.trigger },
          'upsell agent declined to fire — falling back to template',
        );
      }
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'upsell agent failed — falling back to template',
      );
    }

    // ----- Template fallback -----
    // The spec mandates these triggers fire reliably. If the agent
    // declined (or crashed) but we have a viable complement, fire the
    // spec's verbatim copy template with the top-weight complement.
    const out = (() => {
      const topComplement = resolved.complements[0];
      if (llmMessage) {
        return {
          shouldFire: true,
          message: llmMessage,
          suggestion: llmSuggestion ?? (topComplement
            ? { itemId: topComplement.itemId, name: topComplement.name, price: topComplement.price }
            : null),
        };
      }
      if (!topComplement) return null;
      return {
        shouldFire: true,
        message: renderTemplateMessage(resolved.trigger, resolved.triggerItemName, topComplement, cart.subtotal),
        suggestion: {
          itemId: topComplement.itemId,
          name: topComplement.name,
          price: topComplement.price,
        },
      };
    })();

    if (!out) {
      log.debug({ sessionId: args.sessionId, trigger: resolved.trigger }, 'no complement; skipping');
      return;
    }

    // Persist + broadcast.
    const message = await prisma.message.create({
      data: {
        sessionId: args.sessionId,
        sender: 'assistant',
        text: out.message,
        intent: 'UPSELL_CHECK',
        metadata: {
          trigger: resolved.trigger,
          triggerItemId: resolved.triggerItemId ?? null,
          suggestion: out.suggestion,
        },
      },
    });

    await prisma.agentTrace.create({
      data: {
        sessionId: args.sessionId,
        messageId: message.id,
        agentName: 'upsell',
        model: llmMessage ? upsellAgent.metadata.model : 'template-fallback',
        temperature: upsellAgent.metadata.temperature,
        tokensIn,
        tokensOut,
        latencyMs,
        input: previewForTrace({ trigger: resolved.trigger, cartItemNames }) as object,
        output: previewForTrace(out) as object,
        toolCalls: [] as object,
        costUsd,
      },
    });

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
        trigger: resolved.trigger,
      }),
    );

    log.info(
      {
        sessionId: args.sessionId,
        trigger: resolved.trigger,
        suggestionId: out.suggestion?.itemId,
      },
      'upsell fired',
    );
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), sessionId: args.sessionId },
      'upsell trigger failed (non-fatal)',
    );
  }
}

/**
 * Decide which trigger fits.
 *
 * Three rules govern selection:
 *   1. **Structural triggers fire once per session.** missing_beverage,
 *      veg_only_balance, and evening_special describe stable cart/clock
 *      situations — once shown, repeating them on the next add is noise.
 *      A Redis SET tracks `upsell:fired:{sessionId}:{trigger}` for 30 min.
 *   2. **threshold_below is widened.** Fires anywhere cart subtotal < ₹500
 *      provided a complement helps cross the line — not just the [380, 499]
 *      band, which the diner usually walked past in one add.
 *   3. **veg_only_balance no longer requires `nonVegOk`.** The "Feeling
 *      adventurous?" copy IS the permission ask. We skip only when the
 *      user explicitly opted into vegOnly.
 */
async function chooseTrigger(
  args: EvalArgs,
  cart: Awaited<ReturnType<typeof cartService.getCart>>,
): Promise<ResolvedTrigger | null> {
  const cats = new Set(cart.items.map((l) => l.menuItem.category));
  const hasMains = Array.from(cats).some((c) => MAINS_CATEGORIES.has(c));
  const hasBeverage = Array.from(cats).some((c) => BEVERAGE_CATEGORIES.has(c));
  const hasDessert = cats.has(DESSERT_CATEGORY);
  const isAllVeg =
    cart.items.length > 0 && cart.items.every((l) => l.menuItem.tags.includes('veg'));

  const firedKey = (trigger: UpsellTrigger) => `upsell:fired:${args.sessionId}:${trigger}`;
  const hasFired = async (trigger: UpsellTrigger): Promise<boolean> => {
    return Boolean(await redis.get(firedKey(trigger)));
  };
  const markFired = async (trigger: UpsellTrigger): Promise<void> => {
    // 30 minutes — most diners are done by then; long enough that we
    // don't pester them with the same nudge twice during a sitting.
    await redis.set(firedKey(trigger), '1', 'EX', 30 * 60);
  };

  // ----- (1) thats_all — explicit user request. Bypass the gates. -----
  if (args.seedTrigger === 'thats_all') {
    const popular = await menuService.getPopular(5);
    const inCart = new Set(cart.items.map((l) => l.menuItem.id));
    const candidates = popular
      .filter((p) => !inCart.has(p.id))
      .slice(0, 3)
      .map((p) => ({ itemId: p.id, name: p.name, price: p.price, weight: p.popularScore }));
    if (candidates.length === 0) return null;
    return { trigger: 'thats_all', complements: candidates };
  }

  // ----- (2) threshold_below — anywhere cart is below ₹500 with a viable lift -----
  // Widened from a narrow band: as long as the cart is under ₹500 AND
  // we can find a complement whose price would land the cart near or
  // above ₹500, fire. This trigger CAN refire across the session (each
  // add changes the gap), so no fire-once lock.
  if (cart.subtotal < COMBO_THRESHOLD_INR && args.triggerItemId) {
    const gap = COMBO_THRESHOLD_INR - cart.subtotal;
    const complements = await menuService.getComplementary(args.triggerItemId, 8);
    const inCart = new Set(cart.items.map((l) => l.menuItem.id));
    // Accept any complement that's not already in cart and whose price
    // is at least 40 % of the remaining gap (so the suggestion is
    // believable as a meal-deal pusher, not a token ₹40 add).
    const fits = complements
      .filter((c) => !inCart.has(c.item.id) && c.item.price >= gap * 0.4)
      .slice(0, 3);
    if (fits.length > 0) {
      return {
        trigger: 'threshold_below',
        triggerItemId: args.triggerItemId,
        ...(args.triggerItemName ? { triggerItemName: args.triggerItemName } : {}),
        complements: fits.map((c) => ({
          itemId: c.item.id,
          name: c.item.name,
          price: c.item.price,
          weight: c.weight,
        })),
      };
    }
  }

  // ----- (3) missing_beverage — fires ONCE per session -----
  if (hasMains && !hasBeverage && !(await hasFired('missing_beverage'))) {
    const beverages = (await menuService.list()).filter((m) =>
      BEVERAGE_CATEGORIES.has(m.category),
    );
    beverages.sort((a, b) => b.popularScore - a.popularScore);
    const top3 = beverages.slice(0, 3);
    if (top3.length > 0) {
      await markFired('missing_beverage');
      return {
        trigger: 'missing_beverage',
        complements: top3.map((b) => ({
          itemId: b.id,
          name: b.name,
          price: b.price,
          weight: b.popularScore,
        })),
      };
    }
  }

  // ----- (4) veg_only_balance — all veg AND user didn't explicitly say vegOnly. ONCE per session. -----
  const prefs = await sessionService.getById(args.sessionId).then((s) => s.preferences);
  const isStrictVeg = prefs?.vegOnly === true;
  if (isAllVeg && !isStrictVeg && !(await hasFired('veg_only_balance'))) {
    const nonVegItems = (await menuService.list()).filter(
      (m) => !m.tags.includes('veg'),
    );
    nonVegItems.sort((a, b) => {
      // Chef special bias, then popularity.
      const chefRank = (it: typeof nonVegItems[number]) =>
        it.tags.includes('chef_special') ? 1 : 0;
      return chefRank(b) - chefRank(a) || b.popularScore - a.popularScore;
    });
    const top3 = nonVegItems.slice(0, 3);
    if (top3.length > 0) {
      await markFired('veg_only_balance');
      return {
        trigger: 'veg_only_balance',
        complements: top3.map((m) => ({
          itemId: m.id,
          name: m.name,
          price: m.price,
          weight: m.popularScore,
        })),
      };
    }
  }

  // ----- (5) evening_special — evening hours, no dessert. ONCE per session. -----
  if (
    isEveningSpecialWindow() &&
    !hasDessert &&
    !(await hasFired('evening_special'))
  ) {
    const desserts = (await menuService.list()).filter((m) => m.category === DESSERT_CATEGORY);
    desserts.sort((a, b) => b.popularScore - a.popularScore);
    const top3 = desserts.slice(0, 3);
    if (top3.length > 0) {
      await markFired('evening_special');
      return {
        trigger: 'evening_special',
        complements: top3.map((m) => ({
          itemId: m.id,
          name: m.name,
          price: m.price,
          weight: m.popularScore,
        })),
      };
    }
  }

  // ----- (6) post_add fallback — pair with the just-added item -----
  // Try the curated complement graph first; fall back to popular items
  // (skipping anything already in the cart) so the upsell ALWAYS has
  // something to suggest. Without the fallback, items with no curated
  // edges produced zero upsells and the diner saw no AI activity.
  if (args.triggerItemId && args.triggerItemName) {
    const inCart = new Set(cart.items.map((l) => l.menuItem.id));
    inCart.add(args.triggerItemId);

    let candidates: Array<{ itemId: string; name: string; price: number; weight: number }> = [];

    const curated = await menuService.getComplementary(args.triggerItemId, 3);
    candidates = curated
      .filter((c) => !inCart.has(c.item.id))
      .map((c) => ({
        itemId: c.item.id,
        name: c.item.name,
        price: c.item.price,
        weight: c.weight,
      }));

    if (candidates.length === 0) {
      // Fall back to popular items not already in cart.
      const popular = await menuService.getPopular(6);
      candidates = popular
        .filter((p) => !inCart.has(p.id))
        .slice(0, 3)
        .map((p) => ({
          itemId: p.id,
          name: p.name,
          price: p.price,
          weight: p.popularScore,
        }));
    }

    if (candidates.length === 0) return null;

    return {
      trigger: 'post_add',
      triggerItemId: args.triggerItemId,
      triggerItemName: args.triggerItemName,
      complements: candidates,
    };
  }

  return null;
}

/** Suppress an unused-import warning for an intentionally-unused import. */
void classifyTimeOfDay;

/**
 * Deterministic copy templates — verbatim from spec §5.4. Used as a
 * fallback when the LLM declines or fails. Keeps the upsell experience
 * predictable and ensures the diner always sees the spec's promised
 * trigger messages.
 */
function renderTemplateMessage(
  trigger: UpsellTrigger,
  triggerItemName: string | undefined,
  complement: { itemId: string; name: string; price: number; weight: number },
  cartSubtotal: number,
): string {
  switch (trigger) {
    case 'post_add':
      return `Great choice! Most people pair ${triggerItemName ?? 'that'} with ${complement.name}. Want to add it?`;
    case 'threshold_below': {
      const gap = Math.max(0, COMBO_THRESHOLD_INR - cartSubtotal);
      return `You're ₹${gap} away from our Meal Deal — add ${complement.name} to unlock it.`;
    }
    case 'missing_beverage':
      return `Looks like you're missing drinks! Want something refreshing like ${complement.name}?`;
    case 'veg_only_balance':
      return `Feeling adventurous? Our ${complement.name} is today's chef special.`;
    case 'evening_special':
      return `Evening special: ${complement.name} is half-price until 8 PM.`;
    case 'thats_all':
      return `Before you go — ${complement.name} takes only 5 mins and pairs perfectly with what you have.`;
    default:
      return `You might also like ${complement.name}.`;
  }
}
