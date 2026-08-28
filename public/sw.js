const CACHE_NAME = "exchange-companion-v2-11";
const NAVIGATION_FALLBACK = "/__offline-notebook-shell__";
const NAVIGATION_NETWORK_TIMEOUT_MS = 1_500;
const APP_SHELL = ["/manifest.webmanifest", "/icons/exchange-48.png", "/icons/exchange-192.png", "/icons/exchange-512.png", "/icons/apple-touch-icon.png", "/images/doodle-icons-v2/home-notebook.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);

    // Seed a public, server-rendered launch shell. Private account data is still
    // loaded by Supabase only after the page starts and the session is verified.
    const shellRequest = new Request(new URL("/", self.location.origin), {
      cache: "no-store",
      credentials: "omit",
    });
    const shellResponse = await fetch(shellRequest);
    if (!shellResponse.ok) throw new Error("Unable to cache the public launch shell");
    await cache.put(NAVIGATION_FALLBACK, shellResponse);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all([
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      self.registration.navigationPreload?.enable(),
    ]);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    const networkResponse = (async () => {
      const preloadResponse = await event.preloadResponse;
      const response = preloadResponse ?? await fetch(request);
      return response;
    })();

    event.waitUntil(networkResponse.then(async (response) => {
      if (response?.ok) {
        await caches.open(CACHE_NAME).then((cache) => cache.put(NAVIGATION_FALLBACK, response.clone()));
      }
    }).catch(() => undefined));

    event.respondWith((async () => {
      let timeoutId;
      const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(undefined), NAVIGATION_NETWORK_TIMEOUT_MS);
      });
      const fastResponse = await Promise.race([networkResponse.catch(() => undefined), timeout]);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (fastResponse) return fastResponse;

      const cachedShell = await caches.match(NAVIGATION_FALLBACK);
      if (cachedShell) return cachedShell;

      try {
        return await networkResponse;
      } catch {
        return new Response("<!doctype html><html lang=\"zh-Hant\"><meta name=\"viewport\" content=\"width=device-width\"><title>交換手帳暫時離線</title><body style=\"margin:0;display:grid;min-height:100vh;place-content:center;background:#f7f3eb;color:#303231;font-family:system-ui;text-align:center\"><main><h1>目前暫時離線</h1><p>網路恢復後，重新開啟交換手帳即可。</p></main></body></html>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }

  const immutableAsset = url.pathname.startsWith("/_next/static/");
  const refreshableAsset = url.pathname === "/manifest.webmanifest"
    || url.pathname === "/_next/image"
    || /^\/(?:icons|images)\//.test(url.pathname);
  if (!immutableAsset && !refreshableAsset) return;

  if (immutableAsset) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const fresh = fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    });
    if (cached) {
      event.waitUntil(fresh.catch(() => undefined));
      return cached;
    }
    return fresh;
  })());
});
