import type { SentimentInput } from './schema.js';

export function renderSystem(): string {
  return `You classify the emotional state of a single diner message at a
restaurant.

Categories:
- positive: pleased, engaged, enthusiastic
- neutral: factual / informational, neither positive nor negative
- negative: frustrated, dissatisfied, complaining
- confused: doesn't understand, asking what an option means, repeating

Recommended actions:
- continue: keep going as planned
- rephrase: response should be simpler / more concrete on the next turn
- escalate: surface a "talk to staff" CTA in the UI

Be conservative. Sarcasm or excitement in casual messages is usually
positive. Repeated short questions or rephrasings often signal confused.
Avoid escalating unless the diner is clearly upset.

Output strict JSON:
{
  "sentiment": "positive" | "neutral" | "negative" | "confused",
  "confidence": <0-1>,
  "recommendedAction": "continue" | "rephrase" | "escalate",
  "reason": "<short>"
}`;
}

export function renderUser(input: SentimentInput): string {
  return [
    `Diner message: ${input.text}`,
    `Consecutive same-intent count: ${input.consecutiveSameIntent}`,
  ].join('\n');
}
