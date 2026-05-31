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
} from '@/components/ui/sheet';
import { useCart } from '@/lib/hooks/useCart';
import { useCartUiStore } from '@/lib/stores/cartUi';
import { useIdentityStore } from '@/lib/stores/identity';
import { formatINR } from '@/lib/utils/format';

import { CartItemRow } from './CartItemRow';
import { CheckoutModal } from '../checkout/CheckoutModal';

/**
 * Shared-cart drawer — opened from the FloatingDock. No launcher of its
 * own; the dock owns the trigger.
 */
export function CartDrawer() {
  const sessionId = useIdentityStore((s) => s.sessionId);
  const isOpen = useCartUiStore((s) => s.isOpen);
  const setOpen = useCartUiStore((s) => s.setOpen);

  const cartQuery = useCart(sessionId);
  const cart = cartQuery.data?.cart;

  const [checkoutOpen, setCheckoutOpen] = useState(false);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-display">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Your table&apos;s cart
            </SheetTitle>
            <SheetDescription>
              Shared with everyone at this table. Anyone can add or remove.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 max-h-[55dvh] overflow-y-auto">
            {!cart || cart.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nothing in the cart yet. Tap &ldquo;Add&rdquo; on a menu item to get started.
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
