/* Offline shell for countcal. The app holds no remote data, so every asset it needs is
   precached and served cache-first; a background revalidate picks up new deploys. */

const VERSION = 'countcal-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './fonts.css',
  './app.js',
  './manifest.webmanifest',
  './fonts/Archivo.woff2',
  './fonts/BigShouldersDisplay-800.woff2',
  './fonts/IBMPlexMono-600.woff2',
  './fonts/Orbitron-900.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  // Added one at a time: a host that will not serve './' as a directory index should not
  // take the whole precache down with it.
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});
