/**
 * @smart-dining/core — public surface.
 *
 * Consumers should prefer named subpath imports (`@smart-dining/core/agents`,
 * `@smart-dining/core/services`) over wildcard re-exports. This barrel
 * exists so type-aware tooling and editor navigation work out of the box,
 * not as the recommended import shape.
 */

export { env } from './config/env.js';
export type { Env } from './config/env.js';
