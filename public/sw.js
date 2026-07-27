const CACHE_NAME = "xiangkou-mahjong-v4";
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const scopedPath = (path) => `${SCOPE_PATH}${path}`.replace(/\/{2,}/g, "/");
const TILE_ASSET_NAMES = [
  "back",
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
  "p1",
  "p2",
  "p3",
  "p4",
  "p5",
  "p6",
  "p7",
  "p8",
  "p9",
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "east",
  "south",
  "west",
  "north",
  "red",
  "green",
  "white",
];
const CORE_ASSETS = [
  scopedPath(""),
  scopedPath("index.html"),
  scopedPath("manifest.webmanifest"),
  scopedPath("icons/icon.svg"),
  ...TILE_ASSET_NAMES.map((name) => scopedPath(`tiles/${name}.svg`)),
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
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(scopedPath("api/"))) {
    event.respondWith(fetch(event.request));
    return;
  }

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
