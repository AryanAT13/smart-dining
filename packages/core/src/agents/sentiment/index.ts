import { env } from '../../config/env.js';
import { BaseAgent } from '../_base/index.js';

import { goldens } from './golden.js';
import { renderSystem, renderUser } from './prompt.js';
import { SentimentInputSchema, SentimentOutputSchema } from './schema.js';

export const sentimentAgent = new BaseAgent({
  metadata: {
    name: 'sentiment',
    description: 'Background classifier — drives tone adjustments and escalation flags',
    model: env.LLM_MODEL_FAST as 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 120,
  },
  inputSchema: SentimentInputSchema,
  outputSchema: SentimentOutputSchema,
  renderSystem,
  renderUser,
});

export { goldens };
export type { SentimentInput, SentimentOutput } from './schema.js';
