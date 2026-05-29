/**
 * Context Memory Agent — mostly deterministic.
 *
 * Most of its work is straight Redis writes. The only LLM call is the
 * rolling summary, which fires every ~10 turns to keep prompt budgets bounded.
 */

import { mergePreferences } from '@smart-dining/shared';

import { chatJson } from '../../llm/json.js';
import { env } from '../../config/env.js';
import { childLogger } from '../../lib/logger.js';
import { sessionService } from '../../services/session/service.js';
import type { Agent, AgentInvokeResult } from '../_base/index.js';

import {
  ContextMemoryInputSchema,
  ContextMemoryOutputSchema,
  type ContextMemoryInput,
  type ContextMemoryOutput,
} from './schema.js';
import { z } from 'zod';

const log = childLogger('agent:contextMemory');

const SummarySchema = z.object({ summary: z.string().min(1).max(500) });

class ContextMemoryAgent implements Agent<ContextMemoryInput, ContextMemoryOutput> {
  readonly metadata = {
    name: 'contextMemory' as const,
    description: 'Persists merged preferences and rolling summary into session state',
    model: 'deterministic' as const,
    temperature: 0,
    maxTokens: 0,
  };
  readonly inputSchema = ContextMemoryInputSchema;
  readonly outputSchema = ContextMemoryOutputSchema;

  async invoke(input: ContextMemoryInput): Promise<AgentInvokeResult<ContextMemoryOutput>> {
    const t0 = Date.now();
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;

    // 1. Merge preferences.
    const current = await sessionService.getById(input.sessionId);
    const merged = mergePreferences(current.preferences, input.preferencesPatch);
    if (Object.keys(input.preferencesPatch).length > 0) {
      await sessionService.updatePreferences(input.sessionId, input.preferencesPatch);
    }
    if (input.language) {
      await sessionService.setLanguage(input.sessionId, input.language);
    }

    // 2. Optional rolling summary.
    let newSummary: string | null = null;
    if (input.shouldSummarize && input.transcriptToCompress) {
      const result = await chatJson({
        model: env.LLM_MODEL_FAST,
        temperature: 0.3,
        maxTokens: 300,
        systemPrompt: SUMMARY_SYSTEM,
        userPrompt: input.transcriptToCompress,
        schema: SummarySchema,
        repairAttempts: 1,
      });
      newSummary = result.data.summary;
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
      costUsd = result.costUsd;
      await sessionService.updateSummary(input.sessionId, newSummary);
      log.debug({ sessionId: input.sessionId, length: newSummary.length }, 'summary updated');
    }

    return {
      output: { mergedPreferences: merged, newSummary },
      metrics: {
        latencyMs: Date.now() - t0,
        tokensIn,
        tokensOut,
        costUsd,
        retries: 0,
      },
    };
  }
}

const SUMMARY_SYSTEM = `Summarise the conversation so far in 1-3 short
sentences. Focus on enduring facts: explicitly stated preferences (spice,
veg/non-veg, allergens), group context, and what has been ordered. Drop
filler. Output strict JSON: { "summary": "<text>" }.`;

export const contextMemoryAgent = new ContextMemoryAgent();

export type { ContextMemoryInput, ContextMemoryOutput } from './schema.js';
