-- =============================================================================
-- pgvector ivfflat index for menu_item_embeddings.
--
-- Why this is a raw SQL migration: Prisma's `@@index` syntax cannot yet
-- express the `vector_cosine_ops` operator class or the `lists` parameter
-- that ivfflat requires. We could use HNSW (also supported by pgvector) but
-- ivfflat is faster for our scale and benefits from `lists ≈ sqrt(rows)`.
--
-- For ~50 menu items, lists=8 is fine; we'd lift this to ~30 at a few
-- hundred items. The index is rebuilt only on `REINDEX` — adding new items
-- updates it incrementally.
--
-- Cosine distance is the right metric for OpenAI's normalized embeddings;
-- text-embedding-3-small outputs unit-norm vectors so cosine and inner
-- product are equivalent, but cosine reads more naturally in queries.
-- =============================================================================

CREATE INDEX IF NOT EXISTS menu_item_embeddings_embedding_idx
  ON menu_item_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 8);

-- Set the search probes default for this database. Higher = better recall,
-- more CPU. We use a DO block because ALTER DATABASE needs a literal name
-- and current_database() is a function call, not an identifier.
-- Per-query overrides via `SET LOCAL ivfflat.probes = N` inside a transaction.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET ivfflat.probes = 4', current_database());
END
$$;
