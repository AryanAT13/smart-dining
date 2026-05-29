'use client';

import { AlertCircle } from 'lucide-react';
import { useEffect } from 'react';

import type { MenuItemDto } from '@smart-dining/shared';

import { CartDrawer } from '@/components/cart/CartDrawer';
import { AIChat } from '@/components/chat/AIChat';
import { GroupBanner } from '@/components/group/GroupBanner';
import { OnboardingDialog } from '@/components/layout/OnboardingDialog';
import { MenuGrid } from '@/components/menu/MenuGrid';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddCartItem } from '@/lib/hooks/useCart';
import { useGroupSync } from '@/lib/hooks/useGroupSync';
import { useMenu, usePopular } from '@/lib/hooks/useMenu';
import { useTableSession } from '@/lib/hooks/useTableSession';
import { useCartUiStore } from '@/lib/stores/cartUi';
import { useIdentityStore } from '@/lib/stores/identity';

export function TableShell({ tableId }: { tableId: string }) {
  const sessionQuery = useTableSession(tableId);
  const menuQuery = useMenu();
  const popularQuery = usePopular(4);

  const hasOnboarded = useIdentityStore((s) => s.hasOnboarded);
  const addItem = useAddCartItem();
  const setCartOpen = useCartUiStore((s) => s.setOpen);

  // Bring up the socket once the user has a name and a session.
  useGroupSync(hasOnboarded && sessionQuery.data ? tableId.toUpperCase() : null);

  // Hint: keep the user scrolled to top after a session refresh.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, [tableId]);

  const onAdd = (item: MenuItemDto) => {
    addItem.mutate(
      { menuItemId: item.id },
      {
        onSuccess: () => setCartOpen(true),
      },
    );
  };

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
    <main className="container max-w-2xl space-y-4 pb-32 pt-4 pt-safe">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Zaika
            </p>
            <h1 className="font-display text-2xl">Welcome to your table</h1>
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
        <MenuGrid
          items={menuQuery.data.items}
          popular={popularQuery.data?.items ?? []}
          onAdd={onAdd}
        />
      )}

      <OnboardingDialog />
      <AIChat />
      <CartDrawer />
    </main>
  );
}
