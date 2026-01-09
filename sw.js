const CACHE_NAME = kids-todo-pwa-v1;
const ASSETS = [
  .,
  .index.html,
  .style.css,
  .app.js,
  .manifest.webmanifest,
  .iconsicon-192.png,
  .iconsicon-512.png
];

self.addEventListener(install, (event) = {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) = cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener(activate, (event) = {
  event.waitUntil(
    caches.keys().then((keys) =
      Promise.all(keys.map((k) = (k !== CACHE_NAME  caches.delete(k)  null)))
    )
  );
  self.clients.claim();
});

self.addEventListener(fetch, (event) = {
  const req = event.request;

   Cache-first for our app files
  event.respondWith(
    caches.match(req).then((cached) = {
      if (cached) return cached;

      return fetch(req).then((res) = {
         Save a copy of fetched files
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) = cache.put(req, copy));
        return res;
      }).catch(() = caches.match(.index.html));
    })
  );
});
