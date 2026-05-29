import type { GoldenCase } from '../_base/agent.js';

import type { SentimentInput, SentimentOutput } from './schema.js';

export const goldens: GoldenCase<SentimentInput, SentimentOutput>[] = [
  {
    name: 'enthusiastic-positive',
    input: { text: 'wow these look amazing, can we get them all?', consecutiveSameIntent: 0 },
    expect: (o) => o.sentiment === 'positive',
  },
  {
    name: 'frustrated-negative',
    input: { text: "this isn't what I asked for. I said NO dairy.", consecutiveSameIntent: 2 },
    expect: (o) => o.sentiment === 'negative' || o.recommendedAction === 'escalate',
  },
  {
    name: 'confused-repeating',
    input: {
      text: 'wait what does spicy mean here',
      consecutiveSameIntent: 1,
    },
    expect: (o) => o.sentiment === 'confused' || o.recommendedAction === 'rephrase',
  },
  {
    name: 'neutral-factual',
    input: { text: 'what time do you close?', consecutiveSameIntent: 0 },
    expect: (o) => o.sentiment === 'neutral' && o.recommendedAction === 'continue',
  },
];
