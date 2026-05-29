import { env } from '../../config/env.js';
import { BaseAgent } from '../_base/index.js';

import { goldens } from './golden.js';
import { renderSystem, renderUser } from './prompt.js';
import { RecommendationInputSchema, RecommendationOutputSchema } from './schema.js';

export const recommendationAgent = new BaseAgent({
  metadata: {
    name: 'recommendation',
    description: 'RAG-grounded menu recommender. Suggests 1-3 items from a retrieved candidate set.',
    model: env.LLM_MODEL_DEEP as 'gpt-4o',
    temperature: 0.7,
    maxTokens: 500,
  },
  inputSchema: RecommendationInputSchema,
  outputSchema: RecommendationOutputSchema,
  renderSystem,
  renderUser,
});

export { goldens };
export type { RecommendationInput, RecommendationOutput, RecommendationCandidate } from './schema.js';
