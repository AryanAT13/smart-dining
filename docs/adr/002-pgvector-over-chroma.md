# ADR-002: pgvector over Chroma / Pinecone

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Aryan

## Context

The Recommendation Agent does RAG over menu items (§6.4). Three vector store options:

1. **Pinecone** — managed, hosted, hybrid search, generous free tier
2. **Chroma** — embeddable Python/JS library or hosted service
3. **pgvector** — Postgres extension; vectors live next to the relational data

The menu has ~50 items, expanding to maybe a few hundred per restaurant. We're already running Postgres for orders, sessions, and menu metadata. Render's managed Postgres ships with pgvector enabled.

## Decision

**Use pgvector**, in the same Render Postgres instance as the application data.

The `menu_item_embeddings` table holds `(menu_item_id PK, embedding vector(1536))`, with an `ivfflat` index using cosine distance. Embeddings are computed at seed time and refreshed only on menu mutations.

## Rationale

- **One database to deploy, monitor, and back up.** No second SaaS dependency, no extra credential to rotate.
- **Joins for free.** RAG queries can filter by `available=true`, exclude allergens, exclude items already in the cart, and sort by `popular_score` — all in a single SQL statement. With Pinecone or Chroma we'd round-trip twice.
- **Cosine search on 50–500 items is sub-millisecond.** Pinecone's hosted infra is overkill at this scale and adds 50–100ms of network latency per query.
- **Embedded Chroma** ties us to the gateway's filesystem; doesn't survive a Render container restart cleanly without a volume.

## Consequences

- **Positive:** simplest possible vector pipeline; SQL-native filtering; one connection pool.
- **Negative:** pgvector's recall drops at very high dimensions or item counts (>100k). Not a real concern here.
- **Reversal cost:** Low. The Recommendation Agent's RAG step is wrapped in a `VectorStore` interface; swapping to Pinecone is a one-file change plus migrating the embeddings.

## Alternatives considered

- **Pinecone** — overkill for the data size; adds vendor.
- **Chroma (embedded)** — fragile under containerised deploy; offers nothing pgvector doesn't.
- **In-memory cosine search in Node** — fine for 50 items but loses the SQL filter ergonomics; rejected on principle.
