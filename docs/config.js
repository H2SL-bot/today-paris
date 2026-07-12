// domains/today.paris/config.js
// Configuration PROPRE AU DOMAINE. C'est le seul gros fichier à réécrire
// pour lancer visitwine.com, lacanau.surf, thalasso, etc. Le moteur ne change pas.

export default {
  domain: "today.paris",
  title: "today.paris",
  tagline: "Dites-nous où vous êtes, l'heure, votre budget et votre envie. On vous dit quoi faire, maintenant.",
  city: {
    label: "Paris",
    center: { lat: 48.8566, lng: 2.3522 },
    timezone: "Europe/Paris", // "ouvert maintenant" et dates calculés dans CE fuseau
    bounds: { minLat: 48.7, maxLat: 49.0, minLng: 2.1, maxLng: 2.6 }, // zone couverte (géoloc)
  },

  // "Cerveau" en ligne (Cloudflare Worker) : mesure les clics et sert /stats.
  // Le site apprend de ce qui marche via le critère "popularity" ci-dessous.
  brainUrl: "https://today-paris-brain.today-paris.workers.dev",

  // --- Sources de données (adaptateurs interchangeables) ------------------
  // Aujourd'hui : un fichier de DÉMONSTRATION clairement marqué.
  // Demain : ajouter { type:'http', name:'billetterie', url:'...' } sans toucher au reste.
  sources: [
    // Source RÉELLE : événements du jour de l'Open Data Ville de Paris (gratuit, sans clé).
    { type: "opendata-paris", name: "que-faire", limit: 300, timezone: "Europe/Paris" },
    // Source RÉELLE : lieux (cafés, bars, parcs, jardins) d'OpenStreetMap avec vrais horaires.
    // Instantané généré par `npm run fetch:venues` (le "ouvert maintenant" est recalculé en direct).
    { type: "file", name: "lieux-osm", path: "venues.json" },
    // Secours hors-ligne (données de démo) : décommentez si l'API est indisponible.
    // { type: "file", name: "demo", path: "offers.demo.json", demo: true },
  ],

  // --- Réglages du moteur -------------------------------------------------
  output: {
    count: 4,              // 3 à 5 propositions
    maxPerCategory: 2,     // diversité : pas 5 fois la même chose
    maxDistanceKm: 6,      // au-delà, on considère que c'est "trop loin" pour "maintenant"
    travelSpeedKmh: 11,    // vitesse moyenne porte-à-porte (marche + métro)
  },
  freshness: { staleAfterHours: 72 },

  // Poids de chaque critère (normalisés automatiquement).
  weights: {
    mood: 0.30,        // l'envie compte le plus
    distance: 0.20,    // rester proche
    budget: 0.15,
    time: 0.12,
    group: 0.10,
    openWindow: 0.08,  // assez de temps avant fermeture
    popularity: 0.08,  // ce que les visiteurs cliquent vraiment (apprentissage)
    novelty: 0.05,     // un peu d'exploration
  },

  // --- Envies / humeurs ---------------------------------------------------
  // affinities : quelles catégories/tags collent à cette envie (0..1).
  moods: {
    detente: {
      label: "Détente", emoji: "🧘",
      affinities: { cafe: 0.9, park: 0.8, garden: 0.8, spa: 0.9, hammam: 0.9, walk: 0.7, bookshop: 0.7, "wine-bar": 0.6, shopping: 0.4, calme: 0.5 },
    },
    culture: {
      label: "Culture", emoji: "🎨",
      affinities: { museum: 0.95, gallery: 0.85, monument: 0.8, theatre: 0.8, bookshop: 0.6, workshop: 0.6, cinema: 0.6, event: 0.5 },
    },
    gourmand: {
      label: "Gourmand", emoji: "🍽️",
      affinities: { restaurant: 0.95, patisserie: 0.85, "food-market": 0.85, "wine-bar": 0.75, market: 0.6, cafe: 0.55 },
    },
    fete: {
      label: "Fête / sortir", emoji: "🎉",
      affinities: { bar: 0.9, club: 0.95, rooftop: 0.85, "live-music": 0.85, jazz: 0.8, "wine-bar": 0.7, event: 0.5 },
    },
    nature: {
      label: "Plein air", emoji: "🌳",
      affinities: { park: 0.95, garden: 0.9, walk: 0.85, viewpoint: 0.8, boat: 0.75 },
    },
    romantique: {
      label: "Romantique", emoji: "💛",
      affinities: { rooftop: 0.85, "wine-bar": 0.8, viewpoint: 0.85, boat: 0.8, restaurant: 0.7, walk: 0.6, garden: 0.6, vue: 0.6 },
    },
    sport: {
      label: "Bouger", emoji: "🏃",
      affinities: { sport: 0.95, walk: 0.7, boat: 0.6, park: 0.5 },
    },
    decouverte: {
      label: "Découverte", emoji: "✨",
      affinities: { workshop: 0.85, market: 0.7, gallery: 0.7, monument: 0.7, viewpoint: 0.7, "live-music": 0.6, shopping: 0.6, event: 0.7, insolite: 0.8 },
    },
  },

  // --- Configuration du groupe -------------------------------------------
  groups: {
    solo: { label: "Seul·e", emoji: "🧍", reason: "Très bien en solo" },
    couple: { label: "En couple", emoji: "💑", reason: "Idéal à deux" },
    friends: { label: "Entre amis", emoji: "👥", reason: "Parfait entre amis" },
    family: { label: "En famille", emoji: "👨‍👩‍👧", reason: "Adapté en famille" },
  },

  // --- Options du formulaire ---------------------------------------------
  budgets: [
    { value: 0, label: "Gratuit" },
    { value: 10, label: "≤ 10 €" },
    { value: 25, label: "≤ 25 €" },
    { value: 50, label: "≤ 50 €" },
    { value: null, label: "Peu importe" },
  ],
  times: [
    { value: 30, label: "30 min" },
    { value: 60, label: "1 h" },
    { value: 120, label: "2 h" },
    { value: 240, label: "Une demi-journée" },
    { value: null, label: "Tout mon temps" },
  ],

  // --- Catégories (affichage) --------------------------------------------
  categories: {
    event: { label: "Événement", emoji: "🎫" },
    cafe: { label: "Café", emoji: "☕" },
    restaurant: { label: "Restaurant", emoji: "🍽️" },
    bar: { label: "Bar", emoji: "🍸" },
    rooftop: { label: "Rooftop", emoji: "🌆" },
    "wine-bar": { label: "Bar à vin", emoji: "🍷" },
    museum: { label: "Musée", emoji: "🏛️" },
    gallery: { label: "Galerie", emoji: "🖼️" },
    monument: { label: "Monument", emoji: "🗼" },
    cinema: { label: "Cinéma", emoji: "🎬" },
    theatre: { label: "Théâtre", emoji: "🎭" },
    "live-music": { label: "Concert", emoji: "🎤" },
    jazz: { label: "Jazz", emoji: "🎷" },
    club: { label: "Club", emoji: "🕺" },
    park: { label: "Parc", emoji: "🌳" },
    garden: { label: "Jardin", emoji: "🌷" },
    walk: { label: "Balade", emoji: "🚶" },
    viewpoint: { label: "Point de vue", emoji: "👀" },
    market: { label: "Marché", emoji: "🧺" },
    "food-market": { label: "Halle gourmande", emoji: "🥘" },
    shopping: { label: "Boutique", emoji: "🛍️" },
    spa: { label: "Spa", emoji: "💆" },
    hammam: { label: "Hammam", emoji: "♨️" },
    sport: { label: "Sport", emoji: "🏃" },
    boat: { label: "Bateau", emoji: "⛵" },
    workshop: { label: "Atelier", emoji: "🎨" },
    bookshop: { label: "Librairie", emoji: "📚" },
    patisserie: { label: "Pâtisserie", emoji: "🧁" },
  },

  // --- Quartiers de Paris (centroïdes géographiques réels) ----------------
  neighborhoods: [
    { id: "paris-01", label: "1ᵉʳ — Louvre", lat: 48.8607, lng: 2.3358 },
    { id: "paris-02", label: "2ᵉ — Bourse", lat: 48.8697, lng: 2.3419 },
    { id: "paris-03", label: "3ᵉ — Haut-Marais", lat: 48.8630, lng: 2.3600 },
    { id: "paris-04", label: "4ᵉ — Marais / Hôtel de Ville", lat: 48.8548, lng: 2.3576 },
    { id: "paris-05", label: "5ᵉ — Quartier Latin", lat: 48.8448, lng: 2.3501 },
    { id: "paris-06", label: "6ᵉ — Saint-Germain-des-Prés", lat: 48.8496, lng: 2.3341 },
    { id: "paris-07", label: "7ᵉ — Tour Eiffel / Invalides", lat: 48.8565, lng: 2.3120 },
    { id: "paris-08", label: "8ᵉ — Champs-Élysées", lat: 48.8727, lng: 2.3120 },
    { id: "paris-09", label: "9ᵉ — Opéra / Pigalle", lat: 48.8770, lng: 2.3378 },
    { id: "paris-10", label: "10ᵉ — Canal Saint-Martin", lat: 48.8760, lng: 2.3600 },
    { id: "paris-11", label: "11ᵉ — Bastille / Oberkampf", lat: 48.8590, lng: 2.3790 },
    { id: "paris-12", label: "12ᵉ — Bercy / Nation", lat: 48.8353, lng: 2.4010 },
    { id: "paris-13", label: "13ᵉ — Butte-aux-Cailles", lat: 48.8283, lng: 2.3560 },
    { id: "paris-14", label: "14ᵉ — Montparnasse", lat: 48.8330, lng: 2.3260 },
    { id: "paris-15", label: "15ᵉ — Vaugirard", lat: 48.8417, lng: 2.3000 },
    { id: "paris-16", label: "16ᵉ — Trocadéro", lat: 48.8600, lng: 2.2620 },
    { id: "paris-17", label: "17ᵉ — Batignolles", lat: 48.8870, lng: 2.3070 },
    { id: "paris-18", label: "18ᵉ — Montmartre", lat: 48.8920, lng: 2.3444 },
    { id: "paris-19", label: "19ᵉ — Buttes-Chaumont", lat: 48.8870, lng: 2.3820 },
    { id: "paris-20", label: "20ᵉ — Belleville / Ménilmontant", lat: 48.8640, lng: 2.3980 },
    { id: "defense", label: "La Défense", lat: 48.8920, lng: 2.2380 },
  ],

  // --- Gabarits de texte pour les "pourquoi" ------------------------------
  copy: {
    distance: "À {distance} de vous",
    budget: "Dans votre budget ({price})",
    free: "Gratuit",
    mood: "Parfait pour « {mood} »",
    open: "Ouvert jusqu'à {close}",
    time: "Rentre dans votre créneau",
  },
};
