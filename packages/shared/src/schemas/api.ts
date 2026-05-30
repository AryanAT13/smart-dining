/**
 * Shared REST DTOs.
 *
 * Every endpoint's request body and response payload is defined here so the
 * UI (TanStack Query fetchers) and the API route handler use the same shape.
 * Endpoints that accept user input run `Schema.safeParse(body)` at the boundary
 * — no untyped JSON survives past the route handler.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function fail(code: string, message: string, details?: Record<string, unknown>) {
  return { ok: false, error: { code, message, details } } as const;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export const MenuItemDtoSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  price: z.number(),
  description: z.string(),
  imageUrl: z.string(),
  tags: z.array(z.string()),
  allergens: z.array(z.string()),
  available: z.boolean(),
  popularScore: z.number(),
  caloriesKcal: z.number().nullable(),
  prepTimeMinutes: z.number().nullable(),
});

export type MenuItemDto = z.infer<typeof MenuItemDtoSchema>;

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const AddCartItemRequestSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive().max(20).default(1),
  specialInstructions: z.string().max(200).optional(),
  addedBy: z.string().min(1).max(50),
});
export type AddCartItemRequest = z.infer<typeof AddCartItemRequestSchema>;

export const UpdateCartItemRequestSchema = z.object({
  quantity: z.number().int().positive().max(20).optional(),
  specialInstructions: z.string().max(200).nullable().optional(),
  expectedVersion: z.number().int().nonnegative(),
});
export type UpdateCartItemRequest = z.infer<typeof UpdateCartItemRequestSchema>;

export const CartItemDtoSchema = z.object({
  id: z.string().uuid(),
  menuItem: MenuItemDtoSchema,
  quantity: z.number().int().positive(),
  specialInstructions: z.string().nullable(),
  addedBy: z.string(),
  version: z.number().int(),
  lineSubtotal: z.number(),
  createdAt: z.string(),
});

export const CartDtoSchema = z.object({
  sessionId: z.string().uuid(),
  tableId: z.string(),
  items: z.array(CartItemDtoSchema),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
});
export type CartDto = z.infer<typeof CartDtoSchema>;

// ---------------------------------------------------------------------------
// AI Chat
// ---------------------------------------------------------------------------

export const AiChatRequestSchema = z.object({
  text: z.string().min(1).max(500),
  displayName: z.string().min(1).max(50),
});
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

export const AiChatResponseSchema = z.object({
  messageId: z.string().uuid(),
  streamUrl: z.string(),
});
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export const SendOtpRequestSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Invalid E.164 phone'),
});
export type SendOtpRequest = z.infer<typeof SendOtpRequestSchema>;

export const VerifyOtpRequestSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/),
  code: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});
export type VerifyOtpRequest = z.infer<typeof VerifyOtpRequestSchema>;

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export const PlaceOrderRequestSchema = z.object({
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().regex(/^\+?[1-9]\d{6,14}$/),
  otpToken: z.string().min(1), // server-issued opaque token after verify
});
export type PlaceOrderRequest = z.infer<typeof PlaceOrderRequestSchema>;

export const OrderDtoSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
  subtotalAmount: z.number(),
  taxAmount: z.number(),
  totalAmount: z.number(),
  estimatedWaitMinutes: z.number().int().nullable(),
  items: z.array(
    z.object({
      menuItemId: z.string().uuid(),
      name: z.string(),
      price: z.number(),
      quantity: z.number(),
      specialInstructions: z.string().nullable(),
    }),
  ),
  createdAt: z.string(),
  /** Long-term memory signal — 1 for first visit, 2+ for return diners. */
  visitCount: z.number().int().positive().default(1),
  isReturnVisit: z.boolean().default(false),
});
export type OrderDto = z.infer<typeof OrderDtoSchema>;
