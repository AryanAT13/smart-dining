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
import type { MenuFilters } from '@smart-dining/core/services';

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
  category?: string;
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

  // Compose an embedding-search query that REFLECTS the diner's vibes.
  const queryParts: string[] = [];
  if (prefs.spicy) queryParts.push('spicy');
  if (prefs.light) queryParts.push('light');
  if (prefs.sweet) queryParts.push('sweet desserts');
  if (prefs.filling) queryParts.push('filling main courses');
  if (prefs.vegOnly) queryParts.push('vegetarian');
  if (queryParts.length === 0) queryParts.push('crowd-pleasing dishes the regulars love');
  const query = `Top picks for someone who wants ${queryParts.join(' and ')}.`;

  // HARD filters per chip.
  const requireTags: string[] = [];
  if (prefs.spicy) requireTags.push('spicy');
  if (prefs.vegOnly) requireTags.push('veg');

  // Category restriction by vibe. Sweet → desserts. Filling → mains.
  const categories: string[] = [];
  if (prefs.sweet) categories.push('desserts');
  if (prefs.filling) categories.push('mains_veg', 'mains_non_veg');

  // ----- Relax-cascading fallback -----
  // The previous approach gave zero results for inherently-conflicting
  // combinations (e.g. Spicy + Sweet — no spicy desserts in the menu).
  // We try strict first, then relax the most restrictive filter first
  // (categories → tags → unconstrained), so the diner ALWAYS sees
  // vibe-shaped picks instead of falling back to generic "popular".
  let matches = await menuService.semanticSearch(query, {
    topK: 12,
    excludeAllergens: prefs.excludeAllergens ?? [],
    ...(requireTags.length > 0 ? { requireTags } : {}),
    ...(categories.length > 0
      ? { categories: categories as NonNullable<MenuFilters['categories']> }
      : {}),
    ...(prefs.light ? { maxCaloriesKcal: 400 } : {}),
  });
  let relaxedReasonHint: 'strict' | 'relaxed-category' | 'relaxed-tags' | 'unconstrained' = 'strict';

  if (matches.length === 0 && categories.length > 0) {
    // Drop the hard category restriction but keep tag + allergen filters.
    matches = await menuService.semanticSearch(query, {
      topK: 12,
      excludeAllergens: prefs.excludeAllergens ?? [],
      ...(requireTags.length > 0 ? { requireTags } : {}),
      ...(prefs.light ? { maxCaloriesKcal: 400 } : {}),
    });
    relaxedReasonHint = 'relaxed-category';
  }

  if (matches.length === 0 && requireTags.length > 0) {
    // Drop tag requirements too.
    matches = await menuService.semanticSearch(query, {
      topK: 12,
      excludeAllergens: prefs.excludeAllergens ?? [],
      ...(prefs.light ? { maxCaloriesKcal: 400 } : {}),
    });
    relaxedReasonHint = 'relaxed-tags';
  }

  if (matches.length === 0) {
    // Embeddings unpopulated OR all candidates filtered. Fall back to
    // popular items, but write a reason that names the diner's vibe so
    // it doesn't read as a random "safe pick".
    const popular = await menuService.getPopular(3);
    const vibeLabel = describeVibe(prefs);
    const picks: PickItem[] = popular.map((p) => ({
      itemId: p.id,
      name: p.name,
      price: p.price,
      reason: vibeLabel
        ? `A crowd-pleaser — closest I have to ${vibeLabel} right now.`
        : "A regulars' favourite to start you off.",
      imageUrl: p.imageUrl,
      category: p.category,
    }));
    await redis.set(
      PICK_CACHE_KEY(sessionId),
      JSON.stringify({ picks, cached: false }),
      'EX',
      PICK_CACHE_TTL_SECONDS,
    );
    return jsonOk({ picks, cached: false });
  }

  void relaxedReasonHint; // available for future telemetry / UI hints

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

  // Hydrate imageUrl + category from the candidate set so the strip can
  // render real images (when present) or the right placeholder colour.
  const picks: PickItem[] = result.output.suggestions.map((s) => {
    const candidate = matches.find((m) => m.item.id === s.itemId);
    return {
      itemId: s.itemId,
      name: s.name,
      price: s.price,
      reason: s.reason,
      ...(candidate ? { imageUrl: candidate.item.imageUrl, category: candidate.item.category } : {}),
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

/**
 * Build a short human label for the diner's vibe so fallback picks
 * acknowledge what was requested instead of suggesting random favourites.
 */
function describeVibe(prefs: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (prefs['spicy']) parts.push('spicy');
  if (prefs['light']) parts.push('light');
  if (prefs['sweet']) parts.push('sweet');
  if (prefs['filling']) parts.push('filling');
  if (prefs['vegOnly']) parts.push('vegetarian');
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} + ${parts[parts.length - 1]!}`;
}
