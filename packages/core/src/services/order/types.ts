import type { OrderStatus } from '@prisma/client';

export interface OrderLineView {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  lineSubtotal: number;
  lineTax: number;
  specialInstructions: string | null;
}

export interface OrderView {
  id: string;
  sessionId: string;
  status: OrderStatus;
  customerName: string;
  /** Phone is intentionally redacted in the view; only the last 4 are exposed. */
  customerPhoneMasked: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  estimatedWaitMinutes: number | null;
  items: OrderLineView[];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaceOrderInput {
  sessionId: string;
  customerName: string;
  customerPhone: string;
  otpToken: string;
}
