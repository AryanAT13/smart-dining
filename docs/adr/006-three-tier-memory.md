# ADR-006: Three-tier memory (working / session / long-term)

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Aryan

## Context

The spec (§6.2) describes three tiers of memory: working memory (in-request), session memory (Redis, conversation summary + preferences + cart), and optional long-term memory (cross-session, phone-keyed). Naive implementations either:

- Re-fetch full conversation history on every turn and stuff it into the prompt (slow, expensive, blows context limits)
- Use a single LangChain `ConversationBufferMemory` for everything (no separation between volatile and durable state)

We need explicit tiers because each has a different access pattern, durability requirement, and privacy posture.

## Decision

Implement three discrete tiers with separate APIs:

### Tier 1 — Working memory

In-request, in-memory only. Contains: the current user message, the last 5 exchanges, and the orchestrator's transient state object. Injected into every agent prompt. Discarded when the request completes.

### Tier 2 — Session memory

Redis-backed under key `session:{sessionId}`. TTL = 4 hours or until order placement. Contains:

- `preferences` — JSON of accumulated user prefs (`{spicy: true, dairy: false, group_size: 4}`)
- `language` — last detected language for tone-matching
- `conversation_summary` — running paragraph compressed by the Context Memory Agent every 10 turns
- `cart_snapshot` — denormalised cart used by the Upsell Agent to avoid a DB round trip
- `last_upsell_at` — unix ms timestamp for upsell rate-limiting

Postgres holds a write-through copy of `preferences` and `conversation_summary` on the `sessions` row for durability.

### Tier 3 — Long-term memory

Postgres `users` table, keyed by `phone_hash` (HMAC-SHA256 of E.164 phone with `PII_HASH_SECRET`). Populated at checkout when a user provides their phone. Contains an accumulated `preferences` JSON merged across sessions.

On the *next* visit, the Order Validation Agent (which sees the phone) emits a `user_recognised` event that the orchestrator uses to pre-seed session-tier preferences. Phone numbers themselves are never stored unhashed; only the hash and the merged preferences live in the table.

## Rationale

- **Three access patterns, three stores.** Working memory wants sub-millisecond access from any agent — that's an in-memory object. Session memory wants TTL and pub/sub — that's Redis. Long-term memory wants durable indexed lookup — that's Postgres.
- **Privacy boundary lines up with the tiers.** Phone numbers exist only in Postgres, hashed. The LLM prompts only ever see anonymised preferences.
- **Summarisation is cheap and necessary.** Without rolling summaries, the Recommendation Agent's prompt grows linearly with the conversation. A gpt-4o-mini summary call every 10 turns keeps prompt size bounded.
- **Long-term is opt-in by design.** A diner who never gives a phone gets a clean ephemeral session. The Order Validation Agent is the only place phones flow.

## Consequences

- **Positive:** clear cost model (each tier's expense is predictable); strong privacy story; testable in isolation (each tier is its own service module).
- **Negative:** three places to look for "where's that preference coming from?". Mitigated by `get_session_context` always returning the merged view, tagged by source tier.
- **Reversal cost:** Low. Tiers are behind interfaces; collapsing two of them is a refactor inside `packages/core/src/memory/`.

## Alternatives considered

- **Single LangChain ConversationSummaryBufferMemory** — opaque, hard to test, mixes durable and ephemeral state.
- **All in Postgres** — kills the sub-millisecond working memory case; adds load.
- **All in Redis** — loses durability for cross-session memory.
