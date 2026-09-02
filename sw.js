// Stamped by "npm run stamp" with a hash of every precached file. "npm run
// validate" fails when it is stale, because an unchanged service worker keeps
// serving the old code from cache and app changes never reach the device.
const BUILD = 'ba0adbd3cc';
const CACHE = 'es-trainer-' + BUILD;

const DECK_INDEX = './data/decks/index.json';

// Everything the app ships except the decks themselves. The deck list is read
// out of the deck index at install time, so registering a deck in
// data/decks/index.json is all it takes to have it cached for offline use, and
// this file never has to be touched to add content. "npm run validate" and
// "npm run stamp" expand the same index, so the build hash still covers every
// deck: edit a deck and the cache name changes like any other shipped file.
const SHELL = [
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
  DECK_INDEX
];

// The index is precached itself, so a worker that starts up offline can still
// tell which decks to expect from the copy the last install left behind. On a
// first install there is nothing cached and only the network can answer.
async function deckIndex(preferNetwork) {
  if (preferNetwork) {
    try {
      const res = await fetch(DECK_INDEX, { cache: 'reload' });
      if (res.ok) return await res.json();
    } catch (err) { /* offline: fall through to whatever is cached */ }
  }
  const hit = await caches.match(DECK_INDEX, { ignoreSearch: true });
  if (!hit) return null;
  try {
    return await hit.json();
  } catch (err) {
    return null;
  }
}

// A deck that is registered but unreachable drops out of the list rather than
// failing the whole resolution: the install then reports fewer cached files,
// which is exactly what the offline badge is for.
async function assetList(preferNetwork) {
  const index = await deckIndex(preferNetwork);
  const decks = index && Array.isArray(index.decks)
    ? index.decks.filter((deck) => deck && deck.file).map((deck) => './data/decks/' + deck.file)
    : [];
  return SHELL.concat(decks.filter((url) => !SHELL.includes(url)));
}

// Cache each asset on its own so one bad path cannot fail the whole install and
// leave the app with nothing offline. The status message reports what landed.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Costs one extra request for the index, which cache.add fetches again
    // below. Cheap once per install, and it keeps the list in one place.
    const assets = await assetList(true);
    await Promise.all(assets.map(async (url) => {
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
    // Cache only: a status check must not depend on the network. Until the
    // index itself is cached the deck files are unknown, but the index is in
    // SHELL, so that case already counts as incomplete rather than ready.
    const assets = await assetList(false);
    let cached = 0;
    for (const url of assets) {
      const hit = await cache.match(url, { ignoreSearch: true });
      if (hit) cached += 1;
    }
    port.postMessage({ cached, total: assets.length, version: BUILD });
  })());
});
