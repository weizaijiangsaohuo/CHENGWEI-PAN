/* Starflow offline fallback. Strict public-shell cache: never retain account HTML, API, Supabase, or private data. */
'use strict';
const CACHE = 'starflow-public-shell-v1';
const OFFLINE_PATH = '/offline';
const PUBLIC_FILES = [
  OFFLINE_PATH,
  '/starflow-mail-logo.png',
  '/starflow-official-mark.webp',
  '/manifest.webmanifest'
];
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(PUBLIC_FILES.map(async (path) => {
      const response = await fetch(path, {credentials:'omit', cache:'reload', redirect:'error'});
      if (response.ok && response.type === 'basic') await cache.put(path, response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('starflow-public-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
const isPublicStatic = (url) => url.pathname.startsWith('/_next/static/')
  || url.pathname === '/starflow-mail-logo.png'
  || url.pathname === '/starflow-official-mark.webp'
  || url.pathname === '/manifest.webmanifest';
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Always fetch page HTML fresh. On failure return a wholly generic offline page.
    event.respondWith(fetch(request).catch(async () =>
      (await caches.open(CACHE)).match(OFFLINE_PATH) ||
      new Response('Starflow 暂时离线，请联网后重试。', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}})
    ));
    return;
  }
  if (!isPublicStatic(url)) return; // No /api, /auth, Supabase, photos, RSC or personal pages.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  })());
});
