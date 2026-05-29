'use client';

import { Plus } from 'lucide-react';

import type { MenuItemDto } from '@smart-dining/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/format';

interface MenuCardProps {
  item: MenuItemDto;
  onAdd: (item: MenuItemDto) => void;
  disabled?: boolean;
}

export function MenuCard({ item, onAdd, disabled }: MenuCardProps) {
  const isVeg = item.tags.includes('veg');
  const isBestseller = item.tags.includes('bestseller');
  const isSpicy = item.tags.includes('spicy');
  const unavailable = !item.available;

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md',
        unavailable && 'opacity-50',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                'inline-block h-3 w-3 shrink-0 rounded-sm border-2',
                isVeg ? 'border-emerald-600' : 'border-rose-600',
              )}
            >
              <span
                className={cn(
                  'mx-auto mt-0.5 block h-1 w-1 rounded-full',
                  isVeg ? 'bg-emerald-600' : 'bg-rose-600',
                )}
              />
            </span>
            <h3 className="truncate text-sm font-semibold leading-tight">{item.name}</h3>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold">{formatINR(item.price)}</span>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {isBestseller && (
          <Badge variant="bestseller" className="text-[10px]">
            Bestseller
          </Badge>
        )}
        {isSpicy && (
          <Badge variant="spice" className="text-[10px]">
            Spicy
          </Badge>
        )}
        {item.allergens.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            Contains: {item.allergens.join(', ')}
          </span>
        )}
      </div>

      <footer className="mt-1 flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          onClick={() => onAdd(item)}
          disabled={disabled || unavailable}
          className="tap-target"
          aria-label={`Add ${item.name} to cart`}
        >
          <Plus className="h-4 w-4" />
          {unavailable ? 'Out' : 'Add'}
        </Button>
      </footer>
    </article>
  );
}
