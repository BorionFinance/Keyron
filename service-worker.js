// service-worker.js — cacheia só os arquivos do app (o "shell"), pra abrir
// offline. Os dados do cofre (cifrados) vivem no localStorage, não aqui.

const CACHE_NAME = 'borion-senhas-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/crypto.js',
  './js/vault.js',
  './js/generator.js',
  './js/drive.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cacheia chamadas de API (Google Drive, autenticação, fontes) — só o shell local.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => caches.match('./index.html'));
    })
  );
});
