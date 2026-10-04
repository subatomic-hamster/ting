// Offline shell (spec F7 "works offline"): the app's own files are cached so it loads with no network.
// The engine runs in the browser; the API seam falls back to its in-browser implementation when offline.
const CACHE = 'ting-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/config.js', '/favicon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API and map tiles go straight to the network
  // Pages and settings: network first, so a deploy shows up at once; the cache covers offline.
  if (req.mode === 'navigate' || url.pathname === '/config.js') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? '/index.html' : req, copy));
          return res;
        })
        .catch(() => caches.match(req.mode === 'navigate' ? '/index.html' : req).then((r) => r ?? caches.match('/index.html'))),
    );
    return;
  }
  // Hashed assets and samples: cache first.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
