/**
 * @smart-dining/core — public surface.
 *
 * Two ways to import:
 *   1. Subpath: `import { menuService } from '@smart-dining/core/services'` — preferred,
 *      pulls only the surface you need.
 *   2. Barrel: `import { menuService } from '@smart-dining/core'` — convenient
 *      in TS-aware editors; equivalent at the type level.
 */

export { env, isProduction, isDevelopment, isTest, isDemoMode, type Env } from './config/env.js';

export { prisma, type Tx } from './db/client.js';
export { redis, redisPub, redisSub, keys, channels } from './db/redis.js';

export * from './lib/index.js';
export * from './llm/index.js';
export * from './services/index.js';
export * from './memory/index.js';
export { toolRegistry, ensureToolsRegistered, type ToolDefinition } from './tools/index.js';
export type { AgentContext, ToolTraceEntry } from './tools/context.js';
export {
  runOrchestrator,
  OrchestratorEmitter,
  initialState,
  persistTraces,
  previewForTrace,
  triggerPostAddUpsell,
  type RunOptions,
  type OrchestratorInput,
  type OrchestratorState,
  type AgentTraceRecord,
  type PostAddUpsellArgs,
} from './orchestrator/index.js';
