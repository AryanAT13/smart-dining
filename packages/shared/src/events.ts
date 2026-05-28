/**
 * Socket.io event payload types (see spec §10.2).
 *
 * Discriminated unions keyed by event name. Both the client and the gateway
 * import these so a mismatched payload is a compile error, not a runtime
 * "undefined is not an object" five frames into a handler.
 *
 * SSE events have a parallel definition in `./sse.ts` — they're a separate
 * transport with separate semantics (see ADR-003).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Cart events (gateway → all clients on tableId)
// ---------------------------------------------------------------------------

export const CartItemPayloadSchema = z.object({
  cartItemId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  name: z.string(),
  price: z.number(),
  quantity: z.number().int().positive(),
  addedBy: z.string(),
  specialInstructions: z.string().nullable(),
  version: z.number().int().nonnegative(),
});
export type CartItemPayload = z.infer<typeof CartItemPayloadSchema>;

export const CartItemAddedSchema = z.object({
  type: z.literal('cart:item_added'),
  tableId: z.string(),
  sessionId: z.string().uuid(),
  item: CartItemPayloadSchema,
  cartSubtotal: z.number(),
  timestamp: z.number(),
});
export type CartItemAdded = z.infer<typeof CartItemAddedSchema>;

export const CartItemUpdatedSchema = z.object({
  type: z.literal('cart:item_updated'),
  tableId: z.string(),
  sessionId: z.string().uuid(),
  cartItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  version: z.number().int().nonnegative(),
  updatedBy: z.string(),
  timestamp: z.number(),
});
export type CartItemUpdated = z.infer<typeof CartItemUpdatedSchema>;

export const CartItemRemovedSchema = z.object({
  type: z.literal('cart:item_removed'),
  tableId: z.string(),
  sessionId: z.string().uuid(),
  cartItemId: z.string().uuid(),
  removedBy: z.string(),
  timestamp: z.number(),
});
export type CartItemRemoved = z.infer<typeof CartItemRemovedSchema>;

// ---------------------------------------------------------------------------
// AI message events (broadcast Zara's group-level messages to all diners)
// ---------------------------------------------------------------------------

export const AiMessageSchema = z.object({
  type: z.literal('ai:message'),
  tableId: z.string(),
  sessionId: z.string().uuid(),
  messageId: z.string().uuid(),
  sender: z.enum(['user', 'assistant']),
  text: z.string(),
  displayName: z.string().optional(), // for user messages
  timestamp: z.number(),
});
export type AiMessage = z.infer<typeof AiMessageSchema>;

// ---------------------------------------------------------------------------
// Session events
// ---------------------------------------------------------------------------

export const SessionUserJoinedSchema = z.object({
  type: z.literal('session:user_joined'),
  tableId: z.string(),
  sessionId: z.string().uuid(),
  displayName: z.string(),
  participantCount: z.number().int().positive(),
  timestamp: z.number(),
});
export type SessionUserJoined = z.infer<typeof SessionUserJoinedSchema>;

export const SessionUserLeftSchema = z.object({
  type: z.literal('session:user_left'),
  tableId: z.string(),
  sessionId: z.string().uuid(),
  displayName: z.string(),
  participantCount: z.number().int().nonnegative(),
  timestamp: z.number(),
});
export type SessionUserLeft = z.infer<typeof SessionUserLeftSchema>;

// ---------------------------------------------------------------------------
// Order events
// ---------------------------------------------------------------------------

export const OrderPlacedSchema = z.object({
  type: z.literal('order:placed'),
  tableId: z.string(),
  sessionId: z.string().uuid(),
  orderId: z.string().uuid(),
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
  estimatedWaitMinutes: z.number().int().nonnegative().nullable(),
  timestamp: z.number(),
});
export type OrderPlaced = z.infer<typeof OrderPlacedSchema>;

export const OrderStatusChangedSchema = z.object({
  type: z.literal('order:status_changed'),
  tableId: z.string(),
  sessionId: z.string().uuid(),
  orderId: z.string().uuid(),
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
  timestamp: z.number(),
});
export type OrderStatusChanged = z.infer<typeof OrderStatusChangedSchema>;

// ---------------------------------------------------------------------------
// Discriminated union — every gateway broadcast
// ---------------------------------------------------------------------------

export const ServerEventSchema = z.discriminatedUnion('type', [
  CartItemAddedSchema,
  CartItemUpdatedSchema,
  CartItemRemovedSchema,
  AiMessageSchema,
  SessionUserJoinedSchema,
  SessionUserLeftSchema,
  OrderPlacedSchema,
  OrderStatusChangedSchema,
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;

// ---------------------------------------------------------------------------
// Client → server events (limited surface)
// ---------------------------------------------------------------------------

export const ClientJoinSchema = z.object({
  type: z.literal('client:join'),
  tableId: z.string().min(1).max(20),
  displayName: z.string().min(1).max(50),
});
export type ClientJoin = z.infer<typeof ClientJoinSchema>;

export const ClientLeaveSchema = z.object({
  type: z.literal('client:leave'),
  tableId: z.string(),
});
export type ClientLeave = z.infer<typeof ClientLeaveSchema>;

export const ClientEventSchema = z.discriminatedUnion('type', [ClientJoinSchema, ClientLeaveSchema]);
export type ClientEvent = z.infer<typeof ClientEventSchema>;

// ---------------------------------------------------------------------------
// Convenience: event name constants — used as Socket.io room keys
// ---------------------------------------------------------------------------

export const SOCKET_EVENTS = {
  CART_ITEM_ADDED: 'cart:item_added',
  CART_ITEM_UPDATED: 'cart:item_updated',
  CART_ITEM_REMOVED: 'cart:item_removed',
  AI_MESSAGE: 'ai:message',
  SESSION_USER_JOINED: 'session:user_joined',
  SESSION_USER_LEFT: 'session:user_left',
  ORDER_PLACED: 'order:placed',
  ORDER_STATUS_CHANGED: 'order:status_changed',
  CLIENT_JOIN: 'client:join',
  CLIENT_LEAVE: 'client:leave',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
