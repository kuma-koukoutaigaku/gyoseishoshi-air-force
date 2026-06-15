const CACHE_VERSION = 'v24';
const CACHE_NAME = `af-cache-${CACHE_VERSION}`;

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    // 同一オリジンのリクエストのみ処理、外部APIはスルー
    if (!event.request.url.startsWith(self.location.origin)) return;
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
