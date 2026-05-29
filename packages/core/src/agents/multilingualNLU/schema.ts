import { z } from 'zod';

import { LanguageSchema, UserPreferencesSchema } from '@smart-dining/shared';

export const NluInputSchema = z.object({
  text: z.string().min(1).max(500),
});
export type NluInput = z.infer<typeof NluInputSchema>;

export const NluOutputSchema = z.object({
  rawText: z.string(),
  language: LanguageSchema,
  /** Free-text normalised English representation — useful for downstream prompts. */
  englishGloss: z.string().min(1).max(500),
  /** Inferred preferences from this single message — caller MERGES into session prefs. */
  preferences: UserPreferencesSchema,
  /** Light intent hint (router will re-classify). */
  intentHint: z.enum([
    'GREET',
    'RECOMMEND',
    'ADD_ITEM',
    'REMOVE_ITEM',
    'UPDATE_QTY',
    'GROUP_MERGE',
    'CHECKOUT',
    'CLARIFY',
    'FALLBACK',
  ]),
  /** Did the message reference items implicitly (used by router)? */
  mentionsCart: z.boolean(),
});
export type NluOutput = z.infer<typeof NluOutputSchema>;
