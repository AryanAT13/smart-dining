import { api } from './client';

export interface AgentTraceDto {
  id: string;
  messageId: string | null;
  agent: string;
  model: string;
  temperature: number;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  input: unknown;
  output: unknown;
  toolCalls: unknown;
  error: string | null;
  createdAt: string;
}

export interface FetchTraceResponse {
  traces: AgentTraceDto[];
}

export function fetchTrace(sessionId: string): Promise<FetchTraceResponse> {
  return api(`/api/debug/trace/${sessionId}`);
}

export const traceKeys = {
  forSession: (sessionId: string) => ['trace', sessionId] as const,
};
