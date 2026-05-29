import './../setup';

import { describe, expect, it } from 'vitest';

import { mergePreferences, type UserPreferences } from '@smart-dining/shared';

describe('mergePreferences', () => {
  it('overrides scalar fields with the patch', () => {
    const base: UserPreferences = { spicy: true, light: false };
    const patch: UserPreferences = { light: true };
    expect(mergePreferences(base, patch)).toEqual({ spicy: true, light: true });
  });

  it('unions excludeAllergens arrays', () => {
    const base: UserPreferences = { excludeAllergens: ['dairy', 'nuts'] };
    const patch: UserPreferences = { excludeAllergens: ['nuts', 'gluten'] };
    const result = mergePreferences(base, patch);
    expect(result.excludeAllergens).toEqual(expect.arrayContaining(['dairy', 'nuts', 'gluten']));
    expect(result.excludeAllergens).toHaveLength(3);
  });

  it('preserves base fields not mentioned in patch', () => {
    const base: UserPreferences = { groupSize: 4, vegOnly: true };
    const patch: UserPreferences = { spicy: true };
    expect(mergePreferences(base, patch)).toEqual({
      groupSize: 4,
      vegOnly: true,
      spicy: true,
    });
  });

  it('treats undefined patch fields as no-op', () => {
    const base: UserPreferences = { spicy: true };
    const patch: UserPreferences = { spicy: undefined };
    expect(mergePreferences(base, patch)).toEqual({ spicy: true });
  });
});
