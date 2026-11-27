const PREFIX = 'solar-system-';
const CACHE = PREFIX + 'v1';
const scope = new URL(self.registration.scope);

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
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
  if (path.startsWith('live/')) return;
  const cacheFirst = /^(textures|data|vendor)\//.test(path);
  if (!cacheFirst && request.mode !== 'navigate' && !/\.(html|js|css)$/.test(path)) return;

  const cache = caches.open(CACHE).catch(() => null);
  const cached = cache.then((c) => c?.match(request)).catch(() => undefined);
  const network = () => fetch(request).then((response) => ({ response, copy: response.ok ? response.clone() : null }));
  const fresh = cacheFirst ? cached.then((hit) => hit ? null : network()) : network();

  event.respondWith(cached.then((hit) => hit || fresh.then(({ response }) => response)));
  event.waitUntil(Promise.all([cache, fresh]).then(([c, result]) => {
    if (c && result?.copy) return c.put(request, result.copy);
  }).catch(() => {}));
});
