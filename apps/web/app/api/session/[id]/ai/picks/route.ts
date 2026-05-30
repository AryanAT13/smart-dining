/**
 * AI Pick for You — server-rendered picks for the menu's hero strip.
 *
 * Runs the Recommendation Agent with the session's accumulated preferences,
 * grounded in a semantic search of the menu. Cached for 30s per session so
 * we don't burn LLM calls on every page refresh.
 */

import { z } from 'zod';

import {
  cartService,
  keys,
  menuService,
  orderService,
  otpService,
  recommendationAgent,
  redis,
  sessionService,
  userService,
} from '@smart-dining/core';
import { classifyTimeOfDay } from '@smart-dining/core';
import type { AgentContext } from '@smart-dining/core';

import { jsonOk, withErrors } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });
const PICK_CACHE_TTL_SECONDS = 30;
const PICK_CACHE_KEY = (sessionId: string) => `${keys.session(sessionId)}:picks`;

interface PickItem {
  itemId: string;
  name: string;
  price: number;
  reason: string;
  imageUrl?: string;
}

export const GET = withErrors<{ id: string }>(async (_req, { params }) => {
  const { id: sessionId } = ParamsSchema.parse(params);

  // Cache hit?
  const cached = await redis.get(PICK_CACHE_KEY(sessionId));
  if (cached) {
    return jsonOk(JSON.parse(cached) as { picks: PickItem[]; cached: true });
  }

  const session = await sessionService.getById(sessionId);
  const prefs = session.preferences;

  // Compose a search prompt from preferences so the embedding query reflects
  // the diner's accumulated context.
  const queryParts: string[] = [];
  if (prefs.spicy) queryParts.push('spicy');
  if (prefs.light) queryParts.push('light');
  if (prefs.sweet) queryParts.push('sweet');
  if (prefs.filling) queryParts.push('filling');
  if (prefs.vegOnly) queryParts.push('vegetarian');
  if (queryParts.length === 0) queryParts.push('crowd-pleasing dishes the regulars love');
  const query = `Top picks for someone who wants ${queryParts.join(' and ')}.`;

  // Pull candidates via semantic search.
  const matches = await menuService.semanticSearch(query, {
    topK: 8,
    excludeAllergens: prefs.excludeAllergens ?? [],
    ...(prefs.vegOnly ? { requireTags: ['veg'] } : {}),
    ...(prefs.light ? { maxCaloriesKcal: 400 } : {}),
  });

  // If embeddings aren't populated, fall back to popular items.
  if (matches.length === 0) {
    const popular = await menuService.getPopular(3);
    const picks: PickItem[] = popular.map((p) => ({
      itemId: p.id,
      name: p.name,
      price: p.price,
      reason: 'A regulars\' favourite — safe pick.',
      imageUrl: p.imageUrl,
    }));
    await redis.set(
      PICK_CACHE_KEY(sessionId),
      JSON.stringify({ picks, cached: false }),
      'EX',
      PICK_CACHE_TTL_SECONDS,
    );
    return jsonOk({ picks, cached: false });
  }

  // Run the Recommendation agent in standalone mode.
  const ctx: AgentContext = {
    callerAgent: 'recommendation',
    sessionId,
    tableId: session.tableId,
    addedBy: 'Zara',
    services: {
      menu: menuService,
      session: sessionService,
      cart: cartService,
      order: orderService,
      otp: otpService,
    },
    toolTrace: [],
  };

  const cart = await cartService.getCart(sessionId).catch(() => null);
  const cartItemIds = cart?.items.map((l) => l.menuItem.id) ?? [];

  const result = await recommendationAgent.invoke(
    {
      englishGloss: query,
      originalText: query,
      language: (session.language ?? 'en') as 'en' | 'hinglish' | 'telugu-english',
      preferences: prefs,
      timeOfDay: classifyTimeOfDay(),
      cartItemIds,
      candidates: matches.map((m) => ({
        itemId: m.item.id,
        name: m.item.name,
        category: m.item.category,
        price: m.item.price,
        description: m.item.description,
        tags: m.item.tags,
        allergens: m.item.allergens,
        caloriesKcal: m.item.caloriesKcal,
        similarity: m.similarity,
      })),
      recentTranscript: '(no prior turns)',
    },
    ctx,
  );

  // Hydrate imageUrl from the candidate set so the strip can render images.
  const picks: PickItem[] = result.output.suggestions.map((s) => {
    const candidate = matches.find((m) => m.item.id === s.itemId);
    return {
      itemId: s.itemId,
      name: s.name,
      price: s.price,
      reason: s.reason,
      ...(candidate ? { imageUrl: candidate.item.imageUrl } : {}),
    };
  });

  await redis.set(
    PICK_CACHE_KEY(sessionId),
    JSON.stringify({ picks, cached: false }),
    'EX',
    PICK_CACHE_TTL_SECONDS,
  );

  // Mark `userService` as used so the import doesn't churn in lint.
  void userService;

  return jsonOk({ picks, cached: false });
});
