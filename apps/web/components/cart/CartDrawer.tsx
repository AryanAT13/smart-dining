'use client';

import { ShoppingBag } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useCart } from '@/lib/hooks/useCart';
import { useCartUiStore } from '@/lib/stores/cartUi';
import { useIdentityStore } from '@/lib/stores/identity';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/format';

import { CartItemRow } from './CartItemRow';
import { CheckoutModal } from '../checkout/CheckoutModal';

export function CartDrawer() {
  const sessionId = useIdentityStore((s) => s.sessionId);
  const isOpen = useCartUiStore((s) => s.isOpen);
  const setOpen = useCartUiStore((s) => s.setOpen);
  const lastAddedAt = useCartUiStore((s) => s.lastAddedAt);

  const cartQuery = useCart(sessionId);
  const cart = cartQuery.data?.cart;
  const itemCount = cart?.items.reduce((acc, l) => acc + l.quantity, 0) ?? 0;

  const [checkoutOpen, setCheckoutOpen] = useState(false);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="default"
            size="lg"
            className={cn(
              'fixed bottom-4 right-4 z-40 rounded-full shadow-xl pb-safe tap-target',
              lastAddedAt > 0 && 'animate-cart-pop',
            )}
            key={lastAddedAt}
            aria-label={`Open cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
          >
            <ShoppingBag className="h-5 w-5" />
            <span>{itemCount === 0 ? 'Cart' : `${itemCount} item${itemCount === 1 ? '' : 's'}`}</span>
            {cart && cart.total > 0 && (
              <span className="ml-1 text-sm font-semibold tabular-nums">{formatINR(cart.total)}</span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-xl pb-safe">
          <SheetHeader>
            <SheetTitle>Your table's cart</SheetTitle>
            <SheetDescription>
              Shared with everyone at this table. Anyone can add or remove.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 max-h-[50dvh] overflow-y-auto">
            {!cart || cart.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nothing in the cart yet. Tap "Add" on a menu item to get started.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {cart.items.map((line) => (
                  <CartItemRow key={line.id} line={line} />
                ))}
              </ul>
            )}
          </div>

          {cart && cart.items.length > 0 && (
            <div className="mt-4 space-y-3 border-t pt-4">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{formatINR(cart.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>GST</dt>
                  <dd className="tabular-nums">{formatINR(cart.tax)}</dd>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatINR(cart.total)}</dd>
                </div>
              </dl>
              <Button
                type="button"
                size="lg"
                className="w-full tap-target"
                onClick={() => {
                  setOpen(false);
                  setCheckoutOpen(true);
                }}
              >
                Place order
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <CheckoutModal open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </>
  );
}
