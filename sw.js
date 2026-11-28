const PREFIX = 'solar-system-';
const CACHE = PREFIX + 'v2';
const scope = new URL(self.registration.scope);
const SHELL = [
  './', './index.html', './style.css', './src/main.js', './src/ephemeris.js', './src/iss.js', './src/milkyway.js', './src/earth-tiles.js',
  './vendor/three.module.js', './vendor/astronomy.js', './vendor/satellite.es.js', './data/sky.json',
  './textures/2k/earth_day_01.jpg',
];

self.addEventListener('install', (event) => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL.map((path) => new Request(new URL(path, scope), { cache: 'reload' })));
  await self.skipWaiting();
})()));
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const path = url.pathname.slice(scope.pathname.length);
  if (path.startsWith('live/') || path === 'data/asteroids.json'
    || (path === 'data/asteroids.bin' && url.searchParams.has('v'))) return;
  const cacheFirst = /^(textures|data|vendor)\//.test(path);
  if (!cacheFirst && request.mode !== 'navigate' && !/\.(html|js|css)$/.test(path)) return;

  const cache = caches.open(CACHE).catch(() => null);
  const cached = cache.then((c) => c?.match(request)).catch(() => undefined);
  const network = () => fetch(request).then((response) => ({ response, copy: response.ok ? response.clone() : null }));
  const fresh = cacheFirst ? cached.then((hit) => hit ? null : network()) : network();

  const response = cached.then((hit) => hit || fresh.then((result) => result.response));
  const texture = path.startsWith('textures/') && request.destination === 'image';
  event.respondWith(texture ? response.catch(async () => {
    if (/^textures\/(2k\/)?earth_day_\d\d\.jpg$/.test(path)) {
      const fallback = await (await cache)?.match(new URL('./textures/2k/earth_day_01.jpg', scope));
      if (fallback) return fallback;
    }
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path fill="#687083" d="M0 0h1v1H0z"/></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } },
    );
  }) : response);
  event.waitUntil(Promise.all([cache, fresh]).then(([c, result]) => {
    if (c && result?.copy) return c.put(request, result.copy);
  }).catch(() => {}));
});
