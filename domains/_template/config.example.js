// domains/_template/config.example.js
// MODÈLE pour créer un nouveau domaine (visitwine.com, lacanau.surf, thalasso…).
//
// Pour lancer un nouveau site :
//   1. Copier ce dossier :  domains/_template  ->  domains/visitwine.com
//   2. Renommer ce fichier en  config.js
//   3. Adapter : envies (moods), catégories, quartiers/zones, textes, sources.
//   4. Fournir une source de données (fichier démo, puis API réelle).
//   5. Lancer :  DOMAIN=visitwine.com npm start
//
// Le MOTEUR (dossier engine/), la COUCHE DONNÉES (data/) et la BOUCLE (loop/)
// ne changent pas. Seul ce fichier + les données changent.

export default {
  domain: "exemple.com",
  title: "exemple.com",
  tagline: "Décrivez la promesse du site ici.",
  city: {
    label: "Ville",
    center: { lat: 0, lng: 0 },       // point de repli si pas de position
    timezone: "Europe/Paris",          // fuseau pour "ouvert maintenant" et les dates de validité
    bounds: { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 }, // zone couverte (géoloc) — à resserrer
  },

  sources: [
    // Démarrer avec un fichier de démonstration CLAIREMENT marqué demo:true,
    { type: "file", name: "demo", path: "offers.demo.json", demo: true },
    // puis brancher une source réelle (adaptateur à ajouter dans data/source.js) :
    // { type: "http", name: "billetterie", url: "https://api.exemple.com/offres" },
  ],

  output: { count: 4, maxPerCategory: 2, maxDistanceKm: 10, travelSpeedKmh: 30 },
  freshness: { staleAfterHours: 72 },

  weights: { mood: 0.3, distance: 0.2, budget: 0.15, time: 0.12, group: 0.1, openWindow: 0.08, novelty: 0.05 },

  moods: {
    exemple: { label: "Exemple d'envie", emoji: "✨", affinities: { categorieA: 0.9, categorieB: 0.6 } },
  },
  groups: {
    solo: { label: "Seul·e", emoji: "🧍", reason: "Très bien en solo" },
    couple: { label: "En couple", emoji: "💑", reason: "Idéal à deux" },
  },
  budgets: [{ value: 0, label: "Gratuit" }, { value: null, label: "Peu importe" }],
  times: [{ value: 60, label: "1 h" }, { value: null, label: "Tout mon temps" }],
  categories: {
    categorieA: { label: "Catégorie A", emoji: "🅰️" },
    categorieB: { label: "Catégorie B", emoji: "🅱️" },
  },
  neighborhoods: [{ id: "zone-1", label: "Zone 1", lat: 0, lng: 0 }],
  copy: {
    distance: "À {distance} de vous",
    budget: "Dans votre budget ({price})",
    free: "Gratuit",
    mood: "Parfait pour « {mood} »",
    open: "Ouvert jusqu'à {close}",
    time: "Rentre dans votre créneau",
  },
};
