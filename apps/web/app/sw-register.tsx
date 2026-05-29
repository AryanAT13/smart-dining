'use client';

import { useEffect } from 'react';

/**
 * Service worker registration. Dropped into the root layout so it runs once
 * per session. No-op outside production builds to avoid HMR collisions.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silent: not having a SW is a degradation, not an error.
    });
  }, []);

  return null;
}
