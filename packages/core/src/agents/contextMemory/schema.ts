import { z } from 'zod';

import { LanguageSchema, UserPreferencesSchema } from '@smart-dining/shared';

export const ContextMemoryInputSchema = z.object({
  sessionId: z.string().uuid(),
  /** Preferences this turn inferred from the user message. */
  preferencesPatch: UserPreferencesSchema,
  /** Language detected this turn. */
  language: LanguageSchema.optional(),
  /** Has the turn count crossed the summarization threshold? */
  shouldSummarize: z.boolean(),
  /** Recent turns to summarize (rendered as transcript). */
  transcriptToCompress: z.string().optional(),
});
export type ContextMemoryInput = z.infer<typeof ContextMemoryInputSchema>;

export const ContextMemoryOutputSchema = z.object({
  mergedPreferences: UserPreferencesSchema,
  /** Updated rolling summary (only present when shouldSummarize was true). */
  newSummary: z.string().nullable(),
});
export type ContextMemoryOutput = z.infer<typeof ContextMemoryOutputSchema>;
