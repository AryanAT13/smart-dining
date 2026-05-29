/**
 * Identity store — the diner's display name and the table/session they
 * landed on. Persisted to localStorage so a refresh doesn't lose context.
 *
 * Display name is asked for once on landing (default: "Guest") and used
 * everywhere: cart attribution, group banner, AI greetings, socket auth.
 */

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface IdentityState {
  displayName: string;
  tableId: string | null;
  sessionId: string | null;
  hasOnboarded: boolean;
  setDisplayName: (name: string) => void;
  setTable: (tableId: string, sessionId: string) => void;
  clearOnboarding: () => void;
}

const STORAGE_KEY = 'sda:identity:v1';

export const useIdentityStore = create<IdentityState>()(
  persist(
    (set) => ({
      displayName: 'Guest',
      tableId: null,
      sessionId: null,
      hasOnboarded: false,
      setDisplayName: (name) =>
        set({
          displayName: name.trim().slice(0, 50) || 'Guest',
          hasOnboarded: true,
        }),
      setTable: (tableId, sessionId) => set({ tableId, sessionId }),
      clearOnboarding: () => set({ hasOnboarded: false }),
    }),
    { name: STORAGE_KEY, partialize: (s) => ({ displayName: s.displayName, hasOnboarded: s.hasOnboarded }) },
  ),
);
