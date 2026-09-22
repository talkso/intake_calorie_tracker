/* Offline shell for intake. The app holds no remote data, so every asset it needs is
   precached and served cache-first; a background revalidate picks up new deploys. */

/* v2 — v1 served navigations straight from the cache, and the host redirects
   /index.html to /, so what it had cached was a *redirected* response. WebKit refuses
   one of those for a navigation outright ("Response served by service worker has
   redirections"), which bricked the app on its second launch. Two defences below:
   every response is rebuilt from its body before it is stored or served, which drops
   the redirect flag, and navigations are answered from one fixed key instead of
   whatever path the browser happened to ask for. */

const VERSION = 'intake-v2';

// The page itself, under the one key every navigation is answered from. './' is what
// the host serves without a redirect; './index.html' is the same bytes one hop away.
const SHELL = './';

const ASSETS = [
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

// A copy built from the body alone: same bytes, same headers, no redirect flag and no
// memory of how many hops it took to arrive. Consumes the response it is given.
function plain(res) {
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers
  });
}

async function store(cache, key, res) {
  if (res && res.ok) await cache.put(key, plain(res));
}

self.addEventListener('install', event => {
  // Fetched one at a time: a single asset the host will not serve should not take the
  // whole precache down with it.
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all([SHELL, ...ASSETS].map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        await store(cache, url, res);
      } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fire-and-forget: the cached copy has already gone out, this is only so the next
// launch has the newer one.
function revalidate(cache, key) {
  fetch(key, { cache: 'reload' })
    .then(res => store(cache, key, res))
    .catch(() => {});
}

async function serve(key, req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(key);
  if (hit) {
    revalidate(cache, key);
    return plain(hit);
  }
  const res = await fetch(req || key);
  const copy = res.clone();
  await store(cache, key, res);
  return plain(copy);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // One page, one answer. Whatever path a navigation names — '/', '/index.html', a
  // stale start_url — it gets the shell, and it gets it without a redirect.
  if (req.mode === 'navigate') {
    event.respondWith(serve(SHELL).catch(() => caches.match(SHELL).then(hit => hit ? plain(hit) : Response.error())));
    return;
  }

  event.respondWith(serve(req, req).catch(() => Response.error()));
});
