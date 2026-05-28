-- Bootstrap extensions required by the schema.
-- Prisma `extensions = [pgvector]` will idempotently re-create on migrate,
-- but having them at initdb time keeps cold starts predictable.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
