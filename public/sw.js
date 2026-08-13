const CACHE_NAME = "exchange-companion-v2-3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/exchange-48.png", "/icons/exchange-192.png", "/icons/exchange-512.png", "/icons/apple-touch-icon.png", "/images/doodle-icons/home-safe.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.registration.navigationPreload?.enable(),
  ]).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cached = await caches.match("/");
      const refresh = (async () => {
        const response = await (event.preloadResponse || fetch(request));
        if (response?.ok) {
          const copy = response.clone();
          await caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
        }
        return response;
      })();
      if (cached) {
        event.waitUntil(refresh.catch(() => undefined));
        return cached;
      }
      return (await refresh) || Response.error();
    })());
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
