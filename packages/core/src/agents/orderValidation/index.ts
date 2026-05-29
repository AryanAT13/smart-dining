/**
 * Order Validation Agent — deterministic core, LLM-phrased messaging.
 *
 * Validation logic doesn't use the LLM (stock checks, totals are exact). The
 * LLM is only used to phrase the rejection message in the user's language /
 * tone. On success, the message is optional and we usually skip it.
 */

import { z } from 'zod';

import { env } from '../../config/env.js';
import { chatJson } from '../../llm/json.js';
import { childLogger } from '../../lib/logger.js';
import { cartService } from '../../services/cart/service.js';
import { menuService } from '../../services/menu/service.js';
import type { Agent, AgentInvokeResult } from '../_base/index.js';

import {
  OrderValidationInputSchema,
  OrderValidationOutputSchema,
  type OrderValidationInput,
  type OrderValidationOutput,
} from './schema.js';

const log = childLogger('agent:orderValidation');

const RejectionSchema = z.object({ message: z.string().min(1).max(280) });

class OrderValidationAgent implements Agent<OrderValidationInput, OrderValidationOutput> {
  readonly metadata = {
    name: 'orderValidation' as const,
    description: 'Pre-checkout stock + totals validation. LLM only for phrasing.',
    model: 'deterministic' as const,
    temperature: 0,
    maxTokens: 0,
  };
  readonly inputSchema = OrderValidationInputSchema;
  readonly outputSchema = OrderValidationOutputSchema;

  async invoke(input: OrderValidationInput): Promise<AgentInvokeResult<OrderValidationOutput>> {
    const t0 = Date.now();
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;

    const cart = await cartService.getCart(input.sessionId);

    if (cart.items.length === 0) {
      const phrased = await this.phraseRejection(input.language, [
        { kind: 'empty_cart' },
      ]);
      tokensIn += phrased.tokensIn;
      tokensOut += phrased.tokensOut;
      costUsd += phrased.costUsd;
      return {
        output: {
          ok: false,
          issues: [{ kind: 'empty_cart' as const }],
          message: phrased.text,
        },
        metrics: { latencyMs: Date.now() - t0, tokensIn, tokensOut, costUsd, retries: 0 },
      };
    }

    // Stock revalidation.
    const stockIssues: { kind: 'out_of_stock'; itemName: string }[] = [];
    for (const line of cart.items) {
      try {
        await menuService.validateStock(line.menuItem.id);
      } catch {
        stockIssues.push({ kind: 'out_of_stock' as const, itemName: line.menuItem.name });
      }
    }

    if (stockIssues.length > 0) {
      const phrased = await this.phraseRejection(input.language, stockIssues);
      tokensIn += phrased.tokensIn;
      tokensOut += phrased.tokensOut;
      costUsd += phrased.costUsd;
      log.info({ sessionId: input.sessionId, issues: stockIssues }, 'validation failed: stock');
      return {
        output: { ok: false, issues: stockIssues, message: phrased.text },
        metrics: { latencyMs: Date.now() - t0, tokensIn, tokensOut, costUsd, retries: 0 },
      };
    }

    // OK — no LLM call needed on the happy path.
    const itemCount = cart.items.reduce((acc, l) => acc + l.quantity, 0);
    const estimatedWaitMinutes = estimateWait(
      cart.items.map((l) => l.menuItem.prepTimeMinutes),
    );

    return {
      output: {
        ok: true,
        summary: {
          itemCount,
          subtotal: cart.subtotal,
          tax: cart.tax,
          total: cart.total,
          estimatedWaitMinutes,
        },
        message: null,
      },
      metrics: { latencyMs: Date.now() - t0, tokensIn, tokensOut, costUsd, retries: 0 },
    };
  }

  private async phraseRejection(
    language: OrderValidationInput['language'],
    issues: Array<{ kind: string; itemName?: string }>,
  ): Promise<{ text: string; tokensIn: number; tokensOut: number; costUsd: number }> {
    const result = await chatJson({
      model: env.LLM_MODEL_FAST,
      temperature: 0.3,
      maxTokens: 150,
      systemPrompt: REJECTION_SYSTEM,
      userPrompt: `Language: ${language}\nIssues: ${JSON.stringify(issues)}`,
      schema: RejectionSchema,
      repairAttempts: 1,
    });
    return {
      text: result.data.message,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    };
  }
}

function estimateWait(prepTimes: (number | null)[]): number | null {
  const values = prepTimes.filter((t): t is number => t !== null);
  if (values.length === 0) return null;
  return Math.max(...values) + Math.min(8, Math.max(2, values.length));
}

const REJECTION_SYSTEM = `You phrase a SHORT, warm message explaining why an
order can't be placed. Mention the affected item names. Suggest the diner
remove or swap them. 1-2 sentences max, in the user's language.
Output strict JSON: { "message": "<text>" }.`;

export const orderValidationAgent = new OrderValidationAgent();

export type { OrderValidationInput, OrderValidationOutput } from './schema.js';
