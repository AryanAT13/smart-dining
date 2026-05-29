import type { MenuItemView } from '../menu/types.js';

export interface CartLine {
  id: string;
  menuItem: MenuItemView;
  quantity: number;
  specialInstructions: string | null;
  addedBy: string;
  version: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartView {
  sessionId: string;
  tableId: string;
  items: CartLine[];
  subtotal: number;
  tax: number;
  total: number;
}

export interface AddItemInput {
  sessionId: string;
  menuItemId: string;
  quantity: number;
  addedBy: string;
  specialInstructions?: string;
}

export interface UpdateItemInput {
  cartItemId: string;
  expectedVersion: number;
  quantity?: number;
  specialInstructions?: string | null;
}
