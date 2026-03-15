const CACHE_NAME = 'pizza-cache-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/api.js',
    '/js/ui.js',
    '/js/cart.js',
    '/js/main.js' // We just cache common js files we might use
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            // Using addAll might fail if a file doesn't exist, mapping to individual add to be safe
            return Promise.allSettled(
                STATIC_ASSETS.map(url => cache.add(url).catch(err => console.warn('[SW] Mock missing asset:', url)))
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Strategy: Network First, fallback to Cache for API requests
    // Treat any request with /api/ or any request matching the external Render backend exactly like an API request.
    if (url.pathname.startsWith('/api/') || url.hostname.includes('onrender.com') || url.port === '5000') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Cache successful API responses (especially menu)
                    if (response.ok && event.request.method === 'GET' && event.request.url.startsWith('http')) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if network fails
                    return caches.match(event.request);
                })
        );
    } 
    // Strategy: Cache First, fallback to Network for static assets
    else {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse; // Return from cache
                }
                
                // Fetch from network if not in cache
                return fetch(event.request).then((networkResponse) => {
                    // Cache the new resource for future
                    if (networkResponse.ok && event.request.method === 'GET' && event.request.url.startsWith('http')) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // You might return an offline.html here if you have one
                    // return caches.match('/offline.html');
                });
            })
        );
    }
});
