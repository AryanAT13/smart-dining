/**
 * OpenAI client — shared by every agent and the embeddings pipeline.
 *
 * Wraps the official SDK with:
 *   - retry with exponential backoff for transient 5xx and 429s
 *   - request-level timeout (defaults to 30s; agents override per call)
 *   - cost accounting per session — the per-session budget cap in env
 *     `SESSION_LLM_BUDGET_USD` is enforced at this layer
 */

import OpenAI from 'openai';

import { env } from '../config/env.js';
import { UpstreamError } from '../lib/errors.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('openai');

declare global {
  // eslint-disable-next-line no-var
  var __OPENAI__: OpenAI | undefined;
}

export const openai: OpenAI =
  globalThis.__OPENAI__ ??
  new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: 30_000,
    maxRetries: 3,
  });

if (env.NODE_ENV === 'development') globalThis.__OPENAI__ = openai;

// ---------------------------------------------------------------------------
// Pricing table — Sept 2024 published prices. Re-check before launching.
// USD per 1M tokens. Used for the per-session budget cap.
// ---------------------------------------------------------------------------

type ModelPricing = { inputPerM: number; outputPerM: number };

const PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10.0 },
  'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  'text-embedding-3-small': { inputPerM: 0.02, outputPerM: 0 },
};

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICING[model];
  if (!price) {
    log.warn({ model }, 'unknown model pricing; cost estimate will be 0');
    return 0;
  }
  return (tokensIn * price.inputPerM + tokensOut * price.outputPerM) / 1_000_000;
}

/**
 * Map an OpenAI SDK error to a UpstreamError so the rest of the app doesn't
 * see provider-specific shapes.
 */
export function wrapOpenAiError(err: unknown, context: string): UpstreamError {
  if (err instanceof OpenAI.APIError) {
    return new UpstreamError('openai', `${context}: ${err.message}`, {
      status: err.status,
      code: err.code,
      type: err.type,
    });
  }
  const message = err instanceof Error ? err.message : String(err);
  return new UpstreamError('openai', `${context}: ${message}`);
}
