# ADR-008: UI overhaul + spec-coverage gaps (Phase 5)

- **Status:** Accepted
- **Date:** 2026-06-02
- **Deciders:** Aryan

## Context

Phase 4 closed with a clean architecture and a working AI core, but a manual end-to-end test surfaced nine concrete UI/UX gaps. The most damaging:

1. **Chat text was never rendered.** `state.assistantText` was set after the specialist agent ran but the orchestrator never emitted token frames for it. The client saw only `suggestion` and `done` frames — so the chat bubble was empty even though the trace clearly logged the LLM's reply.
2. **Only one of six upsell triggers wired.** Only `post_add` fired; `threshold_below`, `missing_beverage`, `veg_only_balance`, `evening_special`, and `thats_all` were defined in the agent's schema but had no driver.
3. **The Order Validation Agent was decorative.** `OrderService.place` ran its own inline stock check inside the transaction and never invoked the agent that was built for exactly this job.
4. **The two floating buttons (Ask Zara, Cart) drifted out of alignment.** Each was independently `fixed`, so their sizes diverged with content and they looked sloppy.
5. **Onboarding only asked for a name.** Spec §11 Flow 1 requires a "what's the vibe today?" step with two CTAs (Just browsing / Tell me what's good) and chips.
6. **Cards had no quantity stepper.** Tap "Add" twice and you'd see no visible change — the cart drawer showed `× 2` but the menu card itself didn't update.

This ADR captures the resolution so future readers know what changed and why.

## Decision

**Six structural fixes, one cohesive aesthetic pass.**

### 1. Chat text rendering

Add a `streamAssistantText` step in the orchestrator that chunks `state.assistantText` into ~12-char word-boundary tokens and emits them as SSE `token` frames after the specialist returns. Synthesises a "Zara is typing" feel without forcing the agents to actually stream JSON (they can't — `chatJson` is non-streaming by design for schema safety). On the client, `attachSuggestions` no longer flips `isStreaming: false` — that decision belongs to the `done` frame alone, so the cursor keeps blinking while text and suggestions both arrive.

### 2. All six upsell triggers (`evaluateAndFireUpsell`)

Replace the single-purpose `triggerPostAddUpsell` with a priority-ordered evaluator (`packages/core/src/orchestrator/upsell.ts`):

| Priority | Trigger | When it fires |
|---|---|---|
| 1 | `thats_all` | Router intent = CHECKOUT (user explicitly said "place it") |
| 2 | `threshold_below` | Cart subtotal in `[380, 499]` AND a complement exists that would push past ₹500 |
| 3 | `missing_beverage` | Cart has mains, no beverage |
| 4 | `veg_only_balance` | Cart is all-veg AND `nonVegOk` is true |
| 5 | `evening_special` | Evening window AND no dessert in cart |
| 6 | `post_add` | Fallback: complement for the most recently added item |

One rate-limit window per session (30s) prevents stacking. `thats_all` bypasses the rate limit because it's user-initiated. The agent's `shouldFire` field remains the final veto.

### 3. Order Validation wired into the real path

`OrderService.place` now calls `orderValidationAgent.invoke({ sessionId, language })` BEFORE the Prisma transaction. On `ok: false`, throws the appropriate `DomainError` (StockUnavailableError for stock issues, ValidationError otherwise). The CheckoutModal grew a `'failed'` step that renders the structured message with retry/back CTAs — no more dead-end spinner.

### 4. FloatingDock — one component, two perfectly-aligned buttons

A new `FloatingDock` component owns both bottom buttons in a single fixed flex container. Same height, same shadow, same elevation, perfectly equidistant from screen edges. AIChat and CartDrawer lost their own launchers — they're sheet-only now. The dock has an "unread" gold dot on the Ask Zara button when the most recent message is from the assistant (typically an upsell that arrived while chat was closed).

### 5. Two-step onboarding aligned with spec §11 Flow 1

Step 1 unchanged (name). Step 2 grew:
- Two top-level CTAs: **Just browsing** (skip prefs, close) and **Tell me what's good** (persist any picked chips, auto-open chat for a recommendation).
- Below that, the full chip set: Spicy / Light / Sweet / Filling / Surprise me + optional allergen row.
- A bottom **Let's order** button for the "I want chips but not chat" path.

"Surprise me" is exclusive — picking it deselects everything else and persists no preferences. Allergen chips are independent.

### 6. CartStepper — Add → [- N +] on every card

A single reusable `CartStepper` component drops into `MenuCard`, `MessageBubble` suggestion cards, and `AIPickStrip` cards. Reads the cart via TanStack Query; when the line for this menu item exists with quantity > 0, swaps the "+ Add" button for a `[- N +]` stepper in the same footprint. The minus button removes the line when quantity would hit zero. Compact mode for chat cards.

### 7. Aesthetic — 60:30:10 palette + animated background

Palette enforced in `globals.css`:

- **60% — cream linen** (`hsl(38 38% 96%)`) — every background, every card
- **30% — terracotta** (`hsl(14 64% 46%)`) — primary CTAs, brand voice
- **10% — saffron gold** (`hsl(40 88% 60%)`) — accent ribbons, AI badge, "now" markers

A pure-CSS `AestheticBackground` component layers three blurred orbs on long-period drift animations + a fine SVG noise texture. Body itself carries three radial gradients fixed in place. Combined effect: a warm, layered, slightly moving surface that reads as "high-end restaurant", not "static SaaS dashboard". Zero JS overhead — runs on the GPU compositor.

### 8. Order tracking page

New `/order/[id]` route with:

- 5-step vertical timeline (Pending → Confirmed → Preparing → Ready → Delivered) with the current step pulsing
- Item list + totals
- Live subscription to the same `table:{tableId}` socket channel; `order:status_changed` events invalidate the order query
- 15-second polling fallback so a dropped socket doesn't strand the user

The OrderConfirmation grew a **Track order** button linking to this page.

### 9. Group banner always visible + new-joiner flash

`GroupBanner` no longer hides when participantCount is zero — it synthesises a self-entry so the avatar row is never empty. When a new diner joins (detected by name diff, not just count), their avatar pulses for 1.5s with a saffron ring. Cart conflict toast upgraded from `info` to `warning` with an explicit description.

## What the diner actually sees that changed

| Before | After |
|---|---|
| Empty chat bubble above an item card | Assistant text streams in, then the card appears |
| `+ Add` button stays inert after click | `[- 1 +]` stepper swaps in immediately |
| Onboarding asks for name only | Two-step: name → vibe chips + CTAs + allergens |
| Cart and chat buttons sliding around | Perfectly-aligned floating dock |
| Only post-add upsell ever fires | All six trigger types active; one per 30s |
| Fake spinner during "Placing your order…" | Real `Zara is double-checking your order` with validation + failure state |
| Dead-end confirmation | "Track order" → live `/order/[id]` page with status timeline |
| Group banner hidden when alone | Always visible; new joiners pulse |

## Consequences

- **Positive:** Closes every gap between the agent backend and what the diner perceives. The trace UI now matches the chat UI matches the upsell behaviour.
- **Negative:** First-load JS grew from 189 KB to 193 KB for `/table/[id]`. Within budget, but worth tracking.
- **Reversal cost:** Low. CartStepper and FloatingDock are isolated components; reverting them is a `git revert` away. The orchestrator's streaming step is one helper function.

## Tech stack audit (per Phase 5 review)

The spec lists `LangChain.js` as the AI framework. ADR-007 documents why we removed it (channel/reducer abstractions added cost for no benefit at 6 graph nodes). Phase 5 didn't reverse that — the spec's "or" between LangChain.js and a Python service makes both genuinely optional, and the hand-rolled DAG remains the right call. Everything else in the spec's stack table is in place verbatim: Next.js 14 App Router, TailwindCSS + shadcn/ui, Zustand + TanStack Query, Socket.io, Node/Express-shaped gateway, Postgres + Prisma, Redis (Upstash-compatible via Render Key-Value), pgvector, GPT-4o / 4o-mini.

## Agent roster audit

All eight present, all reachable from the orchestrator dispatch:

| Agent | File | Wired into |
|---|---|---|
| Greeter | `agents/greeter/` | Router intent `GREET` |
| Recommendation | `agents/recommendation/` | Router intent `RECOMMEND` + `/api/session/:id/ai/picks` |
| Upsell | `agents/upsell/` | All 6 triggers via `evaluateAndFireUpsell` |
| Context Memory | `agents/contextMemory/` | Always (final orchestrator step) |
| Group Coordinator | `agents/groupCoordinator/` | Router intent `GROUP_MERGE` |
| Sentiment | `agents/sentiment/` | Parallel branch on every turn |
| Multilingual NLU | `agents/multilingualNLU/` | First step on every turn |
| Order Validation | `agents/orderValidation/` | `OrderService.place` pre-transaction gate |
