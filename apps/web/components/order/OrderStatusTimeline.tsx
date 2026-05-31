'use client';

import { Check, ChefHat, Clock, PackageCheck, Soup, Utensils } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

type Status = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

interface OrderStatusTimelineProps {
  status: Status;
  estimatedWaitMinutes?: number | null;
}

/**
 * Vertical 4-step timeline. The current status's icon pulses; completed
 * steps go solid; future steps are muted. Pure presentation — the actual
 * status updates flow in via the `order:status_changed` socket event and
 * cause the parent to re-render with a new `status`.
 */
const STEPS: { key: Status; label: string; icon: typeof Check; hint: string }[] = [
  { key: 'pending',    label: 'Order received',    icon: Check,       hint: 'We have it' },
  { key: 'confirmed',  label: 'Confirmed',         icon: ChefHat,     hint: 'Kitchen accepted' },
  { key: 'preparing',  label: 'Preparing',         icon: Soup,        hint: 'Cooking now' },
  { key: 'ready',      label: 'Ready',             icon: PackageCheck, hint: 'Coming to your table' },
  { key: 'delivered',  label: 'Delivered',         icon: Utensils,    hint: 'Enjoy!' },
];

const ORDER_INDEX: Record<Status, number> = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  delivered: 4,
  cancelled: -1,
};

export function OrderStatusTimeline({ status, estimatedWaitMinutes }: OrderStatusTimelineProps) {
  const currentIndex = ORDER_INDEX[status];

  if (status === 'cancelled') {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive">
        Order cancelled. Speak to a server if this looks wrong.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {estimatedWaitMinutes !== null && estimatedWaitMinutes !== undefined && currentIndex < 4 && (
        <div className="inline-flex items-center gap-2 rounded-full bg-accent/30 px-3 py-1 text-xs text-accent-foreground">
          <Clock className="h-3.5 w-3.5" />
          About {estimatedWaitMinutes} min total
        </div>
      )}

      <ol className="relative ml-3 space-y-4 border-l-2 border-border pl-6">
        {STEPS.map((step, i) => {
          const isComplete = i < currentIndex;
          const isCurrent = i === currentIndex;
          const Icon = step.icon;
          return (
            <li key={step.key} className="relative">
              {/* Dot on the timeline */}
              <span
                className={cn(
                  'absolute -left-[2.0rem] flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors',
                  isComplete && 'border-primary bg-primary text-primary-foreground',
                  isCurrent && 'border-primary bg-card text-primary',
                  !isComplete && !isCurrent && 'border-border bg-card text-muted-foreground',
                )}
              >
                <Icon
                  className={cn('h-3.5 w-3.5', isCurrent && 'animate-pulse')}
                  aria-hidden
                />
              </span>
              <div className="space-y-0.5">
                <p
                  className={cn(
                    'text-sm font-medium leading-tight',
                    !isCurrent && !isComplete && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                  {isCurrent && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Now
                    </span>
                  )}
                </p>
                <p
                  className={cn(
                    'text-xs text-muted-foreground',
                    !isCurrent && !isComplete && 'opacity-60',
                  )}
                >
                  {step.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
