import { z } from 'zod';

import type { AgentContext } from './context.js';
import { toolRegistry } from './registry.js';

const ArgsSchema = z.object({}).strict();

export interface GetCartResult {
  items: Array<{
    cartItemId: string;
    menuItemId: string;
    name: string;
    category: string;
    quantity: number;
    price: number;
    addedBy: string;
    specialInstructions: string | null;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  itemCount: number;
}

async function handler(_args: z.infer<typeof ArgsSchema>, ctx: AgentContext): Promise<GetCartResult> {
  const cart = await ctx.services.cart.getCart(ctx.sessionId);
  return {
    items: cart.items.map((line) => ({
      cartItemId: line.id,
      menuItemId: line.menuItem.id,
      name: line.menuItem.name,
      category: line.menuItem.category,
      quantity: line.quantity,
      price: line.menuItem.price,
      addedBy: line.addedBy,
      specialInstructions: line.specialInstructions,
    })),
    subtotal: cart.subtotal,
    tax: cart.tax,
    total: cart.total,
    itemCount: cart.items.reduce((acc, l) => acc + l.quantity, 0),
  };
}

toolRegistry.register({
  name: 'get_cart',
  description: 'Return the current shared cart for the table. Use to ground recommendations and upsells.',
  argsSchema: ArgsSchema,
  allowedAgents: [
    'recommendation',
    'upsell',
    'groupCoordinator',
    'orderValidation',
    'contextMemory',
    'orchestrator',
  ],
  handler,
});
