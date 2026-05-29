import { z } from 'zod';

import { UserPreferencesSchema } from '@smart-dining/shared';

import type { AgentContext } from './context.js';
import { toolRegistry } from './registry.js';

const ArgsSchema = z.object({
  patch: UserPreferencesSchema.describe('Partial preferences object — keys not present are unchanged'),
});

export interface UpdatePreferenceResult {
  merged: Record<string, unknown>;
}

async function handler(
  args: z.infer<typeof ArgsSchema>,
  ctx: AgentContext,
): Promise<UpdatePreferenceResult> {
  const session = await ctx.services.session.updatePreferences(ctx.sessionId, args.patch);
  return { merged: session.preferences as Record<string, unknown> };
}

toolRegistry.register({
  name: 'update_preference',
  description:
    'Persist a partial preference patch to the session. Arrays (excludeAllergens) union; scalars overwrite. Call whenever the user states a preference like "I don\'t do dairy" or "no spice".',
  argsSchema: ArgsSchema,
  allowedAgents: ['greeter', 'contextMemory', 'orchestrator'],
  handler,
});
