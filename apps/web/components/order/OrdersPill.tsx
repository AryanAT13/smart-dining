'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, ClipboardList, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { SOCKET_EVENTS } from '@smart-dining/shared';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { fetchTableOrders, tableOrdersKey } from '@/lib/api/orders';
import { orderKeys } from '@/lib/api/fetchers';
import { getSocket } from '@/lib/socket/client';
import { useIdentityStore } from '@/lib/stores/identity';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/format';

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Received', tone: 'bg-amber-100 text-amber-900' },
  confirmed: { label: 'Confirmed', tone: 'bg-sky-100 text-sky-900' },
  preparing: { label: 'Being cooked', tone: 'bg-orange-100 text-orange-900' },
  ready: { label: 'Ready', tone: 'bg-emerald-100 text-emerald-900' },
  delivered: { label: 'Delivered', tone: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', tone: 'bg-destructive/15 text-destructive' },
};

/**
 * Persistent header chip that surfaces the diner's active orders. Hidden
 * when zero orders exist for this session. Opens a sheet listing each
 * order with status chip + a per-row "Track" link to `/order/[id]`.
 *
 * Auto-refreshes every 10s and invalidates on `order:*` socket events so
 * the status chips stay live.
 */
export function OrdersPill() {
  const tableId = useIdentityStore((s) => s.tableId);
  const displayName = useIdentityStore((s) => s.displayName);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Scope orders to the TABLE, not the session — when a diner places one
  // order the session flips to `ordered` and the next interaction creates
  // a new session. We want past orders from this visit to stay visible
  // across that boundary, so we fetch them by tableId.
  const query = useQuery({
    queryKey: tableOrdersKey(tableId ?? 'none'),
    queryFn: () => {
      if (!tableId) throw new Error('no table');
      return fetchTableOrders(tableId);
    },
    enabled: Boolean(tableId),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  // Live updates — any order event invalidates the list.
  useEffect(() => {
    if (!tableId) return;
    const socket = getSocket(tableId, displayName);
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: tableOrdersKey(tableId) });
    };
    socket.on(SOCKET_EVENTS.ORDER_PLACED, invalidate);
    socket.on(SOCKET_EVENTS.ORDER_STATUS_CHANGED, (payload: { orderId: string }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.byId(payload.orderId) });
      invalidate();
    });
    return () => {
      socket.off(SOCKET_EVENTS.ORDER_PLACED, invalidate);
      socket.off(SOCKET_EVENTS.ORDER_STATUS_CHANGED);
    };
  }, [tableId, displayName, queryClient]);

  const orders = query.data?.orders ?? [];
  if (!tableId || orders.length === 0) return null;

  const activeCount = orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled',
  ).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 rounded-full border-border/70 bg-card/80 px-3 py-1 text-xs backdrop-blur"
      >
        <ClipboardList className="h-3.5 w-3.5 text-primary" />
        <span>{orders.length} order{orders.length === 1 ? '' : 's'}</span>
        {activeCount > 0 && (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>

      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-display">
            <ChefHat className="h-5 w-5 text-primary" />
            Your orders this visit
          </SheetTitle>
          <SheetDescription>
            Tap any order to see its live status timeline.
          </SheetDescription>
        </SheetHeader>

        <ul className="mt-4 max-h-[55dvh] space-y-2 overflow-y-auto">
          {orders.map((o) => {
            const status = STATUS_COPY[o.status] ?? STATUS_COPY['pending'] ?? { label: o.status, tone: '' };
            return (
              <li
                key={o.id}
                className="rounded-xl border bg-card/80 p-3 backdrop-blur transition-shadow hover:shadow"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      Order #{o.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {o.itemCount} item{o.itemCount === 1 ? '' : 's'} ·{' '}
                      {formatINR(o.totalAmount)} ·{' '}
                      {new Date(o.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                      status.tone,
                    )}
                  >
                    {status.label}
                  </span>
                </div>

                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {o.items.slice(0, 3).map((it) => (
                    <li key={it.menuItemId} className="truncate">
                      {it.name} <span className="text-foreground/60">× {it.quantity}</span>
                    </li>
                  ))}
                  {o.items.length > 3 && (
                    <li className="text-[10px] uppercase tracking-wider">
                      +{o.items.length - 3} more
                    </li>
                  )}
                </ul>

                <Link
                  href={`/order/${o.id}`}
                  onClick={() => setOpen(false)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Track live <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
