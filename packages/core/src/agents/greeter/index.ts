import { env } from '../../config/env.js';
import { BaseAgent } from '../_base/index.js';

import { goldens } from './golden.js';
import { renderSystem, renderUser } from './prompt.js';
import { GreeterInputSchema, GreeterOutputSchema } from './schema.js';

export const greeterAgent = new BaseAgent({
  metadata: {
    name: 'greeter',
    description: 'First-message warm welcome + preference chips',
    model: env.LLM_MODEL_FAST as 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 200,
  },
  inputSchema: GreeterInputSchema,
  outputSchema: GreeterOutputSchema,
  renderSystem,
  renderUser,
});

export { goldens };
export type { GreeterInput, GreeterOutput } from './schema.js';
