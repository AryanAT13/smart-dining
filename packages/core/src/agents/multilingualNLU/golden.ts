import type { GoldenCase } from '../_base/agent.js';

import type { NluInput, NluOutput } from './schema.js';

export const goldens: GoldenCase<NluInput, NluOutput>[] = [
  {
    name: 'hinglish-spicy-dairy-allergy',
    input: { text: 'thoda spicy chahiye, dairy se allergy hai' },
    expect: (o) =>
      o.language === 'hinglish' &&
      o.preferences.spicy === true &&
      (o.preferences.excludeAllergens?.includes('dairy') ?? false) &&
      o.intentHint === 'RECOMMEND',
  },
  {
    name: 'telugu-english-spicy-nonveg',
    input: { text: 'konchem spicy ga undali, veg kaadu' },
    expect: (o) =>
      o.language === 'telugu-english' &&
      o.preferences.spicy === true &&
      o.preferences.nonVegOk === true,
  },
  {
    name: 'english-light-snack',
    input: { text: 'something light, around 300 calories or less' },
    expect: (o) => o.language === 'en' && o.preferences.light === true,
  },
  {
    name: 'group-intent-mixed',
    input: { text: 'we are 4 people, mix veg and non-veg' },
    expect: (o) => o.intentHint === 'GROUP_MERGE' && o.preferences.groupSize === 4,
  },
  {
    name: 'add-item-explicit',
    input: { text: 'add garlic naan to our order' },
    expect: (o) => o.intentHint === 'ADD_ITEM',
  },
  {
    name: 'checkout-thats-all',
    input: { text: "that's all, place the order" },
    expect: (o) => o.intentHint === 'CHECKOUT',
  },
  {
    name: 'hinglish-best-thing',
    input: { text: 'yahaan ka best item kya hai?' },
    expect: (o) => o.language === 'hinglish' && o.intentHint === 'RECOMMEND',
  },
  {
    name: 'vague-emoji',
    input: { text: '🙂' },
    expect: (o) => o.intentHint === 'CLARIFY' || o.intentHint === 'FALLBACK',
  },
];
