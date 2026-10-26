/* Offline shell for intake. The app holds no remote data, so every asset it needs is
   precached, and served from the network whenever the network answers in time - the
   copy kept here is for when it does not. */

/* v3 — v2 served the cache first and only fetched the new version in the background,
   for next time. So the first launch after any deploy was always the old app, and a
   page added to the Home Screen straight after a deploy was added as the old page -
   with the old status-bar setting baked into the icon. Now the network goes first, and
   the cache is the fallback: offline, or slower than NET_WAIT. */

/* v2 — v1 served navigations straight from the cache, and the host redirects
   /index.html to /, so what it had cached was a *redirected* response. WebKit refuses
   one of those for a navigation outright ("Response served by service worker has
   redirections"), which bricked the app on its second launch. Two defences below:
   every response is rebuilt from its body before it is stored or served, which drops
   the redirect flag, and navigations are answered from one fixed key instead of
   whatever path the browser happened to ask for. */

const VERSION = 'intake-v3';

// How long the network gets before the copy kept here is used instead. The fetch carries
// on regardless, so a slow connection still leaves the newer copy for the next launch.
const NET_WAIT = 2500;

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

async function serve(key, req) {
  const cache = await caches.open(VERSION);
  // Always asked of the network, with the browser's own cache only allowed to answer once
  // the server has said nothing changed.
  const net = fetch(req || key, { cache: 'no-cache' }).then(async res => {
    if (res && res.ok) await store(cache, key, res.clone());
    return res;
  });
  net.catch(() => {});          // a failure is answered below; it is not an error to report
  let timer;
  const late = new Promise(resolve => { timer = setTimeout(resolve, NET_WAIT, null); });
  try {
    const res = await Promise.race([net, late]);
    clearTimeout(timer);
    if (res && res.ok) return plain(res);
  } catch (e) { /* offline: fall through to the copy */ }
  const hit = await cache.match(key);
  if (hit) return plain(hit);
  // Nothing kept and nothing yet: wait for the network after all.
  return plain(await net);
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
