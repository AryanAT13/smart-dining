# @smart-dining/web

Next.js 14 App Router PWA. Customer-facing UI.

## Status

This is a Phase-0 stub. Phase 1 fills in:

- `app/(public)/table/[tableId]/page.tsx` — landing
- `app/api/...` — route handlers (REST + SSE)
- `components/{menu,cart,chat,group,checkout,ui}` — UI primitives
- `lib/{stores,hooks,api,socket}` — client wiring
- PWA manifest + service worker
- shadcn/ui setup, Tailwind config

See [`docs/agent-design.md`](../../docs/agent-design.md) and [`docs/adr/`](../../docs/adr/) for the design context this app implements.
