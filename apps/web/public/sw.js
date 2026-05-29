/**
 * Minimal service worker — runtime cache for the menu JSON only.
 *
 * Cache strategy:
 *   - /api/menu              → stale-while-revalidate (offline view of the menu)
 *   - everything else        → passthrough
 *
 * We intentionally do NOT cache /api/session/* or /api/order/* because they
 * have user-specific state. Caching cart endpoints would create stale-UI
 * bugs that aren't worth the perceived speed.
 */

const CACHE_NAME = 'zaika-menu-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (!url.pathname.startsWith('/api/menu')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);

      const networkPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone()).catch(() => undefined);
          return response;
        })
        .catch(() => cached);

      return cached ?? networkPromise;
    })(),
  );
});
