export interface EvalCaseResult {
  name: string;
  passed: boolean;
  reason?: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  errorMessage?: string;
}

export interface AgentEvalResult {
  agent: string;
  model: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  totalLatencyMs: number;
  totalCostUsd: number;
  cases: EvalCaseResult[];
}

export interface RunSummary {
  startedAt: Date;
  finishedAt: Date;
  totalDurationMs: number;
  totalCostUsd: number;
  overallPassRate: number;
  perAgent: AgentEvalResult[];
}
