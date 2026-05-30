# ADR-007: Hand-rolled typed DAG over the LangGraph library

- **Status:** Accepted (supersedes the implementation choice in ADR-001; the *shape* in ADR-001 stands)
- **Date:** 2026-05-29
- **Deciders:** Aryan

## Context

ADR-001 committed to a graph-shaped orchestrator: typed state, conditional routing from the Router to specialists, a parallel Sentiment branch, per-node trace events. The library named in that ADR was `@langchain/langgraph`.

Phase 2 implementation began with LangGraph in `packages/core/package.json`. Within an afternoon two friction points became clear:

1. **Type ergonomics.** LangGraph's `Annotation.Root({...})` channels model state as a record of `LastValue` / `BinaryOperatorAggregate` reducers. Our `OrchestratorState` is a flat object that nodes mutate in obvious ways; threading it through channel reducers added a layer of indirection for zero behavioural gain at our scale.
2. **Streaming + tracing.** LangGraph emits its own event stream (`graph.streamEvents`) with a generic shape. Forwarding those to our typed SSE frames meant a translation layer for every event type. Hand-rolling the emitter lets the orchestrator emit exactly the frames the client expects (`agent:enter`, `tool:call`, `suggestion`, `cart:action`, …) with full type safety.

Our graph has 6 always-on nodes, one conditional fan-out at the router, and one parallel branch. That fits inside ~250 lines of TypeScript with explicit `if`/`switch` logic and is easier to read than the equivalent LangGraph definition.

## Decision

Implement the orchestrator as a **hand-rolled function** in `packages/core/src/orchestrator/graph.ts` that:

- Carries `OrchestratorState` as a plain typed object (defined in `state.ts`)
- Dispatches specialists via a `switch (state.intent)` block
- Runs Sentiment via `Promise.allSettled` alongside the main path
- Emits SSE frames through an `OrchestratorEmitter` (a typed `EventEmitter` subclass)
- Persists agent traces to Postgres after the run

LangGraph is removed from dependencies.

## Rationale

- **Type safety end to end.** `OrchestratorState` is a TypeScript type, not a Zod schema for runtime reducers. Renaming a field is a typecheck failure across all nodes — exactly what we want.
- **Smaller surface to teach.** A new engineer reads `graph.ts` top-down in two minutes. Equivalent LangGraph code requires understanding channels, reducers, `addNode`, `addConditionalEdges`, `compile()`, `stream`, `streamEvents` — not all of which appear in our 6-node graph.
- **SSE frames stay typed.** The emitter's helper methods (`emitAgentEnter`, `emitSuggestion`, `emitCartAction`) take exactly the args defined in `@smart-dining/shared/schemas/sse.ts`. No string-tagging.
- **Fewer dependencies.** One fewer package to track for security advisories. LangGraph also drags in a chunk of LangChain core we don't need for our single-LLM, function-calling use case.
- **Free re-traceability.** Our `agentTraces` array IS the trace; no need to consume LangGraph's `streamEvents` and translate.

## Consequences

- **Positive:**
  - The orchestrator is one file, one function, one switch. Reviewable in under five minutes.
  - SSE frame protocol is statically typed; client and server share the schema.
  - We can refactor freely (e.g. add a new specialist) by adding a case to the switch — no graph-builder boilerplate.
- **Negative:**
  - We lose LangGraph's built-in checkpointing if we ever want pause/resume across requests. Acceptable: our requests are short-lived (sub-3s) and we don't need cross-request continuation.
  - We lose any future LangGraph features (e.g. their visualization tooling). Our `/debug/trace` page renders the same information.
- **Reversal cost:** Low. The agent classes are unchanged. Re-introducing LangGraph means rewriting one file (`graph.ts`); the agents, tools, services, and frame protocol are all framework-agnostic.

## Alternatives considered

- **Keep LangGraph despite the friction** — perfectly valid; the framework is mature. Rejected because we'd be paying a complexity tax for capabilities (channels, checkpoints, custom reducers) we don't use.
- **Inngest / Temporal-style workflow engine** — overkill for a sub-3-second orchestrator. Worth revisiting if we ever add long-running multi-step agent loops.
- **Single mega-agent with function-calling** — already rejected in ADR-001 for prompt-size and traceability reasons.

## What did NOT change from ADR-001

- The graph **shape** (NLU → router → specialist → memory, with parallel sentiment) is unchanged.
- The `Agent<I, O>` contract is unchanged.
- The tool registry, prompt structure, and JSON-repair loop are unchanged.
- The streaming protocol seen by the client is unchanged.

ADR-001 captures the architectural decision; ADR-007 captures the implementation choice within that architecture.
