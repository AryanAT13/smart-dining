# ADR-004: TypeScript everywhere, no Python AI microservice

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Aryan

## Context

The assignment doc lists LangChain (Python) and CrewAI as valid orchestration choices, suggesting a Python microservice (FastAPI) for the AI layer (§14.1). That's a defensible pattern in many real systems — the Python ML ecosystem is richer, and an AI service often has different scaling characteristics than the application.

For *this* system, though, the AI work is LLM-API-bound (OpenAI), not local-model-bound. There's no PyTorch, no transformers, no custom embeddings training. Everything we need exists in TypeScript: LangChain.js, LangGraph, the OpenAI SDK, pgvector via Prisma.

## Decision

**TypeScript end to end.** Agents, orchestrator, tools, services, Prisma client, and Zod schemas all live in `packages/core` and are consumed by both `apps/web` (Next.js on Vercel) and `apps/gateway` (Socket.io on Render).

## Rationale

- **One language, one type system, one build.** A Hinglish phrase typed by a user travels from the React input through the SSE endpoint to the Multilingual NLU Agent without crossing a language boundary. Zero serialisation overhead, zero schema drift.
- **The eight agents share types with the API and the UI.** `IntentEnum`, `RecommendationOutput`, `OrchestratorState` — defined once in `packages/shared`, imported everywhere.
- **Deploy surface is smaller.** Two processes (web on Vercel, gateway on Render) instead of three. One Dockerfile instead of two. One CI matrix instead of two.
- **Streaming integrates natively.** Next.js Route Handlers + `ReadableStream` + the OpenAI SDK's `stream: true` produce a clean SSE pipeline without an IPC hop.
- **The Python ecosystem advantage doesn't apply.** There are no local models, no Pandas pipelines, no scientific computing. LangChain.js covers everything in the spec.

## Consequences

- **Positive:** smaller cognitive surface; faster iteration; type safety from input event to LLM tool call.
- **Negative:** if we later need a local embedding model, fine-tuning, or a non-OpenAI provider with Python-only SDK, we'll have to add a Python service. That's a clean addition (a third deploy target), not a rewrite.
- **Reversal cost:** Medium. Agent classes are pure functions over a state object; porting any single agent to a Python sidecar is a contained change.

## Alternatives considered

- **Python FastAPI service for agents** — adds polyglot deploy, IPC, second CI pipeline, schema duplication. Not worth it at this scope.
- **Edge runtime (Deno / Bun)** — interesting for cold-start latency on the SSE endpoint but conflicts with several Node-only deps (Prisma, ioredis). Revisit if it ever becomes a bottleneck.
