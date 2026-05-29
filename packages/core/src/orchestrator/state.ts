/**
 * Orchestrator state — the typed object that flows through the graph.
 *
 * Each node reads specific fields and writes specific fields. By the end of
 * a run, `assistantText`, `suggestions`, and `cartActions` are populated for
 * the UI; `agentTraces` is persisted to Postgres.
 */

import type {
  AgentName,
  Intent,
  Language,
  ServerEvent,
} from '@smart-dining/shared';
import type { UserPreferences } from '@smart-dining/shared';

import type { ToolTraceEntry } from '../tools/context.js';

export interface AgentTraceRecord {
  agent: AgentName;
  model: string;
  temperature: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  costUsd: number;
  /** Bounded preview of input/output for the trace panel. */
  inputPreview: unknown;
  outputPreview: unknown;
  error?: string;
  toolCalls: ToolTraceEntry[];
  createdAt: number;
}

export interface OrchestratorInput {
  sessionId: string;
  tableId: string;
  displayName: string;
  /** The raw user message. */
  text: string;
  /** Persisted user-message row id. */
  userMessageId: string;
}

export interface OrchestratorState {
  // Static inputs (set once at the start).
  input: OrchestratorInput;

  // NLU stage output.
  language: Language | null;
  englishGloss: string | null;
  preferencesPatch: UserPreferences;
  intentHint: Intent | null;
  mentionsCart: boolean;

  // Router output.
  intent: Intent | null;
  routerReason: string | null;

  // Specialist agent output — at most one populated per turn.
  assistantText: string;
  suggestions: Array<{
    itemId: string;
    name: string;
    price: number;
    reason: string;
    imageUrl?: string;
  }>;
  /** Cart actions the orchestrator should perform after the response. */
  cartActions: Array<
    | { kind: 'add'; menuItemId: string; quantity: number; specialInstructions?: string }
    | { kind: 'remove'; cartItemId: string }
    | { kind: 'update_qty'; cartItemId: string; quantity: number; expectedVersion: number }
  >;

  // Memory tier writes.
  mergedPreferences: UserPreferences | null;
  newSummary: string | null;

  // Sentiment (parallel branch).
  sentiment: {
    sentiment: 'positive' | 'neutral' | 'negative' | 'confused';
    recommendedAction: 'continue' | 'rephrase' | 'escalate';
  } | null;

  // Observability.
  agentTraces: AgentTraceRecord[];
  /** Events to publish to the table channel after the run. */
  publishEvents: ServerEvent[];

  // Aggregate metrics.
  totalLatencyMs: number;
  totalCostUsd: number;
  startedAt: number;
}

export function initialState(input: OrchestratorInput): OrchestratorState {
  return {
    input,
    language: null,
    englishGloss: null,
    preferencesPatch: {},
    intentHint: null,
    mentionsCart: false,
    intent: null,
    routerReason: null,
    assistantText: '',
    suggestions: [],
    cartActions: [],
    mergedPreferences: null,
    newSummary: null,
    sentiment: null,
    agentTraces: [],
    publishEvents: [],
    totalLatencyMs: 0,
    totalCostUsd: 0,
    startedAt: Date.now(),
  };
}
