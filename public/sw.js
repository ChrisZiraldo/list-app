// Minimal service worker: no offline caching, just enough presence to satisfy
// "add to home screen" installability checks (Chrome/Android requires a controlling
// SW with a fetch handler). Falls through to a normal network fetch every time.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
