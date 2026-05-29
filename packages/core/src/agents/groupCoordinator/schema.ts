import { z } from 'zod';

import { LanguageSchema } from '@smart-dining/shared';

import { RecommendationCandidateSchema } from '../recommendation/schema.js';

export const GroupCoordinatorInputSchema = z.object({
  trigger: z.enum(['user_joined', 'group_intent']),
  /** New diner's name (user_joined trigger). */
  newJoinerName: z.string().optional(),
  /** All diner names at the table. */
  participants: z.array(z.string()),
  /** Cart summary so the joiner sees what's already happening. */
  cartItemNames: z.array(z.string()),
  /** For group_intent: how many people. */
  groupSize: z.number().int().min(1).max(20).optional(),
  /** Combined preferences across diners. */
  combinedPreferences: z.record(z.unknown()),
  language: LanguageSchema,
  /** Pre-retrieved veg + non-veg candidate sets. */
  vegCandidates: z.array(RecommendationCandidateSchema),
  nonVegCandidates: z.array(RecommendationCandidateSchema),
});
export type GroupCoordinatorInput = z.infer<typeof GroupCoordinatorInputSchema>;

export const GroupCoordinatorOutputSchema = z.object({
  message: z.string().min(1).max(300),
  /** Slot-keyed suggestions: { veg: [...], non_veg: [...] }. */
  suggestions: z.object({
    veg: z
      .array(
        z.object({
          itemId: z.string().uuid(),
          name: z.string(),
          price: z.number(),
          reason: z.string().max(120),
        }),
      )
      .max(3),
    nonVeg: z
      .array(
        z.object({
          itemId: z.string().uuid(),
          name: z.string(),
          price: z.number(),
          reason: z.string().max(120),
        }),
      )
      .max(3),
  }),
});
export type GroupCoordinatorOutput = z.infer<typeof GroupCoordinatorOutputSchema>;
