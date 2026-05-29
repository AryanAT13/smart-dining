/**
 * Tool registry — single source of truth for the function-calling surface.
 *
 * Every tool ships a Zod schema for its arguments, a TypeScript handler, and
 * a per-agent allowlist. The registry's `dispatch()` is the ONLY way agents
 * reach services — direct service imports inside agent code are forbidden by
 * convention.
 *
 * Three guarantees:
 *   1. **Validation** — args run through Zod before the handler sees them.
 *   2. **Authorisation** — calls fail closed if the caller isn't in `allowedAgents`.
 *   3. **Observability** — every call is timed and appended to the context trace.
 */

import { z, type ZodSchema, type ZodTypeDef } from 'zod';

/**
 * Schema type that decouples INPUT from OUTPUT. Required because `.default()`
 * produces a schema whose input is `T | undefined` but whose output is `T` —
 * `ZodSchema<T>` requires input == output, which rejects defaults.
 */
type ToolArgsSchema<T> = z.ZodType<T, ZodTypeDef, unknown>;

import type { AgentName } from '@smart-dining/shared';

import { UnauthorizedError, ValidationError, toDomainError } from '../lib/errors.js';
import { childLogger } from '../lib/logger.js';

import type { AgentContext, ToolTraceEntry } from './context.js';

const log = childLogger('tool-registry');

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export interface ToolDefinition<TArgs, TResult> {
  /** Wire name used in LLM function-calling and trace output. */
  name: string;
  /** Short description injected into the LLM tool spec. */
  description: string;
  /** Zod schema for arguments. Input may be undefined for fields with defaults. */
  argsSchema: ToolArgsSchema<TArgs>;
  /** Allowlist — only these agents can call this tool. */
  allowedAgents: ReadonlyArray<AgentName | 'orchestrator'>;
  /** Pure handler. Receives validated args + context. */
  handler: (args: TArgs, ctx: AgentContext) => Promise<TResult>;
}

export type AnyTool = ToolDefinition<unknown, unknown>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  register<TArgs, TResult>(def: ToolDefinition<TArgs, TResult>): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Tool '${def.name}' is already registered`);
    }
    this.tools.set(def.name, def as AnyTool);
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  list(): AnyTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Render the JSON-schema-shaped tool spec the way OpenAI's function-calling
   * API expects (under `tools: [{ type: 'function', function: { ... } }]`).
   * Filter by agent so each agent only sees its allowed tools.
   */
  specsForAgent(agent: AgentName | 'orchestrator'): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: unknown };
  }> {
    return this.list()
      .filter((t) => t.allowedAgents.includes(agent))
      .map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: zodToOpenAiSchema(t.argsSchema as unknown as ZodSchema<unknown>),
        },
      }));
  }

  /**
   * Validate, authorise, time, trace, and execute.
   *
   * Throws DomainError subclasses on failure; the orchestrator translates them
   * to formatter errors. Never returns silently on parse failures.
   */
  async dispatch<TResult = unknown>(
    name: string,
    rawArgs: unknown,
    ctx: AgentContext,
  ): Promise<TResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ValidationError(`Unknown tool '${name}'`);
    }
    if (!tool.allowedAgents.includes(ctx.callerAgent)) {
      log.warn(
        { tool: name, caller: ctx.callerAgent },
        'tool call rejected: caller not in allowlist',
      );
      throw new UnauthorizedError(`Agent '${ctx.callerAgent}' may not call '${name}'`);
    }

    const parsed = tool.argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ValidationError(`Invalid args for '${name}'`, {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const t0 = Date.now();
    const entry: ToolTraceEntry = {
      tool: name,
      durationMs: 0,
      ok: false,
      argsPreview: previewArgs(parsed.data),
      resultPreview: null,
    };

    try {
      const result = (await tool.handler(parsed.data, ctx)) as TResult;
      entry.durationMs = Date.now() - t0;
      entry.ok = true;
      entry.resultPreview = previewResult(result);
      ctx.toolTrace?.push(entry);
      return result;
    } catch (err) {
      entry.durationMs = Date.now() - t0;
      entry.ok = false;
      entry.errorMessage = err instanceof Error ? err.message : String(err);
      ctx.toolTrace?.push(entry);
      throw toDomainError(err, `Tool '${name}' failed`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Zod schema to the JSON-Schema-like shape OpenAI expects for
 * function parameters. We use Zod's built-in `_def` only for the outer
 * object shape and let the LLM treat unknown values as strings — sufficient
 * for our small tool surface. (For richer needs, `zod-to-json-schema` is the
 * canonical library.)
 */
function zodToOpenAiSchema(schema: ZodSchema<unknown>): unknown {
  // Inline a minimal converter for the shapes we actually use (objects of
  // strings, numbers, enums, optionals). Keeps the bundle tiny vs. pulling a
  // full converter dep. Falls back to `{}` for anything exotic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  if (!def) return { type: 'object' };
  switch (def.typeName) {
    case 'ZodObject': {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, child] of Object.entries(shape)) {
        properties[key] = zodToOpenAiSchema(child as ZodSchema<unknown>);
        if (!isOptional(child as ZodSchema<unknown>)) required.push(key);
      }
      return { type: 'object', properties, required };
    }
    case 'ZodString':
      return def.checks?.some((c: { kind: string }) => c.kind === 'uuid')
        ? { type: 'string', format: 'uuid' }
        : { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodArray':
      return { type: 'array', items: zodToOpenAiSchema(def.type) };
    case 'ZodOptional':
    case 'ZodDefault':
    case 'ZodNullable':
      return zodToOpenAiSchema(def.innerType);
    case 'ZodLiteral':
      return { const: def.value };
    case 'ZodUnion':
      return { anyOf: (def.options as ZodSchema<unknown>[]).map(zodToOpenAiSchema) };
    default:
      return {};
  }
}

function isOptional(schema: ZodSchema<unknown>): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  if (!def) return false;
  return def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault' || def.typeName === 'ZodNullable';
}

function previewArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    out[k] = preview(v);
  }
  return out;
}

function previewResult(result: unknown): unknown {
  return preview(result);
}

function preview(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 3).map(preview);
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).slice(0, 6);
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = preview(obj[k]);
    return out;
  }
  if (typeof value === 'string' && value.length > 120) return value.slice(0, 120) + '…';
  return value;
}

// ---------------------------------------------------------------------------
// Module singleton
// ---------------------------------------------------------------------------

export const toolRegistry = new ToolRegistry();

/**
 * Convenience: ensures all tools register exactly once even under HMR.
 * Each tool module calls `toolRegistry.register(...)` at module load; this
 * function imports the tool barrel which triggers all registrations.
 */
let _registered = false;
export async function ensureToolsRegistered(): Promise<void> {
  if (_registered) return;
  await import('./index.js');
  _registered = true;
}

// Re-export for tests that want to inspect the schema converter directly.
export const _internals = { zodToOpenAiSchema };

// Re-export the type for downstream typing.
export type { ZodSchema };
export { z };
