const CACHE_NAME = "xiangkou-mahjong-v2";
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const scopedPath = (path) => `${SCOPE_PATH}${path}`.replace(/\/{2,}/g, "/");
const CORE_ASSETS = [
  scopedPath(""),
  scopedPath("index.html"),
  scopedPath("manifest.webmanifest"),
  scopedPath("icons/icon.svg"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(scopedPath(""), copy.clone());
            cache.put(scopedPath("index.html"), copy);
          });
          return response;
        })
        .catch(() => caches.match(scopedPath("index.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(scopedPath("index.html")));
    }),
  );
});
