import { z } from 'zod';

import { LanguageSchema } from '@smart-dining/shared';

export const OrderValidationInputSchema = z.object({
  sessionId: z.string().uuid(),
  language: LanguageSchema,
});
export type OrderValidationInput = z.infer<typeof OrderValidationInputSchema>;

export const OrderValidationOutputSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    summary: z.object({
      itemCount: z.number().int().nonnegative(),
      subtotal: z.number().nonnegative(),
      tax: z.number().nonnegative(),
      total: z.number().nonnegative(),
      estimatedWaitMinutes: z.number().int().nullable(),
    }),
    /** Optional friendly confirmation line (LLM-phrased). */
    message: z.string().max(220).nullable(),
  }),
  z.object({
    ok: z.literal(false),
    /** Items that failed validation. */
    issues: z.array(
      z.object({
        kind: z.enum(['out_of_stock', 'empty_cart', 'min_order']),
        itemName: z.string().optional(),
      }),
    ),
    /** LLM-phrased rejection in the user's language. */
    message: z.string().max(280),
  }),
]);
export type OrderValidationOutput = z.infer<typeof OrderValidationOutputSchema>;
