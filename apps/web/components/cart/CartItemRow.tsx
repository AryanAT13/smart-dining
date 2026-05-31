'use client';

import { Check, Minus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import type { CartDto } from '@smart-dining/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(line.specialInstructions ?? '');

  const submitNote = () => {
    const clean = noteDraft.trim();
    update.mutate(
      {
        itemId: line.id,
        expectedVersion: line.version,
        specialInstructions: clean.length > 0 ? clean : null,
      },
      { onSuccess: () => setEditingNote(false) },
    );
  };

  return (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{line.menuItem.name}</span>
          <OwnerBadge name={line.addedBy} isYou={isMine} />
        </div>

        {/* Special instructions — display or inline editor */}
        {editingNote ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              submitNote();
            }}
          >
            <Input
              autoFocus
              value={noteDraft}
              maxLength={200}
              placeholder='e.g. "no onions"'
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setEditingNote(false);
                  setNoteDraft(line.specialInstructions ?? '');
                }
              }}
              className="h-8 text-xs"
            />
            <Button
              type="submit"
              size="icon"
              className="h-7 w-7 rounded-full"
              aria-label="Save note"
              disabled={update.isPending}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full"
              aria-label="Cancel"
              onClick={() => {
                setEditingNote(false);
                setNoteDraft(line.specialInstructions ?? '');
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : line.specialInstructions ? (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            className="group flex max-w-full items-center gap-1 text-left text-xs italic text-muted-foreground hover:text-foreground"
          >
            <span className="truncate">&ldquo;{line.specialInstructions}&rdquo;</span>
            <Pencil className="h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80 hover:text-primary"
          >
            <Pencil className="h-3 w-3" />
            Add a note
          </button>
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
