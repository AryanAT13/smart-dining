# Deployment Runbook

End-to-end deploy of Smart Dining onto Vercel (web) + Render (gateway + Postgres + Redis) + Cloudflare R2 (images). 30–45 minutes start to finish.

> Architectural rationale lives in [ADR-005](adr/005-render-deployment.md). This runbook is the operational sequence.

---

## 0. Prerequisites

- GitHub repo with this codebase pushed to a branch Vercel + Render can read.
- Accounts: **Vercel**, **Render**, **Cloudflare** (free tiers are sufficient), **OpenAI** (real key, $5+ balance).
- Optional: **LangSmith** (free tier, for the trace UI in production), **Twilio Verify** (for production OTP — dev uses the mock provider).
- A 32+ character secret you can paste into `JWT_SECRET` and `PII_HASH_SECRET` (Render can generate these).

---

## 1. Render — backend (15 min)

The `render.yaml` Blueprint at the repo root provisions everything in one click.

1. Render dashboard → **New +** → **Blueprint**.
2. Connect the GitHub repo and select the `main` branch.
3. Render reads `render.yaml` and previews three resources:
   - `dining-db` (Postgres 16 with pgvector)
   - `dining-cache` (Key-Value / Redis)
   - `gateway` (Node Web Service)
4. Click **Apply**. Postgres + Key-Value take ~2 min to provision; the gateway build takes ~3 min on first deploy.
5. While provisioning, fill the `sync: false` env vars on the gateway service:

   | Variable | Where to get it |
   | --- | --- |
   | `OPENAI_API_KEY` | platform.openai.com → API keys |
   | `LANGCHAIN_API_KEY` | smith.langchain.com → settings → API keys (skip for now if not using) |
   | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID` | twilio.com → Verify service (skip if dev) |
   | `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | filled in step 3 below |
   | `R2_PUBLIC_URL` | filled in step 3 below |
   | `GATEWAY_CORS_ORIGIN` | filled in step 2 below |

6. `JWT_SECRET` and `PII_HASH_SECRET` use `generateValue: true` in the Blueprint — Render auto-fills these.

### Post-deploy DB migration

The gateway's build step doesn't run migrations. Run them manually once:

```bash
# Render dashboard → dining-db → Connect → External database URL
export DATABASE_URL="<postgres external url>"
export DIRECT_DATABASE_URL="<postgres external url>"
pnpm db:generate
pnpm db:migrate:deploy            # applies init + pgvector_index migrations
pnpm db:seed                      # loads menu + embeddings
```

> **pgvector check:** if `db:migrate:deploy` errors with `CREATE EXTENSION vector` denied, open a Render shell on `dining-db` and run `CREATE EXTENSION IF NOT EXISTS vector;` as the superuser, then re-run the migration.

Note the gateway's public URL — `https://<service-name>.onrender.com`. You'll need it for `NEXT_PUBLIC_GATEWAY_URL` on Vercel.

---

## 2. Vercel — web (10 min)

1. Vercel dashboard → **Add New…** → **Project** → import the same GitHub repo.
2. Configure:
   - **Root Directory:** `apps/web`
   - **Framework Preset:** Next.js (auto-detected)
   - **Build Command:** `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @smart-dining/core prisma:generate && pnpm --filter @smart-dining/shared build && pnpm --filter @smart-dining/core build && pnpm --filter @smart-dining/web build` — this builds the workspace siblings before the Next app.
   - **Output Directory:** `.next` (default)
   - **Install Command:** override empty (handled by the build command's `pnpm install`)
3. Environment variables (Production + Preview):

   ```
   NODE_ENV=production
   NEXT_PUBLIC_DEMO_MODE=false                 # critical — gates /debug/trace
   NEXT_PUBLIC_APP_URL=https://<vercel-domain>.vercel.app
   NEXT_PUBLIC_GATEWAY_URL=https://<gateway>.onrender.com
   DATABASE_URL=<Render Postgres external URL>
   DIRECT_DATABASE_URL=<same>
   REDIS_URL=<Render Key-Value external URL>
   OPENAI_API_KEY=<same as gateway>
   EMBEDDING_MODEL=text-embedding-3-small
   LLM_MODEL_FAST=gpt-4o-mini
   LLM_MODEL_DEEP=gpt-4o
   SESSION_LLM_BUDGET_USD=1.50
   LANGCHAIN_TRACING_V2=true                   # optional
   LANGCHAIN_API_KEY=<same as gateway>         # optional
   LANGCHAIN_PROJECT=smart-dining-prod
   OTP_PROVIDER=twilio                         # or `mock` if you really want
   TWILIO_ACCOUNT_SID=<...>
   TWILIO_AUTH_TOKEN=<...>
   TWILIO_VERIFY_SERVICE_SID=<...>
   JWT_SECRET=<same as Render gateway — must match for token verify>
   PII_HASH_SECRET=<same as Render gateway — must match for phone hash join>
   GATEWAY_CORS_ORIGIN=https://<vercel-domain>.vercel.app
   GATEWAY_PORT=10000
   R2_BUCKET=smart-dining-menu
   R2_PUBLIC_URL=https://menu.<your-domain>.com   # or the r2.dev URL
   RESTAURANT_NAME=Zaika
   ASSISTANT_NAME=Zara
   RESTAURANT_TIMEZONE=Asia/Kolkata
   RATE_LIMIT_GLOBAL_PER_MIN=60
   RATE_LIMIT_AI_PER_MIN=20
   ```

4. Deploy. The first build takes ~3 minutes (workspace deps + Prisma generate).

5. Back to Render → `gateway` service → set `GATEWAY_CORS_ORIGIN` to the Vercel URL. **Manual Deploy** the gateway to pick up the change.

> **Critical:** `JWT_SECRET` and `PII_HASH_SECRET` must be **identical** between Vercel and Render. Phone-hash long-term memory only works if both surfaces hash the same way; OTP tokens only work if both surfaces sign the same way.

---

## 3. Cloudflare R2 — menu images (5 min)

1. Cloudflare dashboard → **R2** → **Create bucket** → name it `smart-dining-menu`.
2. **R2 → Manage R2 API Tokens** → create a scoped token with `Object Read & Write` on this bucket. Copy `Access Key ID` and `Secret Access Key`.
3. Bucket → **Settings** → **Public access** → either:
   - Enable the `*.r2.dev` public URL (fast path), OR
   - Connect a custom domain (`menu.<your-domain>.com`).
4. Paste the credentials and the public base URL into both Vercel + Render envs as `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`.
5. Drop source images into `packages/core/prisma/data/menu-images/<slug>.{jpg,webp}` on a local checkout, then:

   ```bash
   pnpm menu:upload-images --sync-db --dry-run    # preview
   pnpm menu:upload-images --sync-db              # for real
   ```

   The script transcodes to WebP, caps at 1024px wide and 100 KB, uploads to R2, and rewrites `menu_items.image_url` so the UI picks up the new assets.

---

## 4. Twilio Verify (production only — skip in dev)

1. twilio.com → **Verify** → **Create new service** named `smart-dining-otp`.
2. Note the Service SID.
3. Paste `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` into Vercel + Render envs.
4. Set `OTP_PROVIDER=twilio` (only on Vercel — the gateway doesn't issue OTPs).
5. Redeploy web.

Dev/preview can keep `OTP_PROVIDER=mock` and use code `123456`. The env schema in `packages/core/src/config/env.ts` refuses to construct the mock provider when `NODE_ENV=production`, so production safety is enforced at construction time.

---

## 5. Smoke test (5 min)

After both surfaces are live:

```bash
# 1. Web healthcheck
curl https://<vercel-domain>.vercel.app/api/healthz
# → { "ok": true, "service": "web", ... }

# 2. Gateway healthcheck
curl https://<gateway>.onrender.com/healthz
# → { "ok": true, "service": "gateway", ... }

# 3. Menu loads
curl https://<vercel-domain>.vercel.app/api/menu | jq '.data.items | length'
# → 41 (or however many items you seeded)

# 4. Open in a browser
open https://<vercel-domain>.vercel.app/table/T1
# Onboard, add an item, watch the cart drawer pop, place an order
```

Two-window real-time test: open `/table/T1` in two browsers with different display names. Add an item from window 1. Window 2's cart drawer should show the item with the correct owner badge within ~300 ms.

---

## 6. Run the eval suite against production data

```bash
pnpm eval                 # uses the live OPENAI_API_KEY from .env
```

Writes `docs/eval-results.md`. Commit it so the README's status table reflects the latest pass rate. Cost is ~$0.05 per full run.

---

## 7. Rollback

- **Web:** Vercel → Deployments → click an earlier deployment → **Promote to Production**.
- **Gateway:** Render → `gateway` → Deploys → click an earlier deploy → **Rollback**.
- **DB:** Render → `dining-db` → Backups → Restore (Postgres backups are nightly on the starter plan).
- **R2:** versioning isn't enabled by default; re-run `menu:upload-images` from a previous git ref to restore the manifest.

---

## 8. Monitoring after launch

The Phase 4 scope doesn't include external monitoring. The minimum-viable next step is:

- **Vercel Analytics** (one click in dashboard) — page-load + Web Vitals.
- **Render Logs** — already on by default; the structured pino logs filter cleanly.
- **OpenAI usage dashboard** — track per-day spend; the per-session budget cap (`SESSION_LLM_BUDGET_USD`) is the runtime guardrail.
- **LangSmith** — agent traces, errors, eval drift. The trace UI at `/debug/trace/<sessionId>` is demo-mode-only; LangSmith is the production equivalent.

---

## Common failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `/api/menu` returns 500 with `Invalid environment configuration` | A required env var is missing on Vercel | Recheck the list in step 2; redeploy after correcting |
| Chat hangs forever, no tokens appear | `OPENAI_API_KEY` invalid OR `SESSION_LLM_BUDGET_USD` exceeded | Check Vercel function logs; reset the per-session counter via Redis `DEL budget:<sessionId>` |
| Cart events don't sync across windows | `GATEWAY_CORS_ORIGIN` mismatch with Vercel domain | Update on Render and redeploy the gateway |
| OTP modal shows error 502 | `OTP_PROVIDER=twilio` but Twilio creds missing/wrong | Verify the Service SID — it must start with `VA` |
| Order placement succeeds but no "Welcome back" chip | `JWT_SECRET` / `PII_HASH_SECRET` differ between Vercel and Render | Make them identical, redeploy both, place a new order |
| `/debug/trace` page returns 404 in production | `NEXT_PUBLIC_DEMO_MODE` is not `true` | That's deliberate. Set to `true` only for the demo deploy; the env schema refuses to start if NODE_ENV=production AND demo=true (you'd have to lift that guard manually for a public demo) |
