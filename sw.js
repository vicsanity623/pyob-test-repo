const CACHE_NAME = 'poke-cache-v1.2.36';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './game.js',
    './effects.js',
    './global.js',
    './inventory.js',
    './battle.js'
];
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((oldCache) => {
                    if (oldCache !== CACHE_NAME) {
                        console.log(`Deleting old cache: ${oldCache}`);
                        return caches.delete(oldCache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});
