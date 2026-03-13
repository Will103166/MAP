const CACHE_NAME = "online-map-pwa-v2";
const APP_SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "CLEAR_CACHE_AND_RELOAD") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => self.skipWaiting())
        .then(() => self.clients.claim())
        .then(() =>
          self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            clients.forEach((client) => client.navigate(client.url));
          })
        )
    );
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(async () => {
          const fallback = await caches.match("./index.html");
          return fallback || Response.error();
        });
    })
  );
});
