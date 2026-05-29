import { z } from 'zod';

import { LanguageSchema, UserPreferencesSchema } from '@smart-dining/shared';

export const GreeterInputSchema = z.object({
  displayName: z.string().min(1),
  language: LanguageSchema.optional(),
  timeOfDay: z.enum(['breakfast', 'lunch', 'evening', 'dinner', 'late_night']),
  restaurantName: z.string(),
});
export type GreeterInput = z.infer<typeof GreeterInputSchema>;

export const GreeterOutputSchema = z.object({
  message: z.string().min(1).max(300).describe('Warm, witty 1-2 sentence greeting in user\'s language'),
  /** Suggested two quick-tap chips to surface after the greeting. */
  prefChips: z.array(z.string().max(40)).min(2).max(4),
  /** Initial preferences inferred from time-of-day defaults (e.g. coffee at breakfast). */
  initialPreferences: UserPreferencesSchema,
});
export type GreeterOutput = z.infer<typeof GreeterOutputSchema>;
