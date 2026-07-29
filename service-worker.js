const CACHE_NAME = 'keyron-shell-v1.0.F-r7-compat';
const CSP = "default-src 'self'; script-src 'self' https://accounts.google.com; connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://api.pwnedpasswords.com; img-src 'self' data: blob:; style-src 'self'; style-src-attr 'unsafe-inline'; frame-src https://accounts.google.com blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; worker-src 'self'; manifest-src 'self'; upgrade-insecure-requests";
const SHELL = [
  './',
  './index.html',
  './css/style.css?v=1.0.F-r6',
  './js/frame-guard.js?v=1.0.F-r6',
  './js/config.js?v=1.0.F-r6',
  './js/crypto.js?v=1.0.F-r7-compat',
  './js/storage.js?v=1.0.F-r6',
  './js/save-engine.js?v=1.0.F-r6',
  './js/documents-crypto.js?v=1.0.F-docs-r1',
  './js/documents-cache.js?v=1.0.F-docs-r1',
  './js/documents-worker.js?v=1.0.F-docs-r1',
  './js/vault.js?v=1.0.F-r6',
  './js/generator.js?v=1.0.F-r6',
  './js/breach-check.js?v=1.0.F-r6',
  './js/drive.js?v=1.0.F-r6',
  './js/biometric.js?v=1.0.F-r6',
  './js/offline-access.js?v=1.0.F-r6',
  './js/documents.js?v=1.0.F-docs-r1',
  './js/app.js?v=1.0.F-r6',
  './manifest.json?v=1.0.F-r6',
  './assets/keyron-logo.png',
  './assets/keyron-wordmark.png',
  './assets/keyron-watermark.png',
  './assets/keyron-mark.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

const SHELL_URLS = new Set(SHELL.map((resource) => new URL(resource, self.location.href).href));

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

function harden(response, navigation = false) {
  if (!response || response.type === 'opaque' || response.type === 'opaqueredirect') return response;
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (navigation) {
    headers.set('Content-Security-Policy', CSP);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), publickey-credentials-create=(self), publickey-credentials-get=(self)');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function unavailable() {
  return new Response('Recurso indisponível offline.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'X-Content-Type-Options': 'nosniff' }
  });
}

async function networkFirst(request, navigation = false) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      if (navigation) await cache.put('./index.html', response.clone());
      else if (SHELL_URLS.has(request.url)) await cache.put(request, response.clone());
    }
    return harden(response, navigation);
  } catch {
    if (!navigation && SHELL_URLS.has(request.url)) {
      const cached = await caches.match(request, { ignoreSearch: false });
      if (cached) return harden(cached, false);
    }
    if (navigation) {
      const fallback = await caches.match('./index.html');
      if (fallback) return harden(fallback, true);
    }
    return unavailable();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return harden(cached);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok && SHELL_URLS.has(request.url)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return harden(response);
  } catch {
    return unavailable();
  }
}

async function networkOnly(request) {
  try { return harden(await fetch(request, { cache: 'no-store' })); }
  catch { return unavailable(); }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const navigation = event.request.mode === 'navigate';
  if (navigation) {
    event.respondWith(networkFirst(event.request, true));
    return;
  }
  if (!SHELL_URLS.has(event.request.url)) {
    event.respondWith(networkOnly(event.request));
    return;
  }
  const code = url.pathname.endsWith('.html') || url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') || url.pathname.endsWith('manifest.json');
  event.respondWith(code ? networkFirst(event.request, false) : cacheFirst(event.request));
});
