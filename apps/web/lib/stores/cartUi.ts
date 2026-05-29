/**
 * Cart UI store — drawer open state, last-action animation triggers, the
 * "Priya updated this item" toast flag, etc.
 *
 * The cart DATA lives in TanStack Query (key: cartKeys.forSession). This
 * store handles only the things React Query shouldn't (ephemeral UI state).
 */

'use client';

import { create } from 'zustand';

interface CartUiState {
  isOpen: boolean;
  lastAddedAt: number;
  setOpen: (open: boolean) => void;
  flashAdd: () => void;
}

export const useCartUiStore = create<CartUiState>((set) => ({
  isOpen: false,
  lastAddedAt: 0,
  setOpen: (open) => set({ isOpen: open }),
  flashAdd: () => set({ lastAddedAt: Date.now() }),
}));
