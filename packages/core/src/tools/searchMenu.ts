import { z } from 'zod';

import type { MenuItemView, SemanticMatch } from '../services/menu/types.js';

import type { AgentContext } from './context.js';
import { toolRegistry } from './registry.js';

const ArgsSchema = z.object({
  query: z.string().min(1).max(200).describe('Natural-language description of what the user wants'),
  topK: z.number().int().min(1).max(15).default(8).describe('Max results to return'),
  excludeAllergens: z
    .array(z.enum(['dairy', 'gluten', 'nuts', 'fish', 'shellfish', 'soy', 'egg']))
    .default([])
    .describe('Filter out items containing these allergens'),
  vegOnly: z.boolean().default(false).describe('Restrict to vegetarian items'),
  maxCaloriesKcal: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Calorie ceiling; use for "light" intents'),
  excludeInCart: z
    .boolean()
    .default(true)
    .describe('Drop items already in the cart so we never recommend duplicates'),
});

export interface SearchMenuResult {
  matches: Array<{
    itemId: string;
    name: string;
    category: string;
    price: number;
    description: string;
    tags: string[];
    allergens: string[];
    caloriesKcal: number | null;
    similarity: number;
  }>;
}

async function handler(args: z.infer<typeof ArgsSchema>, ctx: AgentContext): Promise<SearchMenuResult> {
  const excludeIds: string[] = [];
  if (args.excludeInCart) {
    const cart = await ctx.services.cart.getCart(ctx.sessionId).catch(() => null);
    if (cart) {
      for (const line of cart.items) excludeIds.push(line.menuItem.id);
    }
  }

  const matches: SemanticMatch[] = await ctx.services.menu.semanticSearch(args.query, {
    topK: args.topK,
    excludeAllergens: args.excludeAllergens,
    ...(args.vegOnly ? { requireTags: ['veg'] } : {}),
    ...(args.maxCaloriesKcal !== undefined ? { maxCaloriesKcal: args.maxCaloriesKcal } : {}),
    excludeIds,
  });

  // If the index is empty (e.g. before embeddings are generated), fall back
  // to popular items so the chat doesn't fail silently.
  if (matches.length === 0) {
    const popular: MenuItemView[] = await ctx.services.menu.getPopular(args.topK);
    return {
      matches: popular.map((item) => ({
        itemId: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        description: item.description,
        tags: item.tags,
        allergens: item.allergens,
        caloriesKcal: item.caloriesKcal,
        similarity: 0,
      })),
    };
  }

  return {
    matches: matches.map((m) => ({
      itemId: m.item.id,
      name: m.item.name,
      category: m.item.category,
      price: m.item.price,
      description: m.item.description,
      tags: m.item.tags,
      allergens: m.item.allergens,
      caloriesKcal: m.item.caloriesKcal,
      similarity: Number(m.similarity.toFixed(3)),
    })),
  };
}

toolRegistry.register({
  name: 'search_menu',
  description:
    'Semantic search over menu items, grounded in the actual menu. Returns candidate items the LLM may then pick from. Always prefer this over inventing item names.',
  argsSchema: ArgsSchema,
  allowedAgents: ['recommendation', 'groupCoordinator', 'greeter', 'orchestrator'],
  handler,
});
