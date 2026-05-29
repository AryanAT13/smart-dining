import { z } from 'zod';

import { SentimentActionSchema, SentimentSchema } from '@smart-dining/shared';

export const SentimentInputSchema = z.object({
  text: z.string().min(1).max(500),
  /** Has the user repeated themselves or shown signs of frustration? */
  consecutiveSameIntent: z.number().int().nonnegative().default(0),
});
export type SentimentInput = z.infer<typeof SentimentInputSchema>;

export const SentimentOutputSchema = z.object({
  sentiment: SentimentSchema,
  confidence: z.number().min(0).max(1),
  recommendedAction: SentimentActionSchema,
  reason: z.string().min(1).max(120),
});
export type SentimentOutput = z.infer<typeof SentimentOutputSchema>;
