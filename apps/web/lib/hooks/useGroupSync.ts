/**
 * `useGroupSync` — bridges socket events into TanStack Query + Zustand.
 *
 * - cart:* events → invalidate cart query so it refetches the canonical state
 * - session:user_joined / user_left → mutate group store
 * - order:placed / order:status_changed → invalidate order query + toast
 * - ai:message → push the assistant's upsell message into the chat store
 *   so it shows up in the chat drawer (with a "new" pulse on the dock)
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { SOCKET_EVENTS } from '@smart-dining/shared';

import { cartKeys, orderKeys } from '@/lib/api/fetchers';
import { getSocket } from '@/lib/socket/client';
import { useChatStore } from '@/lib/stores/chat';
import { useGroupStore } from '@/lib/stores/group';
import { useIdentityStore } from '@/lib/stores/identity';

// `session:rename` isn't in the shared SOCKET_EVENTS map because it's a
// gateway-internal event for dedup. Inlined here to keep the constant tree
// purely customer-visible.

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

interface OrderStatusPayload {
  orderId: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
}

interface AiMessagePayload {
  messageId: string;
  sender: 'user' | 'assistant';
  text: string;
  suggestion?: { itemId: string; name: string; price: number };
  trigger?: string;
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

    const onOrderStatus = (payload: OrderStatusPayload) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.byId(payload.orderId) });
      const statusToast: Record<OrderStatusPayload['status'], string> = {
        pending: 'Order received',
        confirmed: 'Order confirmed by kitchen',
        preparing: 'Kitchen is preparing your order',
        ready: 'Your order is ready!',
        delivered: 'Order delivered — enjoy!',
        cancelled: 'Order cancelled',
      };
      toast.info(statusToast[payload.status]);
    };

    /**
     * Upsell messages and other AI broadcasts ride on `ai:message`. Push
     * them into the chat store so they appear in the drawer with their
     * suggestion card. Skip echoes of our own messages.
     */
    const onAiMessage = (payload: AiMessagePayload) => {
      if (payload.sender !== 'assistant') return;
      const store = useChatStore.getState();
      store.pushAssistant(
        payload.text,
        payload.suggestion
          ? [
              {
                itemId: payload.suggestion.itemId,
                name: payload.suggestion.name,
                price: payload.suggestion.price,
                reason: payload.trigger
                  ? formatTriggerReason(payload.trigger)
                  : 'Pairs nicely with your order',
              },
            ]
          : undefined,
      );
      // Only toast if the chat is closed, so we don't double-notify.
      if (!store.isOpen) {
        toast('Zara has a suggestion', { duration: 2500 });
      }
    };

    // Server-side dedup may rename us (e.g. "Priya" → "Priya (2)") when
    // we arrive at a table that already has someone with this name.
    const onRename = (payload: { displayName: string }) => {
      useIdentityStore.getState().setDisplayName(payload.displayName);
    };

    socket.on(SOCKET_EVENTS.CART_ITEM_ADDED, onAdded);
    socket.on(SOCKET_EVENTS.CART_ITEM_UPDATED, onUpdated);
    socket.on(SOCKET_EVENTS.CART_ITEM_REMOVED, onRemoved);
    socket.on(SOCKET_EVENTS.SESSION_USER_JOINED, onJoined);
    socket.on(SOCKET_EVENTS.SESSION_USER_LEFT, onLeft);
    socket.on(SOCKET_EVENTS.ORDER_PLACED, onOrderPlaced);
    socket.on(SOCKET_EVENTS.ORDER_STATUS_CHANGED, onOrderStatus);
    socket.on(SOCKET_EVENTS.AI_MESSAGE, onAiMessage);
    socket.on('session:rename', onRename);

    return () => {
      socket.off(SOCKET_EVENTS.CART_ITEM_ADDED, onAdded);
      socket.off(SOCKET_EVENTS.CART_ITEM_UPDATED, onUpdated);
      socket.off(SOCKET_EVENTS.CART_ITEM_REMOVED, onRemoved);
      socket.off(SOCKET_EVENTS.SESSION_USER_JOINED, onJoined);
      socket.off(SOCKET_EVENTS.SESSION_USER_LEFT, onLeft);
      socket.off(SOCKET_EVENTS.ORDER_PLACED, onOrderPlaced);
      socket.off(SOCKET_EVENTS.ORDER_STATUS_CHANGED, onOrderStatus);
      socket.off(SOCKET_EVENTS.AI_MESSAGE, onAiMessage);
      socket.off('session:rename', onRename);
    };
  }, [tableId, displayName, queryClient, upsertMember, removeMember]);
}

function formatTriggerReason(trigger: string): string {
  switch (trigger) {
    case 'post_add':
      return 'Pairs well with what you just added';
    case 'threshold_below':
      return 'Push your cart over ₹500 for the meal-deal price';
    case 'missing_beverage':
      return 'Goes with the mains in your cart';
    case 'veg_only_balance':
      return "Today's non-veg crowd-pleaser";
    case 'evening_special':
      return 'Evening special — limited time';
    case 'thats_all':
      return 'Before you go — quick add';
    default:
      return 'Zara thought you might like this';
  }
}
