/**
 * Tool barrel — importing this module triggers registration of every tool.
 *
 * The orchestrator calls `ensureToolsRegistered()` once at startup. Do not
 * import individual tool modules elsewhere; go through the registry's
 * `dispatch()` method.
 */

export { toolRegistry, ensureToolsRegistered, type ToolDefinition } from './registry.js';
export type { AgentContext, ToolTraceEntry } from './context.js';

// Side-effect imports — registration happens at module load.
import './searchMenu.js';
import './getCart.js';
import './addToCart.js';
import './removeFromCart.js';
import './getPopularItems.js';
import './getComplementary.js';
import './getSessionContext.js';
import './updatePreference.js';
import './validateStock.js';
