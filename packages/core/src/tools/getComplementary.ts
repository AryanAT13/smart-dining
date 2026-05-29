import { z } from 'zod';

import type { AgentContext } from './context.js';
import { toolRegistry } from './registry.js';

const ArgsSchema = z.object({
  itemId: z.string().uuid(),
  limit: z.number().int().min(1).max(5).default(3),
});

export interface GetComplementaryResult {
  source: { itemId: string; name: string };
  suggestions: Array<{
    itemId: string;
    name: string;
    category: string;
    price: number;
    weight: number;
  }>;
}

async function handler(
  args: z.infer<typeof ArgsSchema>,
  ctx: AgentContext,
): Promise<GetComplementaryResult> {
  const source = await ctx.services.menu.getById(args.itemId);
  const suggestions = await ctx.services.menu.getComplementary(args.itemId, args.limit);
  return {
    source: { itemId: source.id, name: source.name },
    suggestions: suggestions.map((s) => ({
      itemId: s.item.id,
      name: s.item.name,
      category: s.item.category,
      price: s.item.price,
      weight: Number(s.weight.toFixed(3)),
    })),
  };
}

toolRegistry.register({
  name: 'get_complementary',
  description:
    'Items frequently ordered with the given menu item. Use this for "what pairs with…" intents and post-add upsells.',
  argsSchema: ArgsSchema,
  allowedAgents: ['upsell', 'recommendation', 'orchestrator'],
  handler,
});
