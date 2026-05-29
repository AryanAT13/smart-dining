import type { GoldenCase } from '../_base/agent.js';

import type { RouterInput, RouterOutput } from './schema.js';

export const goldens: GoldenCase<RouterInput, RouterOutput>[] = [
  {
    name: 'first-greeting-routes-to-greet',
    input: {
      englishGloss: 'Hi there',
      hint: 'GREET',
      hasBeenGreeted: false,
      cartItemCount: 0,
    },
    expect: (o) => o.intent === 'GREET',
  },
  {
    name: 'substantive-first-skips-greet',
    input: {
      englishGloss: 'I want something spicy but not heavy',
      hint: 'RECOMMEND',
      hasBeenGreeted: false,
      cartItemCount: 0,
    },
    expect: (o) => o.intent === 'RECOMMEND',
  },
  {
    name: 'thats-all-with-cart-becomes-checkout',
    input: {
      englishGloss: "that's all, we are done",
      hint: 'CHECKOUT',
      hasBeenGreeted: true,
      cartItemCount: 3,
    },
    expect: (o) => o.intent === 'CHECKOUT',
  },
  {
    name: 'group-merge-passes-through',
    input: {
      englishGloss: 'We are 4 people, mix veg and non-veg',
      hint: 'GROUP_MERGE',
      hasBeenGreeted: true,
      cartItemCount: 0,
    },
    expect: (o) => o.intent === 'GROUP_MERGE',
  },
  {
    name: 'vague-emoji-becomes-clarify',
    input: {
      englishGloss: 'happy face',
      hint: 'CLARIFY',
      hasBeenGreeted: true,
      cartItemCount: 0,
    },
    expect: (o) => o.intent === 'CLARIFY' || o.intent === 'FALLBACK',
  },
];
