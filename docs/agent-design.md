# Agent Design

The system has eight agents, each implementing the same `Agent<I, O>` contract
defined in `packages/core/src/agents/_base/agent.ts`. Every agent is a folder
under `packages/core/src/agents/<name>/` containing:

- `index.ts` — agent class extending `BaseAgent`
- `prompt.ts` — system prompt template (ROLE → CONTEXT → TASK → FORMAT → CONSTRAINTS)
- `schema.ts` — Zod schemas for input and structured output
- `golden.ts` — golden test cases consumed by `pnpm eval`

The orchestrator (LangGraph) routes every user message through them in a
documented sequence. See [`docs/adr/001-langgraph-over-agentexecutor.md`](adr/001-langgraph-over-agentexecutor.md).

---

## 1. Multilingual NLU Agent

**Role:** Pre-step on every user message. Detects language (English / Hinglish / Telugu-English) and normalises the raw text into structured intent + preferences. Nothing else runs until this completes.

**Model:** gpt-4o-mini · **Temp:** 0.2 · **Max tokens:** 200
**Tools:** none — pure normalisation
**Output:**

```ts
{ intent: IntentEnum, preferences: Partial<UserPreferences>, language_detected: 'en'|'hinglish'|'telugu-english', raw_text: string }
```

**Why it's separate:** keeps the router prompt small and language-agnostic; all downstream agents see clean structured intent rather than mixed-language strings.

---

## 2. Router (orchestrator entry, not a "named" agent)

**Role:** Classifies the normalised intent into one of: `GREET`, `RECOMMEND`, `ADD_ITEM`, `REMOVE_ITEM`, `UPSELL_CHECK`, `GROUP_MERGE`, `CHECKOUT`, `FALLBACK`. Pure JSON-mode classification.

**Model:** gpt-4o-mini · **Temp:** 0.0 · **Max tokens:** 50
**Tools:** none
**Why a router, not a mega-prompt:** keeps specialist prompts small (under 1k tokens), drops p95 latency, and makes the trace UI navigable.

---

## 3. Greeter Agent

**Role:** Fires once per session — the first message. Two-question micro-onboarding ("what's the vibe today?" / "any allergies?"), stores answers in session preferences, and hands off.

**Model:** gpt-4o-mini · **Temp:** 0.7 · **Max tokens:** 150
**Tools:** `update_preference`
**Persona:** Warm, witty, brief. No "I am an AI" disclaimers.

---

## 4. Recommendation Agent (the workhorse)

**Role:** RAG-grounded menu recommendation. Embeds the query, runs cosine search over `menu_item_embeddings`, injects top-10 candidates into the prompt, returns 3 picks with one-line reasons. Strict JSON output validated against schema.

**Model:** gpt-4o · **Temp:** 0.7 · **Max tokens:** 400
**Tools:** `search_menu`, `get_cart`, `get_popular_items`, `update_preference`
**Hard rule:** every returned `itemId` MUST appear in the retrieved candidate set. Output validator enforces; one repair retry; final fallback to top-3 by `popular_score`.

---

## 5. Upsell Agent

**Role:** Fires on `cart:item_added` events (not on user messages). Selects the right trigger from the six in §5.4 of the spec — pairings, threshold nudges, missing course, veg/non-veg balance, time-of-day specials, "that's all" save attempts.

**Model:** gpt-4o-mini · **Temp:** 0.7 · **Max tokens:** 200
**Tools:** `get_cart`, `get_complementary`, `get_popular_items`
**Constraint:** never suggest items already in cart; never fire more than once per 30 seconds per session (rate-limited at the orchestrator).

---

## 6. Context Memory Agent

**Role:** Reads and writes session state. Runs at the end of every turn to update the rolling preferences and conversation summary. After every 10 turns it compresses the oldest 5 turns into a one-paragraph summary so prompts stay bounded.

**Model:** gpt-4o-mini · **Temp:** 0.3 · **Max tokens:** 250
**Tools:** `get_session_context`, `update_preference`
**Storage:** Redis `session:{id}` hash (per [ADR-006](adr/006-three-tier-memory.md)).

---

## 7. Group Coordinator Agent

**Role:** Triggered on `session:user_joined` and on multi-person intents ("we are 4 people, mix veg and non-veg"). Detects conflicting preferences across diners, suggests shareable items, greets new joiners with cart context.

**Model:** gpt-4o · **Temp:** 0.6 · **Max tokens:** 350
**Tools:** `get_cart`, `get_session_context`, `search_menu`
**Output:** keyed to `addedBy` slots so the UI can attribute suggestions per diner.

---

## 8. Sentiment & Feedback Agent

**Role:** Background pass on every user message. Detects frustration, confusion, or disengagement signals. When triggered, the orchestrator can re-route to a simpler/calmer phrasing path or surface a human-handoff CTA.

**Model:** gpt-4o-mini · **Temp:** 0.2 · **Max tokens:** 100
**Tools:** none
**Output:** `{ sentiment: 'positive'|'neutral'|'negative'|'confused', confidence: number, recommendedAction: 'continue'|'rephrase'|'escalate' }`
**Non-blocking:** runs in parallel with the main response path; its output influences the *next* turn, not the current one (except for escalate, which bumps a UI flag immediately).

---

## 9. Order Validation Agent

**Role:** Final pre-checkout gate. Re-fetches every cart item, validates stock, applies business rules (min order, time-window items, combos), computes GST, returns either a clean order DTO or a structured rejection.

**Model:** gpt-4o · **Temp:** 0.0 · **Max tokens:** 300
**Tools:** `get_cart`, `validate_stock`
**Output:** `{ ok: true, order: OrderDTO } | { ok: false, issues: ValidationIssue[] }`. Note: this agent's "LLM call" is actually optional — the validation is deterministic; the LLM is used only to phrase rejection messages back to the user in the right tone/language.

---

## Tool registry

All agent–service calls flow through `packages/core/src/tools/_registry.ts`. Each tool:

- has a Zod-typed input and output schema
- declares which agent(s) may invoke it
- emits a structured trace entry on every call
- pulls `sessionId`/`tableId` from the orchestrator's `AgentContext`, never from the LLM's arguments

This is what kills the entire prompt-injection-to-data-leak class of bugs: even if an agent is jailbroken, it cannot supply its own sessionId.

| Tool                    | Used by                                          |
| ----------------------- | ------------------------------------------------ |
| `search_menu`           | recommendation, groupCoordinator                 |
| `get_cart`              | recommendation, upsell, groupCoordinator, orderValidation |
| `add_to_cart`           | orchestrator (after ADD_ITEM intent confirmed)   |
| `remove_from_cart`      | orchestrator (after REMOVE_ITEM intent)          |
| `get_popular_items`     | recommendation, upsell                           |
| `get_complementary`     | upsell                                           |
| `get_session_context`   | contextMemory, groupCoordinator                  |
| `update_preference`     | greeter, contextMemory                           |
| `validate_stock`        | orderValidation                                  |
| `send_otp`              | orchestrator (CHECKOUT intent)                   |
| `create_order`          | orchestrator (after OTP verify + orderValidation pass) |

---

## Evaluation

Every agent ships with `golden.ts` — input/expected-output pairs. `pnpm eval` runs all of them against the real API and produces a pass/fail table in `docs/eval-results.md`. A regression in any agent fails CI.
