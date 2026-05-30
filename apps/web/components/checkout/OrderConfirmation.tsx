'use client';

import { CheckCircle2, Clock } from 'lucide-react';

import type { OrderDto } from '@smart-dining/shared';

import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/utils/format';

interface OrderConfirmationProps {
  order: OrderDto;
  onClose: () => void;
}

export function OrderConfirmation({ order, onClose }: OrderConfirmationProps) {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Order placed</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Order #{order.id.slice(0, 8).toUpperCase()}
        </p>
        {order.isReturnVisit && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            👋 Welcome back — visit #{order.visitCount}
          </p>
        )}
      </div>

      {order.estimatedWaitMinutes !== null && (
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm">
          <Clock className="h-4 w-4" />
          About {order.estimatedWaitMinutes} min
        </div>
      )}

      <ul className="mx-auto max-w-sm divide-y rounded-lg border bg-card text-left">
        {order.items.map((it) => (
          <li key={it.menuItemId} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-sm">
              {it.name} <span className="text-muted-foreground">× {it.quantity}</span>
            </span>
            <span className="text-sm font-medium tabular-nums">
              {formatINR(it.price * it.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mx-auto max-w-sm space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatINR(order.subtotalAmount)}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>GST</dt>
          <dd className="tabular-nums">{formatINR(order.taxAmount)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatINR(order.totalAmount)}</dd>
        </div>
      </dl>

      <Button size="lg" className="w-full tap-target" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}
