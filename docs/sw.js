// today.paris — service worker (appli installable, chargements rapides, hors-ligne léger).
// On ne cache QUE le même-origine ; l'Open Data, OpenStreetMap, les tuiles et le "cerveau"
// (autres origines) passent toujours par le réseau, et les envois (POST) ne sont jamais mis en cache.
const CACHE = "today-paris-v2";
const SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/config.js", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return; // laisser passer les POST (mesure des clics)
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API / OSM / tuiles / cerveau : réseau direct

  // Même origine : on répond depuis le cache si dispo, et on rafraîchit en arrière-plan.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
