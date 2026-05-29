import type { GoldenCase } from '../_base/agent.js';

import type { OrderValidationInput, OrderValidationOutput } from './schema.js';

/**
 * Order validation goldens exercise live cart state; they're integration
 * tests rather than pure prompt tests. Phase 4 wires them up.
 */
export const goldens: GoldenCase<OrderValidationInput, OrderValidationOutput>[] = [];
