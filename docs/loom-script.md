# Loom Walkthrough Script

A 9–10 minute scripted demo aimed at evaluators. The goal isn't to walk every feature — it's to land four moments hard:

1. **Hinglish RAG** (proof the AI is grounded, not a hallucinator).
2. **Multi-user real-time** (proof the architecture is real, not a single-process toy).
3. **Upsell + group coordination** (proof multiple agents collaborate).
4. **`/debug/trace`** (proof the system is observable, not a black box).

Recording setup: two browser windows side-by-side, each at `1024×768` so they fit cleanly in 1080p. Use Loom's "screen + camera" mode if comfortable; the small face cam in the corner is more engaging than screen-only.

---

## 00:00 — Open (30s)

**Screen:** landing page at `/`.

> "This is Zaika, an AI-driven smart dining assistant. The diner scans a QR at their table and lands on a per-table session. Every interaction is powered by eight cooperating agents — recommendation, upsell, group coordination, multilingual NLU, and others — orchestrated through a typed DAG with full trace observability. Let me show you."

**Action:** click the **Open Table 1** button.

---

## 00:30 — Onboarding micro-step (45s)

**Screen:** `/table/T1`, the 2-step onboarding dialog is open.

> "First touchpoint: a micro-onboarding. The diner gives their name — this anchors cart attribution and the socket identity — then taps the vibe chips that match their mood."

**Action:**
1. Type "Priya" → Next.
2. Tap **Spicy** + **Filling**.
3. Tap **Dairy** in the allergens row.
4. Click **Let's order**.

> "Those preferences get persisted to the session immediately. Watch the 'Zara's picks for you' strip at the top — it just re-fetched with my preferences applied server-side."

**Highlight:** AI Pick strip cards update; point out that the reasons reference spicy + filling, no dairy.

---

## 01:15 — Hinglish chat with RAG (75s)

**Screen:** still `/table/T1`, the AI chat launcher (bottom-left) is visible.

> "Now the headline feature: real Hinglish ordering. Watch what happens when I type a sentence that mixes Hindi and English."

**Action:** tap **Ask Zara** → in the input, type:

```
thoda spicy chahiye lekin dairy se allergy hai, kuch suggest karo
```

**Watch for:** the agent-progress narration at the bottom of the chat ("Reading what you said…", "Searching the menu…", "Picking the best matches…"). These come from typed SSE frames emitted as each agent enters and exits.

> "The Multilingual NLU agent normalised that into structured intent. The Router classified it as RECOMMEND. The Recommendation agent ran a semantic search over the menu — that's pgvector with cosine distance — and got 8 candidates filtered by my allergens. Then GPT-4o picked the best 3 and gave me one-line reasons in Hinglish, because that's the language I used."

**Highlight:** the assistant message comes back in Hinglish. The suggestion cards are real menu items, no dairy. **None of those item IDs were invented — they all came from the candidate set.**

---

## 02:30 — Add from chat + post-add upsell (60s)

**Action:** tap the **+** on one of the suggestion cards (e.g. Chilli Chicken Bites).

> "Two things happen here. First, the cart drawer pops — that's a Zustand store reacting to a TanStack Query invalidation. Second, watch the chat in a moment — the Upsell agent is firing in the background."

**Wait 3–5 seconds.** A new assistant message arrives with a complement suggestion (Mint Chutney, Garlic Naan, etc.).

> "That came from the Upsell agent, triggered by the cart-event-published-to-Redis. It pulled the complement graph for that item, ran the LLM to phrase the message, and broadcast back to the table channel. Rate-limited to one upsell per 30 seconds so we don't spam the diner."

---

## 03:30 — Multi-user real-time (90s)

**Action:** open a second browser window (or incognito tab), navigate to the same `/table/T1`, onboard as "Rahul".

> "Same table, different diner. Watch the avatar row up top — Rahul just appeared in Priya's window too. That's a Socket.io event flowing from this gateway process on Render."

**Action:** in **Rahul's** window, add a different item (e.g. Paneer Tikka).

> "Window 1 — Priya's window — sees the new item appear in the cart drawer with the 'Added by Rahul' badge. The cart_items.version column means concurrent edits resolve cleanly via optimistic concurrency."

**Highlight:** both cart drawers stay in sync, the owner badges are correct.

---

## 05:00 — Group coordinator (45s)

**Action:** in either window, ask Zara:

```
we are 4 people, mix veg and non-veg
```

> "This is the Group Coordinator agent. The router caught the multi-person intent — 'we', 'four people', 'mix'. Two parallel semantic searches fired, one for veg candidates, one for non-veg. The agent returned slot-keyed suggestions: 2 veg, 2 non-veg, balanced for the table."

**Highlight:** the response cards arrive grouped — point out the veg block vs the non-veg block.

---

## 05:45 — Checkout (45s)

**Action:** open the cart drawer, click **Place Order**, fill in name + phone (`+919876543210`), Send OTP, enter `123456`, Verify.

> "Mock OTP for the demo; production swaps to Twilio Verify behind the same interface. Watch the order confirmation — the 'Welcome back, visit #1' chip only shows on return visits, which we'll skip for the recording."

**Highlight:** order confirmation, estimated wait time, cart clears in both windows.

---

## 06:30 — `/debug/trace` reveal (90s)

This is the seniority moment.

**Action:** in the table header, click the **Trace** button.

> "Every agent invocation in this session is persisted to an `agent_traces` table — agent name, model, latency, tokens in and out, USD cost, full input and output previews, every tool call with its args and result. This page renders all of that as a vertical timeline."

**Highlight, scrolling through:**
- The stats strip at the top (total runs, total cost, avg latency, total tokens).
- The agent badges — colour-coded per agent.
- Click one Recommendation card to expand: show the candidate set in `input`, the JSON output, the `search_menu` tool call with its args and similarity scores.
- The Upsell card from earlier — show the `trigger: 'post_add'` input and the chosen complement.

> "This is what separates an LLM demo from a production system. Every decision is inspectable. Every cost is metered. Every tool call is audited. In production we ship this off to LangSmith; the in-app view is for development and the demo."

---

## 08:00 — Architecture beat (45s)

**Action:** open the repo README in a new tab. Show the architecture diagram briefly.

> "Quick architecture beat: Next.js on Vercel for the UI and the SSE chat endpoint. A Socket.io gateway on Render handles persistent WebSocket connections. Both processes share a TypeScript core package — agents, tools, services, Prisma. Postgres with pgvector on Render, Redis on Render. Eight agents, one orchestrator, nine typed tools with per-agent ACLs. Three memory tiers — working, session, long-term. All decisions live in seven ADRs."

---

## 08:45 — Eval suite + close (60s)

**Action:** terminal — show `pnpm eval` output (pre-recorded if cost is a concern).

> "Every agent ships with golden cases — 8 for Multilingual NLU, 5 for the Router, 4 for Sentiment, and so on. `pnpm eval` runs them against the real OpenAI API and writes a Markdown report. CI catches regressions automatically — any agent below the threshold fails the build."

**Show:** the `docs/eval-results.md` table — per-agent pass rate, latency, cost.

> "That's Smart Dining — eight agents, real Hinglish RAG, real-time multi-user, observable from end to end. Repo's in the description. Thanks for watching."

---

## Total: ~9:30

### What I cut on purpose

- The Sentiment agent doesn't get its own beat — it runs in parallel and influences the next turn's tone, but it's not visually demonstrable in 10 minutes.
- The `/api/debug/trace/<sessionId>` JSON endpoint — the UI version is more interesting.
- The Twilio Verify provider — mock is faster to demo.
- The exact Prisma schema walk — covered in the README, irrelevant to a video.

### What to over-rehearse

- The Hinglish prompt. Mistype it once on camera and the demo loses 20 seconds of momentum.
- The two-window setup. Position both windows BEFORE you hit record. Use a `1024px` width on both so they fit side-by-side in a 1080p Loom frame.
- The trace expand-collapse. Pick ONE Recommendation card in advance and rehearse expanding it cleanly.
