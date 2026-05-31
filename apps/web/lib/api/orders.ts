import { api } from './client';

export interface SessionOrderSummary {
  id: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  estimatedWaitMinutes: number | null;
  createdAt: string;
  itemCount: number;
  items: Array<{
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    specialInstructions: string | null;
  }>;
}

export function fetchSessionOrders(
  sessionId: string,
): Promise<{ orders: SessionOrderSummary[] }> {
  return api(`/api/session/${sessionId}/orders`);
}

export const sessionOrdersKey = (sessionId: string) =>
  ['session-orders', sessionId] as const;

/** Per-table orders across a 6-hour window — survives session resets. */
export function fetchTableOrders(
  tableId: string,
): Promise<{ orders: SessionOrderSummary[] }> {
  return api(`/api/table/${encodeURIComponent(tableId)}/orders`);
}

export const tableOrdersKey = (tableId: string) =>
  ['table-orders', tableId] as const;
