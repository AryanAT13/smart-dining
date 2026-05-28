/**
 * User preference shape — written by Greeter and Context Memory agents,
 * read by everyone. Persisted in `sessions.preferences` (and `users.preferences`
 * for the long-term tier).
 *
 * All fields are optional and additive. The agents merge, never overwrite —
 * a user who said "no dairy" at turn 2 still has that constraint at turn 20.
 */

import { z } from 'zod';

export const UserPreferencesSchema = z
  .object({
    // Diet
    vegOnly: z.boolean().optional(),
    nonVegOk: z.boolean().optional(),
    eggOk: z.boolean().optional(),
    // Allergens to exclude (subset of menu_item.allergens vocabulary)
    excludeAllergens: z
      .array(z.enum(['dairy', 'gluten', 'nuts', 'fish', 'shellfish', 'soy', 'egg']))
      .optional(),
    // Taste / weight
    spicy: z.boolean().optional(),
    light: z.boolean().optional(),
    sweet: z.boolean().optional(),
    filling: z.boolean().optional(),
    // Course-level skips
    skipDessert: z.boolean().optional(),
    skipStarters: z.boolean().optional(),
    // Group context
    groupSize: z.number().int().min(1).max(20).optional(),
    // Budget hint, in INR — soft signal only
    budgetPerHead: z.number().int().positive().optional(),
  })
  .strict();

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

/**
 * Deep-merge two preference objects. Right-hand wins on scalars; arrays union.
 * Used everywhere we accumulate preferences across turns.
 */
export function mergePreferences(
  base: UserPreferences,
  patch: UserPreferences,
): UserPreferences {
  const merged: UserPreferences = { ...base };
  for (const key of Object.keys(patch) as (keyof UserPreferences)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    if (key === 'excludeAllergens' && Array.isArray(value)) {
      const existing = base.excludeAllergens ?? [];
      merged.excludeAllergens = Array.from(new Set([...existing, ...value]));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = value;
    }
  }
  return merged;
}
