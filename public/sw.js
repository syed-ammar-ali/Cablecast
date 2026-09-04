// Cablecast Progressive Web App Service Worker
const CACHE_NAME = "cablecast-v2";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icon.svg",
];

// Install event — precache static shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event — cleanup stale caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event — network-first for pages/APIs, cache-first for immutable static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypass service worker for:
  // 1. Non-GET requests (POST, PUT, DELETE, PATCH)
  // 2. API requests (/api/*)
  // 3. Video streams and HLS segments (.m3u8, .ts, etc.)
  // 4. Third-party domains (TMDB, embed providers)
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.endsWith(".m3u8") ||
    url.pathname.endsWith(".ts") ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Cache-first for local static assets (icons, static fonts, manifest)
  if (
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/logos/") ||
    url.pathname.startsWith("/flags/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Network-first for navigation and pages
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Fallback to home/cached root if offline
        return caches.match("/");
      })
  );
});
