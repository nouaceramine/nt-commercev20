/* Self-destructing service worker.
   The previous worker cached index.html and the JS bundle, so after each
   redeploy browsers kept loading deleted assets and showed a blank page.
   This worker clears every cache, unregisters itself, and reloads clients. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});

/* Pass-through: never intercept requests */
self.addEventListener('fetch', () => {});
