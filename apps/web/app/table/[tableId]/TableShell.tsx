'use client';

import { AlertCircle, Activity } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { AestheticBackground } from '@/components/layout/AestheticBackground';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { AIChat } from '@/components/chat/AIChat';
import { GroupBanner } from '@/components/group/GroupBanner';
import { FloatingDock } from '@/components/layout/FloatingDock';
import { OnboardingDialog } from '@/components/layout/OnboardingDialog';
import { AIPickStrip } from '@/components/menu/AIPickStrip';
import { MenuGrid } from '@/components/menu/MenuGrid';
import { OrdersPill } from '@/components/order/OrdersPill';
import { Skeleton } from '@/components/ui/skeleton';
import { useGroupSync } from '@/lib/hooks/useGroupSync';
import { useMenu, usePopular } from '@/lib/hooks/useMenu';
import { useTableSession } from '@/lib/hooks/useTableSession';
import { useUpsellPoller } from '@/lib/hooks/useUpsellPoller';
import { useIdentityStore } from '@/lib/stores/identity';

export function TableShell({ tableId }: { tableId: string }) {
  const sessionQuery = useTableSession(tableId);
  const menuQuery = useMenu();
  const popularQuery = usePopular(4);

  const hasOnboarded = useIdentityStore((s) => s.hasOnboarded);

  // Bring up the socket once the user has a name and a session.
  useGroupSync(hasOnboarded && sessionQuery.data ? tableId.toUpperCase() : null);
  // HTTP fallback for upsells — catches messages the socket missed.
  useUpsellPoller(
    hasOnboarded && sessionQuery.data ? sessionQuery.data.session.id : null,
  );

  // Hint: keep the user scrolled to top after a session refresh.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, [tableId]);

  if (sessionQuery.isError) {
    return (
      <main className="container max-w-md py-12 text-center">
        <div className="space-y-3">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold">Couldn&apos;t start your session</h1>
          <p className="text-sm text-muted-foreground">
            {sessionQuery.error instanceof Error
              ? sessionQuery.error.message
              : 'Please rescan the QR code at your table.'}
          </p>
        </div>
      </main>
    );
  }

  const ready = sessionQuery.isSuccess && menuQuery.isSuccess;

  return (
    <>
      <AestheticBackground />
      <main className="container relative max-w-2xl space-y-5 pb-36 pt-4 pt-safe">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-[11px] uppercase tracking-[0.28em] text-primary/80">
                Zaika · Table {tableId.toUpperCase()}
              </p>
              <h1 className="font-display text-2xl leading-tight">Welcome to your table</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <OrdersPill />
              {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && sessionQuery.data && (
                <Link
                  href={`/debug/trace/${sessionQuery.data.session.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/70 px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur hover:text-foreground"
                  title="Open the agent trace timeline for this session"
                >
                  <Activity className="h-3 w-3" />
                  Trace
                </Link>
              )}
            </div>
          </div>
          <GroupBanner tableId={tableId.toUpperCase()} />
        </header>

        {!ready ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-full" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {hasOnboarded && <AIPickStrip sessionId={sessionQuery.data.session.id} />}
            <MenuGrid
              items={menuQuery.data.items}
              popular={popularQuery.data?.items ?? []}
            />
          </>
        )}

        <OnboardingDialog />
        <AIChat />
        <CartDrawer />
      </main>
      <FloatingDock />
    </>
  );
}
