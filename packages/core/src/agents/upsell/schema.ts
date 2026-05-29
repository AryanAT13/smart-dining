import { z } from 'zod';

import { LanguageSchema } from '@smart-dining/shared';

export const UpsellTriggerSchema = z.enum([
  'post_add',           // Item just added → suggest complement
  'threshold_below',    // Cart total < ₹500 → meal deal nudge
  'missing_beverage',   // Cart has mains, no beverage
  'veg_only_balance',   // Cart is all veg → chef-special nudge
  'evening_special',    // Time-of-day special window
  'thats_all',          // User said "that's all" → save-attempt
]);
export type UpsellTrigger = z.infer<typeof UpsellTriggerSchema>;

export const UpsellInputSchema = z.object({
  trigger: UpsellTriggerSchema,
  /** The item that just changed in the cart (for post_add). */
  triggerItemName: z.string().optional(),
  triggerItemId: z.string().uuid().optional(),
  /** Cart summary. */
  cartSubtotal: z.number().nonnegative(),
  cartItemCount: z.number().int().nonnegative(),
  cartItemNames: z.array(z.string()),
  /** Complement candidates (already retrieved via tool). */
  complements: z.array(
    z.object({
      itemId: z.string().uuid(),
      name: z.string(),
      price: z.number(),
      weight: z.number(),
    }),
  ),
  language: LanguageSchema,
  /** For the diner who triggered the event (post_add). */
  addedBy: z.string(),
});
export type UpsellInput = z.infer<typeof UpsellInputSchema>;

export const UpsellOutputSchema = z.object({
  /** False if nothing actually worth nudging — orchestrator suppresses the message. */
  shouldFire: z.boolean(),
  message: z.string().max(220),
  /** Optional add-to-cart suggestion. */
  suggestion: z
    .object({
      itemId: z.string().uuid(),
      name: z.string(),
      price: z.number(),
    })
    .nullable(),
});
export type UpsellOutput = z.infer<typeof UpsellOutputSchema>;
