import type { GoldenCase } from '../_base/agent.js';

import type { ContextMemoryInput, ContextMemoryOutput } from './schema.js';

/**
 * Context memory is mostly deterministic. Its golden cases are exercised
 * via integration tests (Phase 4) where a real DB is available. The empty
 * array here is intentional — the eval harness skips agents with no goldens.
 */
export const goldens: GoldenCase<ContextMemoryInput, ContextMemoryOutput>[] = [];
