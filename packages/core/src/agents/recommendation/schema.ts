import { z } from 'zod';

import { LanguageSchema, UserPreferencesSchema } from '@smart-dining/shared';

export const RecommendationCandidateSchema = z.object({
  itemId: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  price: z.number(),
  description: z.string(),
  tags: z.array(z.string()),
  allergens: z.array(z.string()),
  caloriesKcal: z.number().nullable().optional(),
  similarity: z.number(),
});
export type RecommendationCandidate = z.infer<typeof RecommendationCandidateSchema>;

export const RecommendationInputSchema = z.object({
  /** English gloss from NLU + the original user phrase for tone matching. */
  englishGloss: z.string(),
  originalText: z.string(),
  language: LanguageSchema,
  preferences: UserPreferencesSchema,
  timeOfDay: z.enum(['breakfast', 'lunch', 'evening', 'dinner', 'late_night']),
  /** Already in the cart — never recommend duplicates. */
  cartItemIds: z.array(z.string().uuid()),
  /** Pre-retrieved by tools.search_menu — strict allowlist for the LLM. */
  candidates: z.array(RecommendationCandidateSchema).min(1),
  /** Last 5 turns rendered as transcript, or "(no prior turns)". */
  recentTranscript: z.string(),
});
export type RecommendationInput = z.infer<typeof RecommendationInputSchema>;

export const RecommendationOutputSchema = z.object({
  message: z.string().min(1).max(280).describe('Warm 1-2 sentence intro before the items'),
  suggestions: z
    .array(
      z.object({
        itemId: z.string().uuid().describe('MUST be one of the candidate itemIds'),
        name: z.string(),
        price: z.number(),
        reason: z.string().min(1).max(120),
      }),
    )
    .min(1)
    .max(3),
});
export type RecommendationOutput = z.infer<typeof RecommendationOutputSchema>;
