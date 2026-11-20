/* E2: offline-capable service worker — safe update strategy.
   Replaces the old self-destructing worker. The blank-page bug that led to its
   removal came from serving a CACHED index.html while online. This worker
   never does that:
   - navigations (index.html): NETWORK-FIRST; cache copy only as offline fallback
   - /static/** hashed assets: CACHE-FIRST (content-hashed = immutable, safe
     forever; deploys never delete old chunks from the docroot)
   - /api/** and everything else: network-only, never cached */

const HTML_CACHE = 'nt-html-v1';
const STATIC_CACHE = 'nt-static-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => ![HTML_CACHE, STATIC_CACHE].includes(n)).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API calls: never cache
  if (url.pathname.startsWith('/api/')) return;

  // Hashed static assets: cache-first (immutable by content hash)
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Navigations + root-level files (index.html, manifest…): network-first,
  // cached copy only as offline fallback — a fresh deploy always wins online.
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(HTML_CACHE);
            cache.put('/index.html', res.clone());
          }
          return res;
        } catch (e) {
          const cache = await caches.open(HTML_CACHE);
          const offline = await cache.match('/index.html');
          if (offline) return offline;
          throw e;
        }
      })()
    );
    return;
  }
});
