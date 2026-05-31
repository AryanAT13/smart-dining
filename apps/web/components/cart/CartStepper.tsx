'use client';

import { Minus, Plus } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import {
  useAddCartItem,
  useCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from '@/lib/hooks/useCart';
import { useIdentityStore } from '@/lib/stores/identity';
import { cn } from '@/lib/utils/cn';

interface CartStepperProps {
  menuItemId: string;
  /** Show the menu item name on the Add button (compact mode hides this). */
  showAddLabel?: boolean;
  /** Compact mode → smaller stepper for chat cards. */
  compact?: boolean;
  /** Disable the button (e.g. item out of stock). */
  disabled?: boolean;
  /** Optional: which line in the cart this stepper controls. Falls back to "mine". */
  lineSelector?: 'mine' | 'first';
  className?: string;
  /** Optional callback after a successful add — used to flash the cart icon. */
  onAfterAdd?: () => void;
}

/**
 * Reusable Add → Stepper button.
 *
 * - When the user has zero quantity of this menu item in the cart, renders
 *   a single primary "+ Add" button.
 * - Once added, swaps in-place to a [- N +] stepper that:
 *   - + → addItem (which merges by addedBy + menuItemId + instructions)
 *   - − → updateItem(qty-1) OR removeItem if qty would hit zero
 *
 * Default `lineSelector="mine"` only counts lines this diner added — that's
 * what a stepper-on-the-menu-card should reflect. `"first"` is for chat
 * suggestion cards where attribution is fuzzier.
 */
export function CartStepper({
  menuItemId,
  showAddLabel = true,
  compact = false,
  disabled = false,
  lineSelector = 'mine',
  className,
  onAfterAdd,
}: CartStepperProps) {
  const sessionId = useIdentityStore((s) => s.sessionId);
  const displayName = useIdentityStore((s) => s.displayName);
  const cartQuery = useCart(sessionId);
  const add = useAddCartItem();
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();

  const line = useMemo(() => {
    const items = cartQuery.data?.cart.items ?? [];
    const matches = items.filter((l) => l.menuItem.id === menuItemId);
    if (matches.length === 0) return null;
    if (lineSelector === 'mine') {
      return matches.find((l) => l.addedBy === displayName) ?? matches[0] ?? null;
    }
    return matches[0] ?? null;
  }, [cartQuery.data?.cart.items, menuItemId, lineSelector, displayName]);

  const busy = add.isPending || update.isPending || remove.isPending;

  if (!line || line.quantity === 0) {
    return (
      <Button
        type="button"
        size={compact ? 'sm' : 'sm'}
        onClick={() => {
          add.mutate(
            { menuItemId },
            {
              onSuccess: () => {
                onAfterAdd?.();
              },
            },
          );
        }}
        disabled={disabled || busy}
        className={cn('tap-target gap-1', className)}
        aria-label={showAddLabel ? 'Add to cart' : `Add ${menuItemId.slice(0, 6)} to cart`}
      >
        <Plus className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        {showAddLabel && <span>Add</span>}
      </Button>
    );
  }

  // Stepper mode — same footprint as the Add button so the layout doesn't shift.
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground',
        compact ? 'p-0.5' : 'p-1',
        className,
      )}
      role="group"
      aria-label={`Quantity stepper for ${line.menuItem.name}`}
    >
      <button
        type="button"
        onClick={() => {
          if (line.quantity <= 1) {
            remove.mutate(line.id);
          } else {
            update.mutate({
              itemId: line.id,
              expectedVersion: line.version,
              quantity: line.quantity - 1,
            });
          }
        }}
        disabled={busy}
        aria-label="Decrease quantity"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-primary-foreground/15 disabled:opacity-50',
          compact ? 'h-6 w-6' : 'h-7 w-7',
        )}
      >
        <Minus className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      </button>
      <span
        className={cn(
          'inline-flex min-w-[1.25rem] items-center justify-center text-center font-semibold tabular-nums',
          compact ? 'text-xs' : 'text-sm',
        )}
        aria-live="polite"
      >
        {line.quantity}
      </span>
      <button
        type="button"
        onClick={() => {
          add.mutate(
            { menuItemId },
            {
              onSuccess: () => onAfterAdd?.(),
            },
          );
        }}
        disabled={busy || disabled}
        aria-label="Increase quantity"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-primary-foreground/15 disabled:opacity-50',
          compact ? 'h-6 w-6' : 'h-7 w-7',
        )}
      >
        <Plus className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      </button>
    </div>
  );
}
