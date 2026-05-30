'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { useAddCartItem } from '@/lib/hooks/useCart';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/format';

interface Pick {
  itemId: string;
  name: string;
  price: number;
  reason: string;
  imageUrl?: string;
}

interface PicksResponse {
  picks: Pick[];
  cached: boolean;
}

function fetchPicks(sessionId: string): Promise<PicksResponse> {
  return api(`/api/session/${sessionId}/ai/picks`);
}

interface AIPickStripProps {
  sessionId: string | null;
}

export function AIPickStrip({ sessionId }: AIPickStripProps) {
  const add = useAddCartItem();
  const query = useQuery({
    queryKey: ['ai-picks', sessionId ?? 'none'],
    queryFn: () => {
      if (!sessionId) throw new Error('No session');
      return fetchPicks(sessionId);
    },
    enabled: Boolean(sessionId),
    staleTime: 30_000,
    retry: false,
  });

  if (!sessionId || query.isError) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Zara&apos;s picks for you
        </h2>
        {query.isFetching && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            updating…
          </span>
        )}
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {query.isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-32 w-64 shrink-0 animate-pulse rounded-lg border bg-card"
              />
            ))
          : query.data?.picks.map((p) => (
              <article
                key={p.itemId}
                className={cn(
                  'flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md',
                )}
              >
                <header className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 text-sm font-semibold leading-tight">{p.name}</h3>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatINR(p.price)}
                  </span>
                </header>
                <p className="line-clamp-2 text-xs text-muted-foreground">"{p.reason}"</p>
                <Button
                  type="button"
                  size="sm"
                  className="ml-auto mt-auto tap-target"
                  onClick={() => add.mutate({ menuItemId: p.itemId })}
                  disabled={add.isPending}
                  aria-label={`Add ${p.name}`}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </article>
            ))}
      </div>
    </section>
  );
}
