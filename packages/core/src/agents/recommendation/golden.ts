import type { GoldenCase } from '../_base/agent.js';

import type { RecommendationInput, RecommendationOutput } from './schema.js';

/**
 * Golden cases for recommendation use a fixed candidate set so they're
 * reproducible without a live DB. The eval harness substitutes real
 * candidates when running against a seeded DB.
 */
const sampleCandidates = [
  {
    itemId: '11111111-1111-1111-1111-111111111111',
    name: 'Chicken Tikka',
    category: 'non_veg_starters',
    price: 280,
    description: 'Boneless thigh in red chilli and ginger marinade.',
    tags: ['non_veg', 'spicy', 'bestseller'],
    allergens: ['dairy'],
    caloriesKcal: 360,
    similarity: 0.91,
  },
  {
    itemId: '22222222-2222-2222-2222-222222222222',
    name: 'Hara Bhara Kebab',
    category: 'veg_starters',
    price: 200,
    description: 'Spinach, peas, and paneer patties.',
    tags: ['veg', 'light', 'healthy'],
    allergens: ['dairy'],
    caloriesKcal: 260,
    similarity: 0.78,
  },
  {
    itemId: '33333333-3333-3333-3333-333333333333',
    name: 'Tandoori Fish Tikka',
    category: 'non_veg_starters',
    price: 300,
    description: 'Basa cubes in a light yogurt-mustard marinade.',
    tags: ['non_veg', 'light', 'smoky'],
    allergens: ['fish', 'dairy'],
    caloriesKcal: 240,
    similarity: 0.74,
  },
];

const candidateIds = new Set(sampleCandidates.map((c) => c.itemId));

export const goldens: GoldenCase<RecommendationInput, RecommendationOutput>[] = [
  {
    name: 'spicy-light-nonveg-returns-only-candidates',
    input: {
      englishGloss: 'I want something spicy but light, non-veg is fine.',
      originalText: 'thoda spicy chahiye, light bhi',
      language: 'hinglish',
      preferences: { spicy: true, light: true, nonVegOk: true },
      timeOfDay: 'evening',
      cartItemIds: [],
      candidates: sampleCandidates,
      recentTranscript: '(no prior turns)',
    },
    expect: (o) =>
      o.suggestions.length > 0 &&
      o.suggestions.length <= 3 &&
      o.suggestions.every((s) => candidateIds.has(s.itemId)),
  },
  {
    name: 'never-suggests-items-in-cart',
    input: {
      englishGloss: 'Something else like the chicken tikka',
      originalText: 'something else like the chicken tikka',
      language: 'en',
      preferences: { spicy: true },
      timeOfDay: 'dinner',
      cartItemIds: ['11111111-1111-1111-1111-111111111111'],
      candidates: sampleCandidates,
      recentTranscript: '(no prior turns)',
    },
    expect: (o) =>
      o.suggestions.every((s) => s.itemId !== '11111111-1111-1111-1111-111111111111'),
  },
];
