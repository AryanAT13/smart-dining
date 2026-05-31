'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import type { OrderDto } from '@smart-dining/shared';
import { SOCKET_EVENTS } from '@smart-dining/shared';

import { OrderStatusTimeline } from '@/components/order/OrderStatusTimeline';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { orderKeys } from '@/lib/api/fetchers';
import { getSocket } from '@/lib/socket/client';
import { useIdentityStore } from '@/lib/stores/identity';
import { formatINR } from '@/lib/utils/format';

interface OrderResponse {
  order: OrderDto;
}

function fetchOrder(orderId: string): Promise<OrderResponse> {
  return api(`/api/order/${orderId}`);
}

/**
 * Live order tracker.
 *
 * - Reads the order once via REST.
 * - Subscribes to the same `table:{tableId}` channel as the rest of the app
 *   and invalidates the order query on `order:status_changed` events.
 * - Renders a vertical status timeline + item list + total.
 */
export function OrderTracker({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const tableId = useIdentityStore((s) => s.tableId);
  const displayName = useIdentityStore((s) => s.displayName);

  const query = useQuery({
    queryKey: orderKeys.byId(orderId),
    queryFn: () => fetchOrder(orderId),
    refetchInterval: 15_000, // safety net in case sockets drop
    staleTime: 5_000,
  });

  // Live updates via the table socket. Reuses the singleton connection
  // (won't double-connect when used inside the same browser session).
  useEffect(() => {
    if (!tableId) return;
    const socket = getSocket(tableId, displayName);
    const onStatusChange = (payload: { orderId: string }) => {
      if (payload.orderId === orderId) {
        queryClient.invalidateQueries({ queryKey: orderKeys.byId(orderId) });
      }
    };
    socket.on(SOCKET_EVENTS.ORDER_STATUS_CHANGED, onStatusChange);
    return () => {
      socket.off(SOCKET_EVENTS.ORDER_STATUS_CHANGED, onStatusChange);
    };
  }, [tableId, displayName, orderId, queryClient]);

  if (query.isLoading) {
    return (
      <main className="container max-w-md py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Loading your order…</p>
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="container max-w-md py-12 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-3 text-lg font-semibold">Couldn&apos;t load this order</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The order may have expired, or the link is wrong. Speak to a server if you placed an order at this table.
        </p>
      </main>
    );
  }

  const order = query.data.order;

  return (
    <main className="container relative max-w-2xl space-y-6 py-6 pt-safe">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[11px] uppercase tracking-[0.28em] text-primary/80">
            Order tracker
          </p>
          <h1 className="font-display text-2xl">Order #{order.id.slice(0, 8).toUpperCase()}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Placed {new Date(order.createdAt).toLocaleTimeString()}
          </p>
        </div>
        {tableId && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/table/${tableId}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to menu
            </Link>
          </Button>
        )}
      </header>

      <section className="rounded-2xl border bg-card/90 p-5 shadow-sm backdrop-blur">
        <OrderStatusTimeline
          status={order.status}
          estimatedWaitMinutes={order.estimatedWaitMinutes}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
          What you ordered
        </h2>
        <ul className="divide-y rounded-xl border bg-card/90 backdrop-blur">
          {order.items.map((it) => (
            <li key={it.menuItemId} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{it.name}</p>
                {it.specialInstructions && (
                  <p className="line-clamp-1 text-xs italic text-muted-foreground">
                    &ldquo;{it.specialInstructions}&rdquo;
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">× {it.quantity}</span>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatINR(it.price * it.quantity)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border bg-card/90 p-4 backdrop-blur">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatINR(order.subtotalAmount)}</dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>GST</dt>
            <dd className="tabular-nums">{formatINR(order.taxAmount)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatINR(order.totalAmount)}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
