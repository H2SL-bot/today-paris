// today.paris — service worker (appli installable, chargements rapides, hors-ligne léger).
// On ne cache QUE le même-origine ; l'Open Data, OpenStreetMap, les tuiles et le "cerveau"
// (autres origines) passent toujours par le réseau, et les envois (POST) ne sont jamais mis en cache.
const CACHE = "today-paris-v25";
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

const putInCache = (req, res) => {
  if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
};

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return; // laisser passer les POST (mesure des clics)
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API / OSM / tuiles / cerveau : réseau direct

  // Les PAGES HTML (coquille) : réseau d'abord → contenu toujours frais, repli cache hors-ligne.
  const isHTML = e.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  if (isHTML) {
    e.respondWith(fetch(e.request).then((res) => putInCache(e.request, res)).catch(() => caches.match(e.request)));
    return;
  }

  // Les GROS FICHIERS statiques (venues.json ~2-3 Mo, events.json, moteur, Leaflet…) sont
  // VERSIONNÉS par le nom du cache : « cache d'abord », sans re-téléchargement à chaque visite.
  // Un nouveau déploiement bumpe CACHE → l'ancien cache est purgé, les fichiers se re-chargent une fois.
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => putInCache(e.request, res))));
});
