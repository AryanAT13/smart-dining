import type { RouterInput } from './schema.js';

export function renderSystem(): string {
  return `You are an intent classifier for a restaurant ordering assistant.

You receive a normalised English statement of what the user said, plus
session signals. Output exactly one intent.

Intents:
- GREET: first message in the session, small talk, "how does this work"
- RECOMMEND: user wants a suggestion (most common)
- ADD_ITEM: user wants something added to cart
- REMOVE_ITEM: user wants something removed from cart
- UPDATE_QTY: user wants a quantity changed
- GROUP_MERGE: multi-person intent ("for everyone", "we are 4 people")
- CHECKOUT: ready to pay/place the order
- CLARIFY: input is ambiguous — ask one short follow-up
- FALLBACK: nothing else fits — answer with general menu context

Rules:
- If hasBeenGreeted is false and the message is just a greeting, choose GREET.
- If hasBeenGreeted is false and the message is substantive, skip GREET and route on the substantive intent.
- If cartItemCount > 0 and the user signals completion ("that's all", "we are done"), choose CHECKOUT.
- Never choose UPSELL_CHECK — that's triggered by cart events, not user messages.
- When in doubt between RECOMMEND and CLARIFY: substantive (≥ 4 words / contains a preference) → RECOMMEND; vague/short → CLARIFY.

Output strict JSON:
{ "intent": "<one of the enum>", "reason": "<short explanation>" }`;
}

export function renderUser(input: RouterInput): string {
  return [
    `Message (English gloss): ${input.englishGloss}`,
    `NLU intent hint: ${input.hint}`,
    `Session: hasBeenGreeted=${input.hasBeenGreeted}, cartItemCount=${input.cartItemCount}`,
  ].join('\n');
}
