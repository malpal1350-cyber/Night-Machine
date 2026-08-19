// Night Sound Machine — Service Worker
// Strategy: network-first with cache fallback.
// All app assets are cached on first load; subsequent visits work offline.

const CACHE = 'nsm-v2';

self.addEventListener('install', () => {
  // Activate immediately — don't wait for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Remove any caches from old versions.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept same-origin GET requests.
  // Audio blob URLs (URL.createObjectURL) are also same-origin but are not
  // cacheable/necessary — exclude them.
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.protocol === 'blob:'
  ) {
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        // Try the network first so the app always gets the latest build.
        const response = await fetch(event.request);
        if (response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        // Network unavailable — serve from cache.
        const cached = await cache.match(event.request);
        if (cached) return cached;
        // Nothing in cache either — return a minimal offline response.
        return new Response('Offline — open the app while connected first.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })
  );
});
