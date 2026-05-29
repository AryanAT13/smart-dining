import type { GoldenCase } from '../_base/agent.js';

import type { GroupCoordinatorInput, GroupCoordinatorOutput } from './schema.js';

const vegCandidates = [
  {
    itemId: 'aaaaaaaa-0000-0000-0000-000000000001',
    name: 'Paneer Tikka',
    category: 'veg_starters',
    price: 240,
    description: 'Charred cottage cheese.',
    tags: ['veg', 'spicy'],
    allergens: ['dairy'],
    caloriesKcal: 320,
    similarity: 0.9,
  },
];
const nonVegCandidates = [
  {
    itemId: 'bbbbbbbb-0000-0000-0000-000000000001',
    name: 'Chicken Tikka',
    category: 'non_veg_starters',
    price: 280,
    description: 'Boneless thigh.',
    tags: ['non_veg', 'spicy', 'bestseller'],
    allergens: ['dairy'],
    caloriesKcal: 360,
    similarity: 0.95,
  },
];

export const goldens: GoldenCase<GroupCoordinatorInput, GroupCoordinatorOutput>[] = [
  {
    name: 'group-intent-returns-both-slots',
    input: {
      trigger: 'group_intent',
      participants: ['Priya', 'Rahul', 'Ananya', 'Karan'],
      groupSize: 4,
      cartItemNames: [],
      combinedPreferences: { spicy: true, nonVegOk: true },
      language: 'en',
      vegCandidates,
      nonVegCandidates,
    },
    expect: (o) =>
      o.suggestions.veg.length > 0 &&
      o.suggestions.nonVeg.length > 0 &&
      o.suggestions.veg.every((s) =>
        vegCandidates.some((c) => c.itemId === s.itemId),
      ) &&
      o.suggestions.nonVeg.every((s) =>
        nonVegCandidates.some((c) => c.itemId === s.itemId),
      ),
  },
  {
    name: 'user-joined-mentions-name',
    input: {
      trigger: 'user_joined',
      newJoinerName: 'Karan',
      participants: ['Priya', 'Karan'],
      cartItemNames: ['Paneer Tikka'],
      combinedPreferences: { spicy: true },
      language: 'en',
      vegCandidates,
      nonVegCandidates,
    },
    expect: (o) => o.message.toLowerCase().includes('karan'),
  },
];
