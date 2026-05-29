import { env } from '../../config/env.js';
import { BaseAgent } from '../_base/index.js';

import { goldens } from './golden.js';
import { renderSystem, renderUser } from './prompt.js';
import { GroupCoordinatorInputSchema, GroupCoordinatorOutputSchema } from './schema.js';

export const groupCoordinatorAgent = new BaseAgent({
  metadata: {
    name: 'groupCoordinator',
    description: 'Balances suggestions across diners; greets joiners with cart context',
    model: env.LLM_MODEL_DEEP as 'gpt-4o',
    temperature: 0.6,
    maxTokens: 500,
  },
  inputSchema: GroupCoordinatorInputSchema,
  outputSchema: GroupCoordinatorOutputSchema,
  renderSystem,
  renderUser,
});

export { goldens };
export type { GroupCoordinatorInput, GroupCoordinatorOutput } from './schema.js';
