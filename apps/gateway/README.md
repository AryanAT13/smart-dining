# @smart-dining/gateway

Socket.io WebSocket gateway. Runs as a Render Web Service (see `render.yaml`).

## Status

Phase-0 stub. Phase 1 will deliver:

- `src/index.ts` — bootstraps Socket.io, attaches Redis adapter, listens on `$PORT`
- `src/handlers/{session,cart,ai}.ts` — event handlers wired to `@smart-dining/core` services
- `src/middleware/{auth,rateLimit}.ts` — tableId verification and per-IP throttling
- `Dockerfile` — for local-parity production builds (Render builds from source by default but the Dockerfile is here in case we move to container-based deploys)

Why this is a separate app from `apps/web`: see [ADR-003](../../docs/adr/003-sse-and-ws-split.md).
