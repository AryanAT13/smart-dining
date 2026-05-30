'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { fetchTrace, traceKeys, type AgentTraceDto } from '@/lib/api/trace';
import { cn } from '@/lib/utils/cn';

import { AgentBadge } from './AgentBadge';
import { TraceCard } from './TraceCard';

const REFRESH_INTERVAL_MS = 5_000;

export function TraceTimeline({ sessionId }: { sessionId: string }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const query = useQuery({
    queryKey: traceKeys.forSession(sessionId),
    queryFn: () => fetchTrace(sessionId),
    refetchInterval: autoRefresh ? REFRESH_INTERVAL_MS : false,
    staleTime: 1_000,
  });

  const traces = query.data?.traces ?? [];

  const filtered = useMemo(() => {
    return filter ? traces.filter((t) => t.agent === filter) : traces;
  }, [traces, filter]);

  const stats = useMemo(() => computeStats(traces), [traces]);
  const agents = useMemo(
    () => Array.from(new Set(traces.map((t) => t.agent))),
    [traces],
  );

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive">
        <AlertCircle className="mx-auto mb-2 h-5 w-5" />
        Could not load traces. {query.error instanceof Error ? query.error.message : ''}
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No agent runs yet for this session. Send a chat message to Zara — traces will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-3 text-xs sm:grid-cols-4">
        <Stat label="Total runs" value={stats.totalRuns.toString()} />
        <Stat label="Total cost" value={`$${stats.totalCostUsd.toFixed(4)}`} />
        <Stat label="Avg latency" value={`${Math.round(stats.avgLatencyMs)} ms`} />
        <Stat label="Total tokens" value={`${stats.totalTokensIn}/${stats.totalTokensOut}`} />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs transition-colors',
            filter === null
              ? 'bg-foreground text-background'
              : 'bg-secondary text-secondary-foreground hover:bg-accent',
          )}
        >
          All ({traces.length})
        </button>
        {agents.map((a) => (
          <button key={a} type="button" onClick={() => setFilter(a)}>
            <span className={cn(filter === a && 'ring-2 ring-foreground')}>
              <AgentBadge name={a} />
            </span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')}
            />
            Refresh
          </Button>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-3 w-3 accent-primary"
            />
            Auto
          </label>
        </div>
      </div>

      {/* Timeline */}
      <ol className="space-y-2">
        {filtered.map((t) => (
          <li key={t.id}>
            <TraceCard trace={t} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function computeStats(traces: AgentTraceDto[]) {
  if (traces.length === 0) {
    return { totalRuns: 0, totalCostUsd: 0, avgLatencyMs: 0, totalTokensIn: 0, totalTokensOut: 0 };
  }
  let cost = 0;
  let latency = 0;
  let tokIn = 0;
  let tokOut = 0;
  for (const t of traces) {
    cost += t.costUsd;
    latency += t.latencyMs;
    tokIn += t.tokensIn;
    tokOut += t.tokensOut;
  }
  return {
    totalRuns: traces.length,
    totalCostUsd: cost,
    avgLatencyMs: latency / traces.length,
    totalTokensIn: tokIn,
    totalTokensOut: tokOut,
  };
}
