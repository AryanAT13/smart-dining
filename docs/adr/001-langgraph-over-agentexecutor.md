# ADR-001: Graph-shaped orchestrator over a raw AgentExecutor

- **Status:** Accepted (graph shape) — Superseded in implementation by [ADR-007](007-hand-rolled-dag-over-langgraph.md), which kept the graph topology but dropped the library
- **Date:** 2026-05-28
- **Deciders:** Aryan

## Context

The assignment requires eight specialised agents (greeter, multilingual NLU, recommendation, upsell, context memory, group coordinator, sentiment, order validation) with a documented orchestration flow. The natural LangChain idioms are:

1. **One mega-prompt** with all tools attached to a single AgentExecutor — pick-your-tool-yourself style.
2. **AgentExecutor per agent** with manual routing between them in application code.
3. **LangGraph** — a graph of typed nodes with an explicit state object passed between them, supporting cycles, parallel branches, and persistent checkpoints.

The spec (§6.1) explicitly calls for a Router–Orchestrator pattern with intent classification dispatching to specialists. That maps directly onto a graph, not a single executor.

## Decision

Adopt a **typed-state DAG** as the orchestration substrate — initially planned on LangGraph, but during Phase 2 implementation we kept the topology and dropped the library (see ADR-007 for the rationale). Each agent implements the shared `Agent<I, O>` contract. The graph defines:

- Always-on entry: `multilingualNLU → router`
- Conditional routing from `router` to one of `{greeter, recommendation, upsell, groupCoordinator, orderValidation, fallback}`
- Always-on exit: `contextMemory → formatter`
- Parallel side-branch: `sentiment` (fires concurrently, output influences next turn)

The decision in this ADR is about the *shape* — typed state, conditional routing, parallel branches, per-node tracing. ADR-007 covers the implementation choice within that shape.

## Rationale

- **Maps 1:1 to the spec's diagram in §3.2.** The README's architecture image is the graph; no translation overhead between docs and code.
- **State object is typed.** `OrchestratorState` (a Zod schema) holds the working memory, intent, language, and accumulated tool outputs. Each node reads and writes specific fields; no implicit prompt-stuffing.
- **Streaming hooks are first-class.** LangGraph emits node-enter / node-exit / tool-call events that we forward over SSE so the UI can narrate progress ("Searching menu… Picking your three…").
- **Parallel branches** (sentiment running concurrently with the main path) are a built-in, not a hack.
- **Trace UI** writes itself — the graph topology IS the trace timeline.

## Consequences

- **Positive:** clear separation of concerns; eval suite can target individual nodes; the system is reviewable by walking the graph definition top to bottom.
- **Negative:** LangGraph adds a dep and a learning surface. Some abstractions (channels, reducers) are heavier than we need at this scale.
- **Reversal cost:** Medium. Each agent is already a standalone class; replacing the graph with a hand-rolled router is a 1-day refactor that doesn't touch agent internals.

## Alternatives considered

- **Single AgentExecutor with all tools** — kills traceability and prompt size; specialist persona/temperature settings collapse into one config.
- **CrewAI** — Python-only; would force a polyglot deploy (see ADR-004).
- **Hand-rolled router** — what we'd do if LangGraph didn't exist; viable but loses the streaming + trace ergonomics for no real upside.
