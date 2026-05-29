import { z } from 'zod';

import { classifyTimeOfDay, type TimeOfDay } from '../lib/time.js';

import type { AgentContext } from './context.js';
import { toolRegistry } from './registry.js';

const ArgsSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5),
  timeOfDay: z
    .enum(['breakfast', 'lunch', 'evening', 'dinner', 'late_night'])
    .optional()
    .describe('Override; defaults to the restaurant\'s current local time bucket'),
});

export interface GetPopularItemsResult {
  timeOfDay: TimeOfDay;
  items: Array<{
    itemId: string;
    name: string;
    category: string;
    price: number;
    popularScore: number;
    tags: string[];
  }>;
}

async function handler(
  args: z.infer<typeof ArgsSchema>,
  ctx: AgentContext,
): Promise<GetPopularItemsResult> {
  const tod = (args.timeOfDay as TimeOfDay | undefined) ?? classifyTimeOfDay();
  const items = await ctx.services.menu.getPopular(args.limit, tod);
  return {
    timeOfDay: tod,
    items: items.map((it) => ({
      itemId: it.id,
      name: it.name,
      category: it.category,
      price: it.price,
      popularScore: it.popularScore,
      tags: it.tags,
    })),
  };
}

toolRegistry.register({
  name: 'get_popular_items',
  description:
    'Top items by popularity, weighted by the current time of day. Use when the user asks "what\'s good" or "best thing here" or wants social-proof framing.',
  argsSchema: ArgsSchema,
  allowedAgents: ['recommendation', 'upsell', 'greeter', 'groupCoordinator', 'orchestrator'],
  handler,
});
