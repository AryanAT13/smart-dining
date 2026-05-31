'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';

import { CartStepper } from '@/components/cart/CartStepper';
import { FoodImage } from '@/components/menu/FoodImage';
import { api } from '@/lib/api/client';
import { useCartUiStore } from '@/lib/stores/cartUi';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/format';

interface Pick {
  itemId: string;
  name: string;
  price: number;
  reason: string;
  imageUrl?: string;
  category?: string;
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
  const flashAdd = useCartUiStore((s) => s.flashAdd);
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
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-foreground/80">
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
                className="h-44 w-64 shrink-0 animate-pulse rounded-xl border bg-card"
              />
            ))
          : query.data?.picks.map((p) => (
              <article
                key={p.itemId}
                className={cn(
                  'group relative flex w-64 shrink-0 flex-col gap-2 overflow-hidden rounded-xl border border-border/70 bg-card/90 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-md',
                )}
              >
                <FoodImage
                  src={p.imageUrl}
                  name={p.name}
                  category={p.category}
                  className="h-24 w-full"
                  rounded="lg"
                />
                <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                  <header className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-1 text-sm font-semibold leading-tight">{p.name}</h3>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatINR(p.price)}
                    </span>
                  </header>
                  <p className="line-clamp-2 text-xs italic text-muted-foreground">
                    &ldquo;{p.reason}&rdquo;
                  </p>
                  <div className="ml-auto mt-auto">
                    <CartStepper menuItemId={p.itemId} onAfterAdd={flashAdd} />
                  </div>
                </div>
              </article>
            ))}
      </div>
    </section>
  );
}
