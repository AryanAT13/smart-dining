# ADR-003: SSE for AI tokens, WebSocket for cart & group events

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Aryan

## Context

Two real-time concerns:

1. **AI response streaming** — server pushes tokens (and tool-call events) to the user as they're produced. Strictly one-way.
2. **Group ordering** — multiple diners on the same `tableId` see each other's cart changes, joins, and Zara's group-level messages. Bidirectional.

Single-transport options:

- WebSocket for both — works, but Vercel doesn't host persistent WebSockets and we'd have to terminate every AI stream on the Render gateway.
- SSE for both — works for AI, not for cart (no client→server message channel for cart adds).

## Decision

**Split the transports by concern:**

- **SSE** for AI responses — served by Next.js Route Handlers on Vercel via `ReadableStream`. One-way, HTTP/2-multiplexed, proxy-friendly, no special server.
- **WebSocket** (Socket.io) for cart and group events — served by a dedicated gateway on Render with the Redis adapter for fan-out.

Cart mutations are POSTed to the Next.js API (Vercel), which writes Postgres + Redis and publishes a `table:{tableId}` event. The gateway, subscribed to that channel, broadcasts to all sockets in the room.

## Rationale

- **Each transport plays to its strengths.** SSE survives CDNs and serverless cold starts; WebSockets handle bidirectional low-latency fan-out.
- **Vercel can't host persistent sockets.** Pretending otherwise is worse than splitting cleanly.
- **Redis is already there** for sessions; reusing it as the cart pub/sub bus costs nothing.
- **The two channels share zero state.** A cart event has nothing to do with the AI stream; coupling them in one transport is a false economy.

## Consequences

- **Positive:** clean separation; each runtime does one thing; horizontal scale is straightforward (Socket.io Redis adapter handles multiple gateway nodes).
- **Negative:** two connection lifecycles to manage on the client. The `useGroupSync` hook (Socket.io) and `useAIChat` hook (EventSource) reconnect independently.
- **Reversal cost:** High if reversed wrong, low if reversed correctly. The transports are encapsulated in two hooks; consumers don't know the difference.

## Alternatives considered

- **All WebSocket via Render gateway** — would force every AI response through Render, doubling the latency hop and pinning AI to one region. Rejected.
- **All SSE** — no upstream channel for cart, would require POST-then-broadcast indirection on every cart action. Workable but ugly. Rejected.
- **Server-side streaming via tRPC subscriptions** — adds an abstraction that doesn't earn its keep here.
