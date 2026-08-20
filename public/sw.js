const CACHE_NAME = "exchange-companion-v2-9";
const NAVIGATION_FALLBACK = "/__offline-notebook-shell__";
const APP_SHELL = ["/manifest.webmanifest", "/icons/exchange-48.png", "/icons/exchange-192.png", "/icons/exchange-512.png", "/icons/apple-touch-icon.png", "/images/doodle-icons-v2/home-notebook.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const hadOlderNotebookCache = keys.some((key) => key.startsWith("exchange-companion-") && key !== CACHE_NAME);
    await Promise.all([
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      self.registration.navigationPreload?.enable(),
    ]);
    await self.clients.claim();
    if (!hadOlderNotebookCache) return;
    const windows = await self.clients.matchAll({ type: "window" });
    await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await (event.preloadResponse || fetch(request));
        if (response?.ok) {
          const copy = response.clone();
          await caches.open(CACHE_NAME).then((cache) => cache.put(NAVIGATION_FALLBACK, copy));
        }
        return response;
      } catch {
        return (await caches.match(NAVIGATION_FALLBACK)) || Response.error();
      }
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
