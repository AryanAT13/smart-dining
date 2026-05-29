import { z } from 'zod';

import type { AgentContext } from './context.js';
import { toolRegistry } from './registry.js';

const ArgsSchema = z.object({
  itemId: z.string().uuid().describe('Menu item UUID. MUST come from a prior search_menu result.'),
  quantity: z.number().int().min(1).max(10).default(1),
  specialInstructions: z.string().max(200).optional().describe('Free-text notes like "no onions"'),
});

export interface AddToCartResult {
  cartItemId: string;
  added: {
    name: string;
    quantity: number;
    price: number;
  };
  cartSubtotal: number;
  cartTotal: number;
}

async function handler(
  args: z.infer<typeof ArgsSchema>,
  ctx: AgentContext,
): Promise<AddToCartResult> {
  const { cart, addedLine } = await ctx.services.cart.addItem({
    sessionId: ctx.sessionId,
    menuItemId: args.itemId,
    quantity: args.quantity,
    addedBy: ctx.addedBy,
    ...(args.specialInstructions !== undefined
      ? { specialInstructions: args.specialInstructions }
      : {}),
  });

  return {
    cartItemId: addedLine.id,
    added: {
      name: addedLine.menuItem.name,
      quantity: addedLine.quantity,
      price: addedLine.menuItem.price,
    },
    cartSubtotal: cart.subtotal,
    cartTotal: cart.total,
  };
}

toolRegistry.register({
  name: 'add_to_cart',
  description:
    'Add an item to the table\'s shared cart. Only call when the user has clearly confirmed they want this item. Never invent itemIds — they must come from search_menu or get_complementary results.',
  argsSchema: ArgsSchema,
  // Add-to-cart is sensitive — only the orchestrator can execute it, after
  // the router has classified intent as ADD_ITEM. Agents propose; orchestrator disposes.
  allowedAgents: ['orchestrator'],
  handler,
});
