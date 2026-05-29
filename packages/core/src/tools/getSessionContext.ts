import { z } from 'zod';

import type { AgentContext } from './context.js';
import { toolRegistry } from './registry.js';

const ArgsSchema = z.object({}).strict();

export interface GetSessionContextResult {
  preferences: Record<string, unknown>;
  conversationSummary: string | null;
  language: string | null;
  cartItemCount: number;
  cartSubtotal: number;
}

async function handler(
  _args: z.infer<typeof ArgsSchema>,
  ctx: AgentContext,
): Promise<GetSessionContextResult> {
  const [session, cart] = await Promise.all([
    ctx.services.session.getById(ctx.sessionId),
    ctx.services.cart.getCart(ctx.sessionId).catch(() => null),
  ]);
  return {
    preferences: session.preferences as Record<string, unknown>,
    conversationSummary: session.conversationSummary,
    language: session.language,
    cartItemCount: cart?.items.reduce((acc, l) => acc + l.quantity, 0) ?? 0,
    cartSubtotal: cart?.subtotal ?? 0,
  };
}

toolRegistry.register({
  name: 'get_session_context',
  description:
    'Snapshot of the diner\'s current preferences, conversation summary, language, and cart aggregate. Pull this before producing tone-sensitive copy.',
  argsSchema: ArgsSchema,
  allowedAgents: ['contextMemory', 'groupCoordinator', 'recommendation', 'orchestrator'],
  handler,
});
