/**
 * Agent barrel — exports every agent and its goldens.
 * Consumed by the orchestrator and the eval harness.
 */

export type { Agent, AgentMetadata, AgentInvokeResult, GoldenCase } from './_base/index.js';
export { BaseAgent } from './_base/index.js';

export {
  multilingualNLUAgent,
  goldens as multilingualNLUGoldens,
  type NluInput,
  type NluOutput,
} from './multilingualNLU/index.js';
export {
  routerAgent,
  goldens as routerGoldens,
  type RouterInput,
  type RouterOutput,
} from './router/index.js';
export {
  greeterAgent,
  goldens as greeterGoldens,
  type GreeterInput,
  type GreeterOutput,
} from './greeter/index.js';
export {
  recommendationAgent,
  goldens as recommendationGoldens,
  type RecommendationInput,
  type RecommendationOutput,
  type RecommendationCandidate,
} from './recommendation/index.js';
export {
  upsellAgent,
  goldens as upsellGoldens,
  type UpsellInput,
  type UpsellOutput,
  type UpsellTrigger,
} from './upsell/index.js';
export {
  contextMemoryAgent,
  type ContextMemoryInput,
  type ContextMemoryOutput,
} from './contextMemory/index.js';
export { goldens as contextMemoryGoldens } from './contextMemory/golden.js';
export {
  sentimentAgent,
  goldens as sentimentGoldens,
  type SentimentInput,
  type SentimentOutput,
} from './sentiment/index.js';
export {
  groupCoordinatorAgent,
  goldens as groupCoordinatorGoldens,
  type GroupCoordinatorInput,
  type GroupCoordinatorOutput,
} from './groupCoordinator/index.js';
export {
  orderValidationAgent,
  type OrderValidationInput,
  type OrderValidationOutput,
} from './orderValidation/index.js';
export { goldens as orderValidationGoldens } from './orderValidation/golden.js';
