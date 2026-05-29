import { env } from '../../config/env.js';
import { BaseAgent } from '../_base/index.js';

import { goldens } from './golden.js';
import { renderSystem, renderUser } from './prompt.js';
import { RouterInputSchema, RouterOutputSchema } from './schema.js';

export const routerAgent = new BaseAgent({
  metadata: {
    name: 'router',
    description: 'Intent classifier — dispatches to specialist agents',
    model: env.LLM_MODEL_FAST as 'gpt-4o-mini',
    temperature: 0.0,
    maxTokens: 80,
  },
  inputSchema: RouterInputSchema,
  outputSchema: RouterOutputSchema,
  renderSystem,
  renderUser,
});

export { goldens };
export type { RouterInput, RouterOutput } from './schema.js';
