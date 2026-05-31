# Smart Dining Assistant

![Smart Dining QR Code](./QR.png)

> Multi-agent AI orchestration over a real-time group ordering platform for restaurants.
> AI is the primary interaction layer — not a chatbot widget bolted onto a CRUD app.

[**Demo Video**](https://drive.google.com/file/d/1coOUvco5PemfuPt4_Xrz9LFL3z5h4lNt/view?usp=sharing)


**👉 [SUBMISSION.md](SUBMISSION.md) — single-page evaluator overview with rubric mapping**

---

## What this is

A diner scans a QR at the table, lands on `/table/T1`, and is greeted by **Zara** — an LLM persona backed by eight cooperating agents (greeter, recommendation, upsell, context memory, group coordinator, sentiment, multilingual NLU, order validation). Natural language drives the order in English, Hinglish, or Telugu-English. Multiple people at the same table share a live cart with per-item ownership badges. Checkout takes name + phone, OTP-verifies, and pushes a kitchen notification over WebSocket.

The system is built to demonstrate engineering judgment at every layer — typed agent contracts, schema-validated tool calls, RAG-grounded recommendations, deterministic agent evaluation suites, three-tier memory, and observable traces of every agent invocation.

## Architecture at a glance

See [`docs/architecture.mmd`](docs/architecture.mmd) for the full diagram. Two-process backend, shared TypeScript core:

```
[Next.js 14 PWA on Vercel] ──HTTPS──► [Next Route Handlers + SSE]
                          ──WSS──────► [Socket.io Gateway on Render]
                                              │
                       both consume ──────────┴───────► packages/core (agents, tools, services)
                                                              │
                                  ┌─────────────┬─────────────┴───────────┐
                                  ▼             ▼                         ▼
                         Render Postgres   Render Key-Value     OpenAI / Twilio / R2
                         (+ pgvector)      (Redis pub/sub)      (LLM / OTP / images)
```

## Decision log

Read these before touching the code — they explain why the shape is what it is.

- [ADR-001](docs/adr/001-langgraph-over-agentexecutor.md) — Graph-shaped orchestrator over a raw AgentExecutor
- [ADR-002](docs/adr/002-pgvector-over-chroma.md) — pgvector over Chroma/Pinecone
- [ADR-003](docs/adr/003-sse-and-ws-split.md) — SSE for AI, WebSocket for cart
- [ADR-004](docs/adr/004-typescript-only-no-python.md) — TypeScript everywhere, no Python microservice
- [ADR-005](docs/adr/005-render-deployment.md) — Render for backend infrastructure
- [ADR-006](docs/adr/006-three-tier-memory.md) — Working / Session / Long-term memory tiers
- [ADR-007](docs/adr/007-hand-rolled-dag-over-langgraph.md) — Hand-rolled typed DAG over the LangGraph library
- [ADR-008](docs/adr/008-ui-overhaul-and-spec-gaps.md) — UI overhaul + spec-coverage gaps (Phase 5)

## Agent design + prompts

- [`docs/agent-design.md`](docs/agent-design.md) — what each of the eight agents does, what tools it has, what its prompts look like, and what its eval cases test.
- [`docs/prompt-examples.md`](docs/prompt-examples.md) — five end-to-end traces: Hinglish RAG, Telugu-English light snack, group order with mixed prefs, post-add upsell, multi-turn preference learning.
- [`docs/loom-script.md`](docs/loom-script.md) — scene-by-scene 9-minute demo plan.

## Deploy

- [`docs/deploy.md`](docs/deploy.md) — Vercel (web) + Render (gateway + DB + Redis) + Cloudflare R2 (menu images). 30–45 minutes start to finish. Includes smoke tests, rollback steps, and common failure modes.

## Local development

**Prerequisites:** Node 20+, pnpm 9+, Docker, OpenAI API key (free tier is fine).

```bash
# 1. Clone and install
git clone <repo> && cd smart-dining
pnpm install

# 2. Boot local Postgres + Redis
pnpm infra:up

# 3. Configure environment
cp .env.example .env
# At minimum: set OPENAI_API_KEY to a real key (the seed embeds menu items).
# Everything else has working defaults.

# 4. Generate Prisma client, migrate, seed
pnpm db:generate
pnpm db:migrate            # creates the schema + applies pgvector index
pnpm db:seed               # loads 41 menu items, complement graph, embeddings

# 5. Run web + gateway together
pnpm dev
# Web on :3000, gateway on :4000
# Open http://localhost:3000/table/T1
```

### Manual verify — full ordering flow with AI

1. Open `http://localhost:3000/table/T1` in two browser windows. Set different display names ("Priya" and "Rahul") when prompted.
2. **Chat**: tap "Ask Zara". Try `thoda spicy chahiye, dairy se allergy hai` — Zara replies in Hinglish with 1-3 candidates from the actual menu, never anything outside it.
3. **Quick intents**: tap the "Spicy" or "Bestsellers" chip — Zara streams a response live (you see the agent-progress narration "Searching the menu…", "Picking the best matches…").
4. **Add from chat**: tap the "+" on a suggestion card — the cart drawer pops with the new item; window 2 sees it within ~200ms with an "Added by Priya" badge.
5. **Upsell**: a moment after the add, an assistant message arrives in chat suggesting a complement (e.g. Mint Chutney after Chilli Chicken Bites). This is the Upsell Agent firing on the `cart:item_added` event.
6. **Group**: from window 2, ask `we are 4 people, mix veg and non-veg` — the Group Coordinator Agent splits suggestions into veg / non-veg slots.
7. **Checkout**: tap "Place Order" → name → phone (`+919876543210`) → OTP `123456` → confirmation. Both windows see the cart clear.

The whole agent trace for each turn is persisted to `agent_traces` and visible at `/api/debug/trace/<sessionId>` (demo mode only).

## Scripts

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `pnpm dev`               | All apps in dev mode (turbo --parallel)                |
| `pnpm build`             | Build all apps                                         |
| `pnpm lint`              | ESLint across the workspace                            |
| `pnpm typecheck`         | `tsc --noEmit` everywhere                              |
| `pnpm test`              | Unit + integration suites (vitest)                     |
| `pnpm eval`              | AI eval suite — golden cases per agent, prints pass-rate |
| `pnpm db:migrate`        | Run Prisma migrations (dev)                            |
| `pnpm db:migrate:deploy` | Run Prisma migrations (CI/prod)                        |
| `pnpm db:seed`           | Populate menu + embeddings                             |
| `pnpm db:studio`         | Open Prisma Studio                                     |
| `pnpm infra:up`          | Start docker-compose (Postgres, Redis)                 |
| `pnpm infra:down`        | Stop docker-compose                                    |
| `pnpm icons:generate`    | Render PWA icons from the SVG source                   |
| `pnpm menu:upload-images`| Upload local menu images to R2, optionally re-sync DB  |
| `pnpm --filter @smart-dining/web test:e2e` | Playwright smoke (needs dev servers running) |

## Deployment

- **Vercel** — Next.js app. `apps/web` as project root. Env vars per `.env.example`.
- **Render** — `render.yaml` is a Blueprint that provisions gateway + Postgres + Key-Value.
- **Cloudflare R2** — bucket for menu images, set via R2_* env vars.

See [ADR-005](docs/adr/005-render-deployment.md) for the rationale and **[docs/deploy.md](docs/deploy.md)** for the step-by-step runbook (Vercel + Render + R2 + Twilio + LangSmith).

## Repository layout

```
smart-dining/
├── apps/
│   ├── web/          Next.js 14 App Router PWA, SSE streaming, Zustand + TanStack Query
│   └── gateway/      Socket.io server with Redis adapter — runs on Render
├── packages/
│   ├── core/         Agents (8), orchestrator (typed DAG), tools (9 w/ ACL), services (6), Prisma
│   └── shared/       Types-only package: event schemas, intents, DTOs (zero runtime deps)
├── docs/
│   ├── adr/          Architecture Decision Records
│   ├── architecture.mmd
│   └── agent-design.md
├── scripts/          DB init SQL, one-off operational scripts
├── render.yaml       Render Blueprint
├── docker-compose.dev.yml
└── turbo.json
```

## Status

This README is alive — sections fill in as phases land. Current phase: **1 (end-to-end skeleton complete)**.

| Phase | Scope                                                        | Status |
| ----- | ------------------------------------------------------------ | ------ |
| 0     | Monorepo, configs, schema, ADRs, deploy manifests            | done   |
| 1     | End-to-end skeleton: menu, cart, WS sync, OTP, order         | done   |
| 2     | AI core: 8 agents, orchestrator, RAG, SSE streaming, upsell  | done   |
| 3     | /debug/trace UI, eval harness, long-term memory, AI Pick, e2e | done   |
| 4     | Deploy runbook, Loom script, prompt examples, submission docs | done   |
| 5     | UI overhaul: chat text, stepper, 6 upsells, tracking, dock   | done   |

## AI surface (Phase 2)

Eight agents, one orchestrator:

| Agent              | Role                                                  | Model       | Inputs |
| ------------------ | ----------------------------------------------------- | ----------- | ------ |
| multilingualNLU    | Normalise raw input → structured intent/prefs/lang    | gpt-4o-mini | text |
| router             | Classify into one of 10 intents                       | gpt-4o-mini | gloss + session signals |
| greeter            | First-message welcome + quick-tap chips               | gpt-4o-mini | displayName + tod |
| recommendation     | RAG over `menu_item_embeddings` → 1-3 picks           | gpt-4o      | gloss + candidates |
| upsell             | Triggered by `cart:item_added` events, not user msgs  | gpt-4o-mini | trigger + complements |
| contextMemory      | Persists merged prefs; rolling summary every 10 turns | deterministic + gpt-4o-mini for summary | session state |
| groupCoordinator   | Veg / non-veg balance for multi-person intents        | gpt-4o      | participants + dual candidate sets |
| sentiment          | Parallel background classifier; drives tone hints     | gpt-4o-mini | text |
| orderValidation    | Pre-checkout stock + totals (deterministic)           | deterministic + gpt-4o-mini for rejection phrasing | session |

Each agent ships `index.ts` + `prompt.ts` + `schema.ts` + `golden.ts` under `packages/core/src/agents/<name>/`. See [`docs/agent-design.md`](docs/agent-design.md).

### Tool registry

The orchestrator calls into 9 typed tools (search_menu, get_cart, add_to_cart, …) through `packages/core/src/tools/registry.ts`. Each tool declares an allowlist of agents that may invoke it, and `sessionId`/`tableId` come from the orchestrator context — never from LLM-produced arguments. This is the prompt-injection firewall.

### Trace observability

Every agent invocation writes an `agent_traces` row with input/output previews, tool calls, latency, tokens, and cost. In demo mode, the trace timeline is rendered at:

- **`/debug/trace/<sessionId>`** — vertical timeline UI with filter chips, auto-refresh, expandable agent cards (input / output / tool calls), and a stats strip (total runs, total cost, avg latency, total tokens).
- **`GET /api/debug/trace/<sessionId>`** — raw JSON for the same data.

Both are gated by `NEXT_PUBLIC_DEMO_MODE=true` and return 404 in production.

## Eval suite

```bash
pnpm eval
```

Iterates every agent's golden cases, runs them against the live OpenAI API, scores against per-case predicates, and writes [`docs/eval-results.md`](docs/eval-results.md) with a per-agent pass-rate table plus per-case detail (latency, tokens, cost). Exits non-zero if any agent drops below `EVAL_THRESHOLD` (default 0.8). CI runs this on every push to `main` and on PRs labelled `run-eval`.

If `OPENAI_API_KEY` is unset or a placeholder, the suite exits 0 with a "not configured" notice so feature branches without the secret don't fail CI.

## End-to-end test

```bash
pnpm dev                                            # in one terminal
pnpm --filter @smart-dining/web test:e2e            # in another
```

One Playwright spec (`tests/e2e/order-flow.spec.ts`) walks the full demo path: QR → onboarding → add → checkout → mock OTP → order confirmation. CI runs this against a seeded Postgres + Redis on every push and on PRs labelled `run-e2e`.

## Long-term memory (Tier 3)

On checkout, the customer's phone is HMAC-hashed and persisted to the `users` table along with the session's accumulated preferences (merged, not overwritten). On a return visit, the order confirmation surfaces a "Welcome back — visit #N" chip. Plaintext phones live only in the `orders.customer_phone` column (the PII boundary documented in [ADR-006](docs/adr/006-three-tier-memory.md)); the LLM never sees them.
