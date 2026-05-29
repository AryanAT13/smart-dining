# Optional Dockerfile for parity with Render's auto-build.
# Render builds from source by default; this is here for local-prod testing
# (`docker build -t gateway -f apps/gateway/Dockerfile .` from repo root).

FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy workspace metadata first for cache hits
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/gateway/package.json ./apps/gateway/package.json

RUN pnpm install --frozen-lockfile

# Copy sources
COPY packages ./packages
COPY apps/gateway ./apps/gateway

# Generate Prisma client and build
RUN pnpm --filter @smart-dining/core prisma:generate
RUN pnpm --filter @smart-dining/shared build
RUN pnpm --filter @smart-dining/core build
RUN pnpm --filter @smart-dining/gateway build

# ---- Runtime image ----
FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/gateway ./apps/gateway

ENV NODE_ENV=production
EXPOSE 10000

CMD ["node", "apps/gateway/dist/index.js"]
