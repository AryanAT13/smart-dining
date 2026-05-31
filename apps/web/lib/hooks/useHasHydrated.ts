/**
 * Tells you whether the Zustand persist middleware has finished restoring
 * state from localStorage. Server-renders + first client render always
 * return `false`; after the persist rehydration completes, returns `true`.
 *
 * Use this to gate UI that depends on persisted state — without it, the
 * onboarding dialog would briefly open with hasOnboarded=false before
 * snapping closed once hydration replaced it with true.
 */

'use client';

import { useEffect, useState } from 'react';

import { useIdentityStore } from '@/lib/stores/identity';

export function useHasHydrated(): boolean {
  // Initialise from the persist API in case rehydration ran before this
  // hook first mounted (rare but possible during HMR).
  const [hydrated, setHydrated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    // Zustand's persist exposes the hydration state via .persist on the store.
    return Boolean(
      (useIdentityStore as unknown as {
        persist?: { hasHydrated?: () => boolean };
      }).persist?.hasHydrated?.(),
    );
  });

  useEffect(() => {
    const store = useIdentityStore as unknown as {
      persist?: { onFinishHydration?: (cb: () => void) => () => void; hasHydrated?: () => boolean };
    };
    if (store.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }
    const unsubscribe = store.persist?.onFinishHydration?.(() => setHydrated(true));
    return unsubscribe;
  }, []);

  return hydrated;
}
