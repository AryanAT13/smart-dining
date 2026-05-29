import { env } from '../../config/env.js';
import { BaseAgent } from '../_base/index.js';

import { goldens } from './golden.js';
import { renderSystem, renderUser } from './prompt.js';
import { UpsellInputSchema, UpsellOutputSchema } from './schema.js';

export const upsellAgent = new BaseAgent({
  metadata: {
    name: 'upsell',
    description: 'Generates contextual single-shot upsell messages on cart events',
    model: env.LLM_MODEL_FAST as 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 250,
  },
  inputSchema: UpsellInputSchema,
  outputSchema: UpsellOutputSchema,
  renderSystem,
  renderUser,
});

export { goldens };
export type { UpsellInput, UpsellOutput, UpsellTrigger } from './schema.js';
