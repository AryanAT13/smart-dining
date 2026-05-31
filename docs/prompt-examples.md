# Prompt Examples

Five golden-path queries showing how a user message flows through the
agent graph end-to-end. Each example traces the actual pipeline — NLU →
Router → Specialist → Memory — with the inputs each agent sees and the
outputs each agent produces.

These are real cases from `packages/core/src/agents/*/golden.ts` (the
ones the `pnpm eval` harness runs), formatted for human reading.

---

## Example 1 — Hinglish + dairy allergy

**User says:** `thoda spicy chahiye, dairy se allergy hai`

### Stage 1 — Multilingual NLU agent (gpt-4o-mini, temp 0.2)

```jsonc
// Output
{
  "rawText": "thoda spicy chahiye, dairy se allergy hai",
  "language": "hinglish",
  "englishGloss": "I want something a bit spicy, and I am allergic to dairy.",
  "preferences": { "spicy": true, "excludeAllergens": ["dairy"] },
  "intentHint": "RECOMMEND",
  "mentionsCart": false
}
```

### Stage 2 — Router agent (gpt-4o-mini, temp 0.0)

```jsonc
// Input the router sees
{
  "englishGloss": "I want something a bit spicy, and I am allergic to dairy.",
  "hint": "RECOMMEND",
  "hasBeenGreeted": true,
  "cartItemCount": 0
}

// Output
{ "intent": "RECOMMEND", "reason": "Substantive preference statement" }
```

### Stage 3 — `search_menu` tool

```jsonc
// Args (constructed by the orchestrator)
{
  "query": "I want something a bit spicy, and I am allergic to dairy.",
  "topK": 8,
  "excludeAllergens": ["dairy"],
  "excludeInCart": true
}

// Result (truncated — 8 candidates pulled via pgvector)
{
  "matches": [
    { "itemId": "...", "name": "Chilli Chicken Bites",   "similarity": 0.83, "tags": ["non_veg","spicy"], "allergens": ["gluten","soy"] },
    { "itemId": "...", "name": "Crispy Corn",            "similarity": 0.79, "tags": ["veg","spicy"],     "allergens": ["gluten"] },
    { "itemId": "...", "name": "Chicken Chettinad",      "similarity": 0.78, "tags": ["non_veg","spicy"], "allergens": [] },
    // … 5 more, none containing "dairy"
  ]
}
```

### Stage 4 — Recommendation agent (gpt-4o, temp 0.7)

```jsonc
// Output — note language matches input, items come from candidate set
{
  "message": "Bilkul! Yeh spicy bhi hain aur dairy-free bhi.",
  "suggestions": [
    { "itemId": "...", "name": "Chicken Chettinad",   "price": 340, "reason": "South-style, dairy-free, properly fiery" },
    { "itemId": "...", "name": "Chilli Chicken Bites", "price": 220, "reason": "Indo-Chinese punch, no cream involved" },
    { "itemId": "...", "name": "Prawn Pepper Fry",     "price": 320, "reason": "Coastal pepper heat, coconut oil base" }
  ]
}
```

### Stage 5 — Context Memory agent

Merges `{ spicy: true, excludeAllergens: ["dairy"] }` into the session
preferences. Future turns honour the constraint without it being repeated.

**What this proves:**
- Hinglish round-trips cleanly through language detection and back.
- Allergens are enforced at the candidate level (pgvector SQL filter), not just hoped for in the prompt.
- The recommendation IDs are 100% drawn from the retrieved set — no hallucination is possible.

---

## Example 2 — Light snack hint via Telugu-English

**User says:** `konchem light untaru ledu, snack laaga`

### NLU output

```jsonc
{
  "rawText": "konchem light untaru ledu, snack laaga",
  "language": "telugu-english",
  "englishGloss": "Something a little light, like a snack.",
  "preferences": { "light": true },
  "intentHint": "RECOMMEND",
  "mentionsCart": false
}
```

### Recommendation candidate filter

The orchestrator sets `maxCaloriesKcal: 400` because `preferences.light === true`. The pgvector search now joins on `menu_items.calories_kcal ≤ 400`.

### Recommendation output

```jsonc
{
  "message": "Avunu, idi try chesi choodu — light and tasty.",
  "suggestions": [
    { "itemId": "...", "name": "Hara Bhara Kebab",     "price": 200, "reason": "Spinach-pea patties under 260 kcal" },
    { "itemId": "...", "name": "Tandoori Mushroom",    "price": 220, "reason": "Smoky, around 220 kcal" },
    { "itemId": "...", "name": "Crispy Corn",          "price": 180, "reason": "Light, crunchy, snack-perfect" }
  ]
}
```

**What this proves:**
- Telugu-English is a first-class language, not a fallback to English.
- A soft preference (`light`) translates to a hard SQL filter (`≤ 400 kcal`).
- Reasons are grounded in the actual calorie data from the menu, not invented.

---

## Example 3 — Group order with mixed preferences

**User says:** `we are 4 people, mix veg and non-veg`

### NLU output

```jsonc
{
  "rawText": "we are 4 people, mix veg and non-veg",
  "language": "en",
  "englishGloss": "We are four diners; we want a mix of veg and non-veg items.",
  "preferences": { "groupSize": 4, "nonVegOk": true },
  "intentHint": "GROUP_MERGE",
  "mentionsCart": false
}
```

### Router output

```jsonc
{ "intent": "GROUP_MERGE", "reason": "Multi-person mix intent" }
```

### Group Coordinator agent (gpt-4o, temp 0.6)

The orchestrator runs **two** parallel semantic searches — one with `requireTags: ['veg']`, one without — and hands both candidate sets to the agent.

```jsonc
// Output — both slots MUST be non-empty for group_intent
{
  "message": "Sounds good — 2 veg + 2 non-veg crowd-pleasers, perfect for four.",
  "suggestions": {
    "veg": [
      { "itemId": "...", "name": "Paneer Tikka",      "price": 240, "reason": "Charred edges, crowd favourite" },
      { "itemId": "...", "name": "Dal Makhani",       "price": 240, "reason": "Slow-cooked, shareable" }
    ],
    "nonVeg": [
      { "itemId": "...", "name": "Chicken Tikka",     "price": 280, "reason": "The classic starter for a group" },
      { "itemId": "...", "name": "Butter Chicken",    "price": 360, "reason": "Pairs with the dal + naan" }
    ]
  }
}
```

**What this proves:**
- The orchestrator's intent-based dispatch picks a *different* agent for a different shape of request — there's no "one mega-prompt".
- Both slots are filled because the prompt makes the constraint explicit and the user-side reminder reinforces it (see `agents/groupCoordinator/prompt.ts` for the contract).
- A 4-person group gets 4 suggestions, scaled to party size.

---

## Example 4 — Post-add upsell (event-driven, not user-driven)

**Triggered by:** the diner adding `Chilli Chicken Bites` to the cart.

The Upsell agent doesn't see a user message — it's kicked off by the `cart:item_added` Redis event with a 30-second per-session rate limit.

### `get_complementary` tool result

```jsonc
{
  "source": { "itemId": "m-023", "name": "Chilli Chicken Bites" },
  "suggestions": [
    { "itemId": "m-088", "name": "Mint Chutney", "price": 40,  "weight": 0.81 },
    { "itemId": "m-102", "name": "Garlic Naan",  "price": 75,  "weight": 0.78 }
  ]
}
```

### Upsell agent (gpt-4o-mini, temp 0.7)

```jsonc
{
  "shouldFire": true,
  "message": "Great pick! Most folks grab Mint Chutney with this — only ₹40 and it's worth it.",
  "suggestion": { "itemId": "m-088", "name": "Mint Chutney", "price": 40 }
}
```

The message is then published to `table:{tableId}` as an `ai:message`
event and persisted to the `messages` table. The chat UI picks it up and
renders an inline suggestion card.

**What this proves:**
- Some agents trigger on events, not user messages — the architecture
  is event-driven where it makes sense.
- Upsell never hallucinates products; the complement graph is curated
  and the agent picks from it.
- The rate limit (`sessionMemory.tryClaimUpsell`) is the difference
  between "thoughtful nudge" and "spam".

---

## Example 5 — Skip dessert preference learning

**Earlier turn — user said:** `skip dessert, just get us drinks`

### NLU output

```jsonc
{
  "language": "en",
  "englishGloss": "Skip dessert; recommend drinks instead.",
  "preferences": { "skipDessert": true },
  "intentHint": "RECOMMEND",
  "mentionsCart": true
}
```

### Recommendation pulls drinks

The orchestrator passes the gloss to `search_menu` with no category
filter; the recommendation agent biases toward beverages because the
gloss explicitly says "drinks".

```jsonc
// Recommendation output
{
  "message": "On it. Three crowd-pleasing drinks:",
  "suggestions": [
    { "itemId": "...", "name": "Mango Lassi",         "price": 140, "reason": "Sweet, thick, crowd favourite" },
    { "itemId": "...", "name": "Fresh Lime Soda",     "price": 90,  "reason": "Cuts through spicy food well" },
    { "itemId": "...", "name": "Masala Chai",         "price": 60,  "reason": "Classic post-meal pick" }
  ]
}
```

### Context Memory persists the preference

```jsonc
// Merged session preferences (written to Redis + Postgres)
{ "skipDessert": true, /* …prior prefs… */ }
```

### **The proof point — three turns later, user says** `what's good here`

The Recommendation agent's prompt receives the merged preferences,
including `skipDessert: true`. It never suggests desserts in the
follow-up, even though the user didn't repeat the constraint.

**What this proves:**
- Preferences merge, they don't overwrite — `mergePreferences` in
  `@smart-dining/shared` is the canonical operator.
- The session-tier Redis cache holds the hot copy; Postgres has the
  durable copy. Either source can repopulate the other.
- Three turns of memory is the difference between a chatbot and an
  assistant.

---

## How to reproduce any of these

```bash
# 1. Boot the stack
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm dev

# 2. Open the demo table
open http://localhost:3000/table/T1

# 3. Type the prompt verbatim

# 4. Open the trace tab (header button) to see the full agent timeline
```

The `agent_traces` table holds the full I/O of every LLM call. The
`/debug/trace/<sessionId>` UI renders it as a timeline. That's how you
go from "the AI said something" to "I can prove what every layer did".
