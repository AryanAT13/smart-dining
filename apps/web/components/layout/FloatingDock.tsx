'use client';

import { ShoppingBag, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/hooks/useCart';
import { useCartUiStore } from '@/lib/stores/cartUi';
import { useChatStore } from '@/lib/stores/chat';
import { useIdentityStore } from '@/lib/stores/identity';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/format';

/**
 * Fixed dock at the bottom of the viewport. Per spec §11 Flow 3 the chat
 * button is on the bottom-RIGHT with an unread dot when AI has a suggestion.
 *
 *   [ Cart · 3 · ₹520 ]    [ • Ask Zara ]
 *      bottom-left              bottom-right
 *
 * Both pills are the same height, share the same elevation, and sit
 * inside one safe-area-aware container so they're perfectly balanced.
 * The unread badge on Zara comes from chatStore.unreadCount and resets
 * to zero whenever the drawer opens.
 */
export function FloatingDock() {
  const sessionId = useIdentityStore((s) => s.sessionId);
  const cartQuery = useCart(sessionId);
  const cart = cartQuery.data?.cart;
  const itemCount = cart?.items.reduce((acc, l) => acc + l.quantity, 0) ?? 0;
  const lastAddedAt = useCartUiStore((s) => s.lastAddedAt);
  const setCartOpen = useCartUiStore((s) => s.setOpen);
  const setChatOpen = useChatStore((s) => s.setOpen);
  const unreadCount = useChatStore((s) => s.unreadCount);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-safe"
      role="region"
      aria-label="Quick actions"
    >
      <div className="pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-3">
        {/* Cart — bottom-left */}
        <Button
          type="button"
          size="lg"
          variant="default"
          onClick={() => setCartOpen(true)}
          className={cn(
            'relative h-12 flex-1 max-w-[14rem] rounded-full px-4 shadow-xl shadow-primary/20 tap-target',
            lastAddedAt > 0 && 'animate-cart-pop',
          )}
          key={lastAddedAt}
          aria-label={
            itemCount === 0
              ? 'Open cart, empty'
              : `Open cart with ${itemCount} item${itemCount === 1 ? '' : 's'}`
          }
        >
          <ShoppingBag className="h-4 w-4" />
          <span className="text-sm font-semibold">
            {itemCount === 0 ? 'Cart' : `${itemCount} item${itemCount === 1 ? '' : 's'}`}
          </span>
          {cart && cart.total > 0 && (
            <span className="rounded-full bg-primary-foreground/15 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
              {formatINR(cart.total)}
            </span>
          )}
        </Button>

        {/* Zara — bottom-right per spec §11 Flow 3. When there's an unread
            suggestion, the whole button GLOWS with a saffron halo so it's
            impossible to miss against the dock's terracotta background. */}
        <Button
          type="button"
          size="lg"
          variant="default"
          onClick={() => setChatOpen(true)}
          className={cn(
            'relative h-12 flex-1 max-w-[12rem] rounded-full px-4 shadow-xl shadow-primary/20 tap-target',
            unreadCount > 0 && 'animate-zara-halo ring-2 ring-gold',
          )}
          aria-label={
            unreadCount > 0
              ? `Chat with Zara — ${unreadCount} unread`
              : 'Chat with Zara'
          }
        >
          <Sparkles className={cn('h-4 w-4', unreadCount > 0 && 'text-gold')} />
          <span className="text-sm font-semibold">
            {unreadCount > 0 ? 'Zara · new' : 'Ask Zara'}
          </span>
          {unreadCount > 0 && (
            <span
              className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-gold-foreground shadow-sm ring-2 ring-primary-foreground/30"
              aria-hidden
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
