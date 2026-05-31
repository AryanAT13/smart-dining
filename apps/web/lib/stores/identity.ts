/**
 * Identity store — the diner's display name and the table/session they
 * landed on. Persisted to localStorage so a refresh doesn't lose context.
 *
 * `hasOnboarded` is the END-OF-FLOW flag — it flips to true only when
 * `completeOnboarding()` is called explicitly (after the vibe step).
 * Setting the display name on its own does NOT flip the flag — that was
 * the bug that made step 2 of onboarding close before it ever rendered.
 */

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface IdentityState {
  displayName: string;
  tableId: string | null;
  sessionId: string | null;
  hasOnboarded: boolean;
  /** Step 1 — name only. Does NOT flip hasOnboarded. */
  setDisplayName: (name: string) => void;
  /** Step 2 — close the onboarding flow. Idempotent. */
  completeOnboarding: () => void;
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
        set({ displayName: name.trim().slice(0, 50) || 'Guest' }),
      completeOnboarding: () => set({ hasOnboarded: true }),
      setTable: (tableId, sessionId) => set({ tableId, sessionId }),
      clearOnboarding: () => set({ hasOnboarded: false, displayName: 'Guest' }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ displayName: s.displayName, hasOnboarded: s.hasOnboarded }),
    },
  ),
);
