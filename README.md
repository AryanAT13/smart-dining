# Smart Dining Assistant

> Multi-agent AI orchestration over a real-time group ordering platform for restaurants.
> AI is the primary interaction layer — not a chatbot widget bolted onto a CRUD app.

**Live demo:** _populated after Phase 4 deploy_
**Walkthrough video:** _populated after Phase 4 deploy_

---

## What this is

A diner scans a QR at the table, lands on `/table/T12`, and is greeted by **Zara** — an LLM persona backed by eight cooperating agents (greeter, recommendation, upsell, context memory, group coordinator, sentiment, multilingual NLU, order validation). Natural language drives the order in English, Hinglish, or Telugu-English. Multiple people at the same table share a live cart with per-item ownership badges. Checkout takes name + phone, OTP-verifies, and pushes a kitchen notification over WebSocket.

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

- [ADR-001](docs/adr/001-langgraph-over-agentexecutor.md) — LangGraph over a raw AgentExecutor
- [ADR-002](docs/adr/002-pgvector-over-chroma.md) — pgvector over Chroma/Pinecone
- [ADR-003](docs/adr/003-sse-and-ws-split.md) — SSE for AI, WebSocket for cart
- [ADR-004](docs/adr/004-typescript-only-no-python.md) — TypeScript everywhere, no Python microservice
- [ADR-005](docs/adr/005-render-deployment.md) — Render for backend infrastructure
- [ADR-006](docs/adr/006-three-tier-memory.md) — Working / Session / Long-term memory tiers

## Agent design

[`docs/agent-design.md`](docs/agent-design.md) — what each of the eight agents does, what tools it has, what its prompts look like, and what its eval cases test.

## Local development

**Prerequisites:** Node 20+, pnpm 9+, Docker.

```bash
# 1. Clone and install
git clone <repo> && cd smart-dining
pnpm install

# 2. Boot local Postgres + Redis
pnpm infra:up

# 3. Configure environment
cp .env.example .env
# Fill OPENAI_API_KEY at minimum. Everything else has working defaults.

# 4. Migrate and seed
pnpm db:migrate
pnpm db:seed          # menu items + embeddings + sample popular_score

# 5. Run web + gateway together
pnpm dev
# Web on :3000, gateway on :4000
# Open http://localhost:3000/table/T1
```

## Scripts

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `pnpm dev`          | All apps in dev mode (turbo --parallel)                   |
| `pnpm build`        | Build all apps                                            |
| `pnpm lint`         | ESLint across the workspace                               |
| `pnpm typecheck`    | `tsc --noEmit` everywhere                                 |
| `pnpm test`         | Unit + integration suites                                 |
| `pnpm eval`         | AI eval suite — golden cases per agent, prints pass-rate  |
| `pnpm db:migrate`   | Run Prisma migrations                                     |
| `pnpm db:seed`      | Populate menu + embeddings                                |
| `pnpm db:studio`    | Open Prisma Studio                                        |
| `pnpm infra:up`     | Start docker-compose (Postgres, Redis)                    |
| `pnpm infra:down`   | Stop docker-compose                                       |

## Deployment

- **Vercel** — Next.js app. `apps/web` as project root. Env vars per `.env.example`.
- **Render** — `render.yaml` is a Blueprint that provisions gateway + Postgres + Key-Value.
- **Cloudflare R2** — bucket for menu images, set via R2_* env vars.

See [ADR-005](docs/adr/005-render-deployment.md) for the rationale and the deploy runbook.

## Repository layout

```
smart-dining/
├── apps/
│   ├── web/          Next.js 14 App Router PWA, SSE streaming, Zustand + TanStack Query
│   └── gateway/      Socket.io server with Redis adapter — runs on Render
├── packages/
│   ├── core/         Agents, orchestrator (LangGraph), tools, services, Prisma client
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

This README is alive — sections fill in as phases land. Current phase: **0 (foundations)**.

| Phase | Scope                                                        | Status      |
| ----- | ------------------------------------------------------------ | ----------- |
| 0     | Monorepo, configs, schema, ADRs, deploy manifests            | in progress |
| 1     | End-to-end skeleton: menu, cart, WS sync, OTP, order         | pending     |
| 2     | AI core: 8 agents, LangGraph orchestrator, RAG, SSE          | pending     |
| 3     | Polish, group features, sentiment, long-term memory          | pending     |
| 4     | Eval suite, observability dashboard, deploy, submission docs | pending     |
