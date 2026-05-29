import { z } from 'zod';

import type { AgentContext } from './context.js';
import { toolRegistry } from './registry.js';

const ArgsSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(50),
});

export interface ValidateStockResult {
  ok: boolean;
  unavailable: Array<{ itemId: string; name: string }>;
}

async function handler(
  args: z.infer<typeof ArgsSchema>,
  ctx: AgentContext,
): Promise<ValidateStockResult> {
  const unavailable: ValidateStockResult['unavailable'] = [];
  for (const id of args.itemIds) {
    try {
      await ctx.services.menu.validateStock(id);
    } catch {
      const item = await ctx.services.menu.getById(id).catch(() => null);
      if (item) unavailable.push({ itemId: item.id, name: item.name });
    }
  }
  return { ok: unavailable.length === 0, unavailable };
}

toolRegistry.register({
  name: 'validate_stock',
  description: 'Check whether each itemId is currently available. Used pre-checkout by orderValidation.',
  argsSchema: ArgsSchema,
  allowedAgents: ['orderValidation', 'orchestrator'],
  handler,
});
