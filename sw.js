// Stamped by "npm run stamp" with a hash of every precached file. "npm run
// validate" fails when it is stale, because an unchanged service worker keeps
// serving the old code from cache and app changes never reach the device.
const BUILD = 'd7ceace8e6';
const CACHE = 'es-trainer-' + BUILD;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/srs.js',
  './js/content.js',
  './js/drills.js',
  './js/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './data/decks/index.json',
  './data/decks/verbs.json',
  './data/decks/people.json',
  './data/decks/food.json',
  './data/decks/travel.json',
  './data/decks/home.json',
  './data/decks/time.json',
  './data/decks/adjectives.json',
  './data/decks/phrases.json',
  './data/decks/shopping.json',
  './data/decks/health.json',
  './data/decks/work.json',
  './data/decks/weather.json',
  './data/decks/connectors.json',
  './data/decks/sentences.json',
  './data/decks/conjugations.json'
];

// Cache each asset on its own so one bad path cannot fail the whole install and
// leave the app with nothing offline. The status message reports what landed.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) { /* reported through the status message instead */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Code and markup are fetched network-first, data and icons cache-first.
// Cache-first for everything was the original design and it was wrong: an
// installed app kept serving last week's JavaScript for as long as the worker
// itself was unchanged, so fixes never reached the device. Online now means
// current; the cache is still the complete offline fallback.
const CODE = /\.(?:html|js|css|webmanifest)$/;
const NETWORK_TIMEOUT = 3000;

function offline() {
  return new Response('Offline and not cached.', {
    status: 504,
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Airport wifi that accepts the connection but never answers is worse than no
// wifi at all, so give the network a deadline and then fall back to the cache.
function withTimeout(request) {
  return Promise.race([
    fetch(request).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT))
  ]);
}

async function fromCache(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  if (request.mode === 'navigate') {
    const shell = await caches.match('./index.html', { ignoreSearch: true });
    if (shell) return shell;
  }
  return null;
}

async function store(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

async function networkFirst(request) {
  const response = await withTimeout(request);
  if (response && response.ok) {
    await store(request, response);
    return response;
  }
  const hit = await fromCache(request);
  if (hit) return hit;
  return response || offline();
}

async function cacheFirst(request) {
  const hit = await fromCache(request);
  if (hit) return hit;
  const response = await withTimeout(request);
  if (response) {
    await store(request, response);
    return response;
  }
  return offline();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isCode = request.mode === 'navigate' || CODE.test(url.pathname);
  event.respondWith(isCode ? networkFirst(request) : cacheFirst(request));
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'status') return;
  const port = event.ports && event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let cached = 0;
    for (const url of ASSETS) {
      const hit = await cache.match(url, { ignoreSearch: true });
      if (hit) cached += 1;
    }
    port.postMessage({ cached, total: ASSETS.length, version: BUILD });
  })());
});
