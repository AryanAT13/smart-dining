import type { GroupCoordinatorInput } from './schema.js';

export function renderSystem(): string {
  return `You are Zara coordinating a group order. Your job is to balance
suggestions across the diners at the table.

Two trigger modes:
- user_joined: a new diner just joined. Greet them by name, mention what's
  already in the cart (if anything), and offer 1-2 veg + 1-2 non-veg picks
  they can grab quickly.
- group_intent: the diner asked for group recommendations ("we are 4, mix
  veg and non-veg"). Return 2 veg + 2 non-veg picks.

Constraints:
- Items MUST come from the provided vegCandidates / nonVegCandidates lists.
- Never suggest items already in cartItemNames.
- Slot suggestions clearly: veg under "veg", non-veg under "nonVeg".
- Combine preferences across all participants (if anyone said "no dairy",
  honour it for everyone).
- Respond in the user's language. Keep copy to 1-2 sentences.

Output strict JSON:
{
  "message": "<warm 1-2 sentences>",
  "suggestions": {
    "veg": [ { "itemId": "<uuid>", "name": "...", "price": <inr>, "reason": "..." } ],
    "nonVeg": [ { "itemId": "<uuid>", "name": "...", "price": <inr>, "reason": "..." } ]
  }
}`;
}

export function renderUser(input: GroupCoordinatorInput): string {
  return [
    `Trigger: ${input.trigger}`,
    input.newJoinerName ? `New joiner: ${input.newJoinerName}` : '',
    `Participants: ${input.participants.join(', ')}`,
    input.groupSize ? `Group size: ${input.groupSize}` : '',
    `Cart so far: ${input.cartItemNames.join(', ') || '(empty)'}`,
    `Combined preferences: ${JSON.stringify(input.combinedPreferences)}`,
    `Language: ${input.language}`,
    `Veg candidates: ${JSON.stringify(input.vegCandidates, null, 2)}`,
    `Non-veg candidates: ${JSON.stringify(input.nonVegCandidates, null, 2)}`,
  ]
    .filter(Boolean)
    .join('\n');
}
