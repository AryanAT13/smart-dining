# ADR-005: Render for backend infrastructure

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Aryan

## Context

The assignment doc names Render or Railway as the target backend host (§14.1). Vercel is the recommended frontend host. We have two persistent backend dependencies (Postgres, Redis) and one persistent service (the Socket.io gateway). The natural placements are:

- **Vercel** — Next.js app and its API routes (SSE-friendly, serverless)
- **Render** — gateway + Postgres + Redis (persistent sockets, managed DB, managed KV)

Render offers all three in one dashboard, including pgvector on its managed Postgres and a Redis-compatible Key-Value service.

## Decision

**Render for all backend infrastructure.** A single `render.yaml` Blueprint at the repo root provisions:

- `gateway` — Web Service (Node.js, region oregon), root dir `apps/gateway`
- `dining-db` — Postgres 16 with pgvector
- `dining-cache` — Key-Value (Redis-compatible) with `allkeys-lru` eviction

Vercel hosts the Next.js app and consumes the same `DATABASE_URL` / `REDIS_URL` as the gateway via project envs configured separately (not via the Blueprint — Vercel project envs don't live in Render's manifest).

Cloudflare R2 holds menu images. R2 is the only external dependency beyond OpenAI, Twilio, and LangSmith — Render doesn't offer object storage and the spec specifically calls for S3-compatible storage with free egress (§14.1).

## Rationale

- **One vendor for everything that persists.** Single billing surface, single status page, single SSO. Drastically reduces the operational story we have to explain in the README.
- **Render Postgres ships with pgvector.** No extension installation gymnastics, no upgrade fragility.
- **`render.yaml` is reproducible.** "Connect from GitHub" provisions the entire backend topology in one click. That's a demo moment, not just convenience.
- **Persistent sockets need a real VM.** Render's Web Service runtime keeps a Node process up indefinitely — exactly what Socket.io needs.
- **Render Key-Value works with the standard Redis protocol.** `ioredis` and the Socket.io Redis adapter both work unchanged.

## Consequences

- **Positive:** simplest possible production topology; reproducible from `render.yaml`; backups, metrics, and rotation are managed.
- **Negative:** Render's starter plans cold-start after long idle periods. Acceptable for an assignment; in real production we'd move to standard plans.
- **Reversal cost:** Low for the gateway (Node container is portable to Fly, Railway, Heroku). Higher for Postgres if data has grown (migration with `pg_dump`).

## Alternatives considered

- **Railway** — also valid per the spec. Render won on the strength of its Postgres pgvector support and the explicit Blueprint manifest format. Either would work.
- **Fly.io** — initially proposed for the gateway. Rejected at user direction; documented here for completeness. Fly's socket support is arguably stronger but vendor consolidation wins.
- **Supabase for DB + Upstash for Redis** — splits across three vendors (Vercel, Supabase, Upstash, Render). More cognitive overhead with no payoff.
