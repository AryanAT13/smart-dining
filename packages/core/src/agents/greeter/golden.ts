import type { GoldenCase } from '../_base/agent.js';

import type { GreeterInput, GreeterOutput } from './schema.js';

export const goldens: GoldenCase<GreeterInput, GreeterOutput>[] = [
  {
    name: 'lunchtime-greeting-english',
    input: {
      displayName: 'Priya',
      timeOfDay: 'lunch',
      restaurantName: 'Zaika',
      language: 'en',
    },
    expect: (o) =>
      o.message.toLowerCase().includes('priya') &&
      o.prefChips.length >= 2 &&
      o.prefChips.every((c) => c.length <= 40),
  },
  {
    name: 'hinglish-evening-greeting',
    input: {
      displayName: 'Rahul',
      timeOfDay: 'evening',
      restaurantName: 'Zaika',
      language: 'hinglish',
    },
    expect: (o) => o.prefChips.length >= 2,
  },
];
