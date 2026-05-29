import type { GoldenCase } from '../_base/agent.js';

import type { UpsellInput, UpsellOutput } from './schema.js';

const sampleComplements = [
  { itemId: 'a1b2c3d4-0000-0000-0000-000000000001', name: 'Mint Chutney', price: 40, weight: 0.81 },
  { itemId: 'a1b2c3d4-0000-0000-0000-000000000002', name: 'Garlic Naan', price: 75, weight: 0.78 },
];

export const goldens: GoldenCase<UpsellInput, UpsellOutput>[] = [
  {
    name: 'post-add-suggests-from-complements',
    input: {
      trigger: 'post_add',
      triggerItemName: 'Chilli Chicken Bites',
      triggerItemId: 'a1b2c3d4-1111-1111-1111-111111111111',
      cartSubtotal: 220,
      cartItemCount: 1,
      cartItemNames: ['Chilli Chicken Bites'],
      complements: sampleComplements,
      language: 'en',
      addedBy: 'Priya',
    },
    expect: (o) =>
      o.shouldFire === true &&
      o.suggestion !== null &&
      sampleComplements.some((c) => c.itemId === o.suggestion?.itemId),
  },
  {
    name: 'empty-complements-suppresses',
    input: {
      trigger: 'post_add',
      triggerItemName: 'Random Item',
      cartSubtotal: 200,
      cartItemCount: 1,
      cartItemNames: ['Random Item'],
      complements: [],
      language: 'en',
      addedBy: 'Priya',
    },
    expect: (o) => o.shouldFire === false || o.suggestion === null,
  },
];
