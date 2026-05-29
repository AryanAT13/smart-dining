/**
 * Cart hooks — TanStack Query for reads, mutations for writes.
 *
 * Mutations invalidate the cart key on success. Group sync events arriving
 * via socket also invalidate the same key — see `useGroupSync`. This means
 * a remote change and a local change both converge through the same path.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api/client';
import {
  addCartItem,
  cartKeys,
  fetchCart,
  removeCartItem,
  updateCartItem,
} from '@/lib/api/fetchers';
import { useCartUiStore } from '@/lib/stores/cartUi';
import { useIdentityStore } from '@/lib/stores/identity';

export function useCart(sessionId: string | null) {
  return useQuery({
    queryKey: cartKeys.forSession(sessionId ?? 'none'),
    queryFn: () => {
      if (!sessionId) throw new Error('No session');
      return fetchCart(sessionId);
    },
    enabled: Boolean(sessionId),
    staleTime: 10_000,
  });
}

export function useAddCartItem() {
  const queryClient = useQueryClient();
  const displayName = useIdentityStore((s) => s.displayName);
  const sessionId = useIdentityStore((s) => s.sessionId);
  const flashAdd = useCartUiStore((s) => s.flashAdd);

  return useMutation({
    mutationFn: async (vars: {
      menuItemId: string;
      quantity?: number;
      specialInstructions?: string;
    }) => {
      if (!sessionId) throw new Error('No active session');
      return addCartItem(sessionId, {
        menuItemId: vars.menuItemId,
        quantity: vars.quantity ?? 1,
        addedBy: displayName,
        ...(vars.specialInstructions !== undefined
          ? { specialInstructions: vars.specialInstructions }
          : {}),
      });
    },
    onSuccess: () => {
      if (sessionId) queryClient.invalidateQueries({ queryKey: cartKeys.forSession(sessionId) });
      flashAdd();
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : 'Could not add to cart.';
      toast.error(message);
    },
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();
  const displayName = useIdentityStore((s) => s.displayName);
  const sessionId = useIdentityStore((s) => s.sessionId);

  return useMutation({
    mutationFn: async (vars: {
      itemId: string;
      expectedVersion: number;
      quantity?: number;
      specialInstructions?: string | null;
    }) => {
      if (!sessionId) throw new Error('No active session');
      return updateCartItem(
        sessionId,
        vars.itemId,
        {
          expectedVersion: vars.expectedVersion,
          ...(vars.quantity !== undefined ? { quantity: vars.quantity } : {}),
          ...(vars.specialInstructions !== undefined
            ? { specialInstructions: vars.specialInstructions }
            : {}),
        },
        displayName,
      );
    },
    onSuccess: () => {
      if (sessionId) queryClient.invalidateQueries({ queryKey: cartKeys.forSession(sessionId) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'CART_VERSION_MISMATCH') {
        toast.info('Someone else just updated this item. Refreshing.');
        if (sessionId) queryClient.invalidateQueries({ queryKey: cartKeys.forSession(sessionId) });
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Could not update item.');
    },
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();
  const displayName = useIdentityStore((s) => s.displayName);
  const sessionId = useIdentityStore((s) => s.sessionId);

  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!sessionId) throw new Error('No active session');
      return removeCartItem(sessionId, itemId, displayName);
    },
    onSuccess: () => {
      if (sessionId) queryClient.invalidateQueries({ queryKey: cartKeys.forSession(sessionId) });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove item.');
    },
  });
}
