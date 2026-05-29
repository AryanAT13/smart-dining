'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';

import type { CartDto } from '@smart-dining/shared';

import { Button } from '@/components/ui/button';
import { useRemoveCartItem, useUpdateCartItem } from '@/lib/hooks/useCart';
import { useIdentityStore } from '@/lib/stores/identity';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/format';

import { OwnerBadge } from './OwnerBadge';

type CartLine = CartDto['items'][number];

export function CartItemRow({ line }: { line: CartLine }) {
  const displayName = useIdentityStore((s) => s.displayName);
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();

  const isMine = line.addedBy === displayName;

  return (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{line.menuItem.name}</span>
          <OwnerBadge name={line.addedBy} isYou={isMine} />
        </div>
        {line.specialInstructions && (
          <p className="text-xs italic text-muted-foreground">"{line.specialInstructions}"</p>
        )}
        <p className="text-xs text-muted-foreground">
          {formatINR(line.menuItem.price)} × {line.quantity}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-semibold">{formatINR(line.lineSubtotal)}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className={cn('h-7 w-7 rounded-full p-0', update.isPending && 'opacity-50')}
            aria-label="Decrease quantity"
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
            disabled={update.isPending || remove.isPending}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-6 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-7 w-7 rounded-full p-0"
            aria-label="Increase quantity"
            onClick={() =>
              update.mutate({
                itemId: line.id,
                expectedVersion: line.version,
                quantity: line.quantity + 1,
              })
            }
            disabled={update.isPending || remove.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-full p-0 text-destructive hover:bg-destructive/10"
            aria-label="Remove item"
            onClick={() => remove.mutate(line.id)}
            disabled={remove.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}
