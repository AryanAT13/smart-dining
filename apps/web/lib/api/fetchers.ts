/**
 * TanStack Query keys and fetchers.
 *
 * Convention: keys are arrays of literal strings + ids; fetchers are pure
 * functions that accept exactly what they need. This makes invalidation in
 * mutation onSuccess handlers trivial.
 */

import type {
  AddCartItemRequest,
  CartDto,
  MenuItemDto,
  OrderDto,
  PlaceOrderRequest,
  SendOtpRequest,
  UpdateCartItemRequest,
  UserPreferences,
  VerifyOtpRequest,
} from '@smart-dining/shared';

import { api } from './client';

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export const menuKeys = {
  all: ['menu'] as const,
  list: () => [...menuKeys.all, 'list'] as const,
  popular: (limit: number) => [...menuKeys.all, 'popular', limit] as const,
  search: (q: string) => [...menuKeys.all, 'search', q] as const,
};

export function fetchMenu(): Promise<{ items: MenuItemDto[] }> {
  return api('/api/menu');
}

export function fetchPopular(limit = 5): Promise<{ items: MenuItemDto[] }> {
  return api(`/api/popular?limit=${limit}`);
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionDto {
  id: string;
  tableId: string;
  status: string;
  preferences: Record<string, unknown>;
  language: string | null;
  expiresAt: string;
}

export const sessionKeys = {
  forTable: (tableId: string) => ['session', 'table', tableId] as const,
};

export function fetchSessionForTable(tableId: string): Promise<{ session: SessionDto }> {
  return api(`/api/table/${encodeURIComponent(tableId)}/session`);
}

export function updateSessionPreferences(
  sessionId: string,
  preferences: UserPreferences,
): Promise<{ preferences: Record<string, unknown>; language: string | null }> {
  return api(`/api/session/${sessionId}/preferences`, {
    method: 'POST',
    body: JSON.stringify({ preferences }),
  });
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const cartKeys = {
  forSession: (sessionId: string) => ['cart', sessionId] as const,
};

export function fetchCart(sessionId: string): Promise<{ cart: CartDto }> {
  return api(`/api/session/${sessionId}/cart`);
}

export function addCartItem(
  sessionId: string,
  body: AddCartItemRequest,
): Promise<{ cart: CartDto; addedLine: CartDto['items'][number] }> {
  return api(`/api/session/${sessionId}/cart`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateCartItem(
  sessionId: string,
  itemId: string,
  body: UpdateCartItemRequest,
  displayName: string,
): Promise<{ cart: CartDto }> {
  return api(`/api/session/${sessionId}/cart/${itemId}`, {
    method: 'PATCH',
    headers: { 'X-Display-Name': displayName },
    body: JSON.stringify(body),
  });
}

export function removeCartItem(
  sessionId: string,
  itemId: string,
  displayName: string,
): Promise<{ cart: CartDto }> {
  return api(`/api/session/${sessionId}/cart/${itemId}`, {
    method: 'DELETE',
    headers: { 'X-Display-Name': displayName },
  });
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export function sendOtp(
  body: SendOtpRequest,
): Promise<{ expiresAt: number; debugCode?: string }> {
  return api('/api/otp/send', { method: 'POST', body: JSON.stringify(body) });
}

export function verifyOtp(
  body: VerifyOtpRequest,
): Promise<{ token: string; expiresAt: number }> {
  return api('/api/otp/verify', { method: 'POST', body: JSON.stringify(body) });
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export const orderKeys = {
  byId: (orderId: string) => ['order', orderId] as const,
};

export function placeOrder(
  sessionId: string,
  body: PlaceOrderRequest,
): Promise<{ order: OrderDto }> {
  return api(`/api/session/${sessionId}/order`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchOrder(orderId: string): Promise<{ order: OrderDto }> {
  return api(`/api/order/${orderId}`);
}
