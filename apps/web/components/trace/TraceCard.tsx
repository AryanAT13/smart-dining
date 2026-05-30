'use client';

import { ChevronDown, Wrench } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils/cn';
import type { AgentTraceDto } from '@/lib/api/trace';

import { AgentBadge } from './AgentBadge';
import { JsonInspector } from './JsonInspector';

interface ToolCallShape {
  tool: string;
  durationMs: number;
  ok: boolean;
  argsPreview: Record<string, unknown>;
  resultPreview: unknown;
  errorMessage?: string;
}

export function TraceCard({ trace }: { trace: AgentTraceDto }) {
  const [expanded, setExpanded] = useState(false);
  const toolCalls = Array.isArray(trace.toolCalls)
    ? (trace.toolCalls as ToolCallShape[])
    : [];

  return (
    <article
      className={cn(
        'rounded-lg border bg-card shadow-sm transition-colors',
        trace.error && 'border-destructive/40',
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <AgentBadge name={trace.agent} />
        <code className="text-xs text-muted-foreground">{trace.model}</code>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span title="Latency">{trace.latencyMs}ms</span>
          <span title="Tokens in/out">
            {trace.tokensIn}/{trace.tokensOut}
          </span>
          <span title="USD cost">${trace.costUsd.toFixed(4)}</span>
          {toolCalls.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground"
              title={`${toolCalls.length} tool call${toolCalls.length === 1 ? '' : 's'}`}
            >
              <Wrench className="h-3 w-3" />
              {toolCalls.length}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t bg-background/40 px-3 py-3 text-xs">
          {trace.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
              <p className="font-semibold">Error</p>
              <p className="font-mono text-[10.5px]">{trace.error}</p>
            </div>
          )}

          <section>
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Input
            </h3>
            <JsonInspector value={trace.input} />
          </section>

          <section>
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Output
            </h3>
            <JsonInspector value={trace.output} />
          </section>

          {toolCalls.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tool calls
              </h3>
              {toolCalls.map((tc, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-md border bg-card px-2 py-1.5',
                    !tc.ok && 'border-destructive/40 bg-destructive/5',
                  )}
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <code className="font-semibold">{tc.tool}</code>
                    <span className="text-muted-foreground tabular-nums">{tc.durationMs}ms</span>
                    <span className={cn('text-[10px]', tc.ok ? 'text-emerald-600' : 'text-destructive')}>
                      {tc.ok ? '✓' : '✗'}
                    </span>
                    {tc.errorMessage && (
                      <span className="truncate text-destructive">{tc.errorMessage}</span>
                    )}
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                      args / result
                    </summary>
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
                      <JsonInspector value={tc.argsPreview} />
                      <JsonInspector value={tc.resultPreview} />
                    </div>
                  </details>
                </div>
              ))}
            </section>
          )}

          <p className="text-[10px] text-muted-foreground">
            {new Date(trace.createdAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </article>
  );
}
