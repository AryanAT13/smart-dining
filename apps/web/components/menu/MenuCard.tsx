'use client';

import type { MenuItemDto } from '@smart-dining/shared';

import { CartStepper } from '@/components/cart/CartStepper';
import { FoodImage } from '@/components/menu/FoodImage';
import { Badge } from '@/components/ui/badge';
import { useCartUiStore } from '@/lib/stores/cartUi';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/format';

interface MenuCardProps {
  item: MenuItemDto;
}

export function MenuCard({ item }: MenuCardProps) {
  const isVeg = item.tags.includes('veg');
  const isBestseller = item.tags.includes('bestseller');
  const isSpicy = item.tags.includes('spicy');
  const isChefSpecial = item.tags.includes('chef_special');
  const unavailable = !item.available;
  const flashAdd = useCartUiStore((s) => s.flashAdd);

  return (
    <article
      className={cn(
        'group relative flex gap-3 overflow-hidden rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        unavailable && 'opacity-60 grayscale [&_h3]:line-through [&_h3]:decoration-muted-foreground/40',
      )}
    >
      {unavailable && (
        <span className="pointer-events-none absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-destructive/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive-foreground shadow">
          Sold out
        </span>
      )}
      <FoodImage
        src={item.imageUrl}
        name={item.name}
        category={item.category}
        className="h-20 w-20 shrink-0"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                title={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
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
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{formatINR(item.price)}</span>
        </header>

        <div className="flex flex-wrap items-center gap-1">
          {isBestseller && (
            <Badge variant="bestseller" className="text-[10px]">
              Bestseller
            </Badge>
          )}
          {isChefSpecial && (
            <Badge variant="spice" className="text-[10px]">
              Chef&apos;s pick
            </Badge>
          )}
          {isSpicy && (
            <Badge variant="spice" className="text-[10px]">
              Spicy
            </Badge>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2">
          {item.allergens.length > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              Contains {item.allergens.slice(0, 2).join(', ')}
              {item.allergens.length > 2 ? ` +${item.allergens.length - 2}` : ''}
            </span>
          ) : (
            <span aria-hidden />
          )}
          <CartStepper
            menuItemId={item.id}
            disabled={unavailable}
            onAfterAdd={flashAdd}
          />
        </div>
      </div>
    </article>
  );
}
