const CACHE_NAME = 'keyron-shell-v0.2.1';
const SHELL = [
  './',
  './index.html',
  './css/style.css?v=0.2.1',
  './js/crypto.js?v=0.2.1',
  './js/storage.js?v=0.2.1',
  './js/vault.js?v=0.2.1',
  './js/generator.js?v=0.2.1',
  './js/drive.js?v=0.2.1',
  './js/app.js?v=0.2.1',
  './manifest.json?v=0.2.1',
  './assets/keyron-logo.png',
  './assets/keyron-mark.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok && !request.url.includes('/js/config.js')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match('./index.html'));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isCodeOrDocument = event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('manifest.json');

  event.respondWith(isCodeOrDocument ? networkFirst(event.request) : cacheFirst(event.request));
});
