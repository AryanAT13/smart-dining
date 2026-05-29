import { env } from '../../config/env.js';
import { BaseAgent } from '../_base/index.js';

import { goldens } from './golden.js';
import { fewShotExamples, renderSystem, renderUser } from './prompt.js';
import { NluInputSchema, NluOutputSchema } from './schema.js';

export const multilingualNLUAgent = new BaseAgent({
  metadata: {
    name: 'multilingualNLU',
    description: 'Normalises raw user input into structured intent + preferences + language',
    model: env.LLM_MODEL_FAST as 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 300,
  },
  inputSchema: NluInputSchema,
  outputSchema: NluOutputSchema,
  renderSystem,
  renderUser,
  fewShot: () => fewShotExamples,
});

export { goldens };
export type { NluInput, NluOutput } from './schema.js';
