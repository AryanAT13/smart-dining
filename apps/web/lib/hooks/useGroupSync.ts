/**
 * `useGroupSync` — connects to the gateway and bridges socket events into
 * TanStack Query and Zustand.
 *
 * - cart:* events → invalidate the cart query so it refetches the canonical
 *   state from the API. Optimistic merging would be more elegant but adds
 *   reconciliation complexity; refetch is cheap (10–30ms) and bulletproof.
 * - session:user_joined / user_left → mutate the group store.
 * - order:* events → invalidate the order query and surface a toast.
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { SOCKET_EVENTS } from '@smart-dining/shared';

import { cartKeys, orderKeys } from '@/lib/api/fetchers';
import { getSocket } from '@/lib/socket/client';
import { useGroupStore } from '@/lib/stores/group';
import { useIdentityStore } from '@/lib/stores/identity';

interface CartEventPayload {
  sessionId: string;
  item?: { addedBy?: string; name?: string };
  cartSubtotal?: number;
  updatedBy?: string;
  removedBy?: string;
}

interface JoinedPayload {
  displayName: string;
  participantCount: number;
  timestamp: number;
}

interface LeftPayload {
  displayName: string;
  participantCount: number;
}

interface OrderPlacedPayload {
  orderId: string;
  estimatedWaitMinutes: number | null;
}

export function useGroupSync(tableId: string | null) {
  const displayName = useIdentityStore((s) => s.displayName);
  const queryClient = useQueryClient();
  const upsertMember = useGroupStore((s) => s.upsertMember);
  const removeMember = useGroupStore((s) => s.removeMember);

  useEffect(() => {
    if (!tableId) return;

    const socket = getSocket(tableId, displayName);

    const handleCartChange = (payload: CartEventPayload, kind: 'add' | 'update' | 'remove') => {
      queryClient.invalidateQueries({ queryKey: cartKeys.forSession(payload.sessionId) });
      // Only show a toast for *others'* actions; the local action handler
      // already showed its own toast.
      const who = payload.item?.addedBy ?? payload.updatedBy ?? payload.removedBy ?? '';
      if (!who || who === displayName) return;
      if (kind === 'add' && payload.item?.name) {
        toast(`${who} added ${payload.item.name}`, { duration: 2500 });
      } else if (kind === 'update') {
        toast(`${who} updated an item`, { duration: 1500 });
      } else if (kind === 'remove') {
        toast(`${who} removed an item`, { duration: 1500 });
      }
    };

    const onAdded = (payload: CartEventPayload) => handleCartChange(payload, 'add');
    const onUpdated = (payload: CartEventPayload) => handleCartChange(payload, 'update');
    const onRemoved = (payload: CartEventPayload) => handleCartChange(payload, 'remove');

    const onJoined = (payload: JoinedPayload) => {
      upsertMember(payload.displayName, payload.timestamp, payload.participantCount);
      if (payload.displayName !== displayName) {
        toast(`${payload.displayName} joined the table`, { duration: 2500 });
      }
    };
    const onLeft = (payload: LeftPayload) => {
      removeMember(payload.displayName, payload.participantCount);
    };

    const onOrderPlaced = (payload: OrderPlacedPayload) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.byId(payload.orderId) });
      toast.success(
        payload.estimatedWaitMinutes
          ? `Order in! About ${payload.estimatedWaitMinutes} min.`
          : 'Order placed.',
      );
    };

    socket.on(SOCKET_EVENTS.CART_ITEM_ADDED, onAdded);
    socket.on(SOCKET_EVENTS.CART_ITEM_UPDATED, onUpdated);
    socket.on(SOCKET_EVENTS.CART_ITEM_REMOVED, onRemoved);
    socket.on(SOCKET_EVENTS.SESSION_USER_JOINED, onJoined);
    socket.on(SOCKET_EVENTS.SESSION_USER_LEFT, onLeft);
    socket.on(SOCKET_EVENTS.ORDER_PLACED, onOrderPlaced);

    return () => {
      socket.off(SOCKET_EVENTS.CART_ITEM_ADDED, onAdded);
      socket.off(SOCKET_EVENTS.CART_ITEM_UPDATED, onUpdated);
      socket.off(SOCKET_EVENTS.CART_ITEM_REMOVED, onRemoved);
      socket.off(SOCKET_EVENTS.SESSION_USER_JOINED, onJoined);
      socket.off(SOCKET_EVENTS.SESSION_USER_LEFT, onLeft);
      socket.off(SOCKET_EVENTS.ORDER_PLACED, onOrderPlaced);
    };
  }, [tableId, displayName, queryClient, upsertMember, removeMember]);
}
