import { z } from 'zod';

import { IntentSchema } from '@smart-dining/shared';

export const RouterInputSchema = z.object({
  /** English gloss from the NLU stage. */
  englishGloss: z.string().min(1),
  /** Intent hint from NLU (the router can override but usually agrees). */
  hint: IntentSchema,
  /** Has the user been greeted in this session? */
  hasBeenGreeted: z.boolean(),
  /** Current cart size — informs UPSELL_CHECK and CHECKOUT routing. */
  cartItemCount: z.number().int().nonnegative(),
});
export type RouterInput = z.infer<typeof RouterInputSchema>;

export const RouterOutputSchema = z.object({
  intent: IntentSchema,
  /** Reason — surfaces in the trace UI. */
  reason: z.string().min(1).max(120),
});
export type RouterOutput = z.infer<typeof RouterOutputSchema>;
