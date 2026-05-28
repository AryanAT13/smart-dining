/**
 * SSE frame shapes for the AI streaming endpoint.
 *
 * The endpoint emits a sequence of typed frames so the UI can render each
 * stage of the agent graph as it happens — not just stream raw tokens.
 * This is what powers the "Zara is searching the menu… picking three…"
 * progress narration and the `/debug/trace` panel.
 */

import { z } from 'zod';

import { AgentNameSchema, IntentSchema, LanguageSchema } from '../intents.js';

export const SseTokenFrameSchema = z.object({
  type: z.literal('token'),
  text: z.string(),
});

export const SseAgentEnterFrameSchema = z.object({
  type: z.literal('agent:enter'),
  agent: AgentNameSchema,
});

export const SseAgentExitFrameSchema = z.object({
  type: z.literal('agent:exit'),
  agent: AgentNameSchema,
  latencyMs: z.number().nonnegative(),
});

export const SseToolCallFrameSchema = z.object({
  type: z.literal('tool:call'),
  tool: z.string(),
  argsPreview: z.record(z.unknown()).optional(),
});

export const SseRouterFrameSchema = z.object({
  type: z.literal('router:decision'),
  intent: IntentSchema,
  language: LanguageSchema,
});

export const SseSuggestionFrameSchema = z.object({
  type: z.literal('suggestion'),
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      name: z.string(),
      price: z.number(),
      reason: z.string(),
      imageUrl: z.string().optional(),
    }),
  ),
});

export const SseCartActionFrameSchema = z.object({
  type: z.literal('cart:action'),
  action: z.enum(['add', 'remove', 'update']),
  cartItemId: z.string().uuid().optional(),
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export const SseDoneFrameSchema = z.object({
  type: z.literal('done'),
  messageId: z.string().uuid(),
  totalLatencyMs: z.number().nonnegative(),
});

export const SseErrorFrameSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean().default(false),
});

export const SseFrameSchema = z.discriminatedUnion('type', [
  SseTokenFrameSchema,
  SseAgentEnterFrameSchema,
  SseAgentExitFrameSchema,
  SseToolCallFrameSchema,
  SseRouterFrameSchema,
  SseSuggestionFrameSchema,
  SseCartActionFrameSchema,
  SseDoneFrameSchema,
  SseErrorFrameSchema,
]);

export type SseFrame = z.infer<typeof SseFrameSchema>;
export type SseTokenFrame = z.infer<typeof SseTokenFrameSchema>;
export type SseSuggestionFrame = z.infer<typeof SseSuggestionFrameSchema>;
export type SseDoneFrame = z.infer<typeof SseDoneFrameSchema>;
