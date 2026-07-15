// domains/today.paris/i18n.js
// Couche de LANGUE du domaine. Le moteur reste agnostique : on lui passe simplement une
// config "localisée" (labels + textes traduits). L'interface lit UI[lang].
// Les NOMS des événements/lieux (données) restent tels quels — jamais traduits.

export const LANGS = ["fr", "en"];

// Pages piliers (slugs par langue) — partagées par le build du site et des pages.
export const PILLARS = [
  { fr: "ouvert-maintenant", en: "open-now", labelFr: "Ouvert maintenant", labelEn: "Open now", kind: "venues" },
  { fr: "ce-soir", en: "tonight", labelFr: "Ce soir", labelEn: "Tonight", kind: "events" },
  { fr: "marais", en: "marais", labelFr: "Le Marais", labelEn: "Le Marais", kind: "quartier", lat: 48.8590, lng: 2.3620, nameFr: "le Marais", nameEn: "Le Marais" },
  { fr: "montmartre", en: "montmartre", labelFr: "Montmartre", labelEn: "Montmartre", kind: "quartier", lat: 48.8867, lng: 2.3431, nameFr: "Montmartre", nameEn: "Montmartre" },
  { fr: "quartier-latin", en: "latin-quarter", labelFr: "Quartier latin", labelEn: "Latin Quarter", kind: "quartier", lat: 48.8490, lng: 2.3470, nameFr: "le Quartier latin", nameEn: "the Latin Quarter" },
  { fr: "canal-saint-martin", en: "canal-saint-martin", labelFr: "Canal Saint-Martin", labelEn: "Canal Saint-Martin", kind: "quartier", lat: 48.8710, lng: 2.3660, nameFr: "le Canal Saint-Martin", nameEn: "Canal Saint-Martin" },
];

// --- Textes de l'interface ----------------------------------------------
export const UI = {
  fr: {
    htmlLang: "fr",
    title: "today.paris — Que faire à Paris maintenant ? Sorties, événements, bars & cafés",
    metaDesc:
      "Que faire à Paris maintenant ? Dites où vous êtes, l'heure, votre budget et votre envie : événements du jour, bars, cafés et parcs ouverts près de vous, sur une carte. Gratuit, en temps réel.",
    ogTitle: "today.paris — Quoi faire à Paris, maintenant",
    ogDesc:
      "Dites où vous êtes, l'heure, votre budget et votre envie. On vous dit quoi faire à Paris, maintenant — événements et lieux, en direct.",
    tagline: "Dites-nous où vous êtes, l'heure, votre budget et votre envie. On vous dit quoi faire, maintenant.",
    where: "📍 Où êtes-vous ?", geoloc: "📍 Me localiser", geolocTitle: "Utiliser ma position",
    who: "👥 Avec qui ?", budget: "💶 Budget par personne", mood: "✨ Votre envie", time: "⏱️ Temps disponible",
    openNow: "Seulement ce qui est ouvert maintenant", submit: "Qu'est-ce que je fais maintenant ?", surprise: "🎲 Au hasard",
    resultsHead: (n) => `Voici ${n} idée${n > 1 ? "s" : ""} pour vous, maintenant :`,
    emptyTitle: "Rien d'idéal à cet instant précis.",
    emptyHint: "Essayez d'augmenter le budget ou le temps disponible, ou décochez « ouvert maintenant ».",
    interest: "👍 Ça m'intéresse", noted: "✓ Noté", share: "🔗 Partager", shared: "✓ Lien copié", shareText: (n) => `${n} — trouvé sur today.paris`,
    err: "Une erreur est survenue. Réessayez.",
    dataErr: "Impossible de contacter l'Open Data de Paris pour l'instant. Réessayez dans un instant.",
    locating: "Localisation en cours…", locFound: "📍 Position détectée — on part de là.",
    locOutside: (city) => `Vous semblez hors de ${city} : on garde le quartier choisi.`,
    locDenied: "Localisation refusée : on garde le quartier choisi.",
    locUnavail: "Géolocalisation non disponible sur cet appareil.",
    onNow: "🔴 en ce moment", until: "jusqu'à", todayAt: "🗓️ aujourd'hui à", showing: "🗓️ à l'affiche",
    openUntil: "⏰ ouvert jusqu'à", open247: "⏰ ouvert 24h/24",
    footer: "today.paris — Événements : Open Data Ville de Paris · Lieux & carte : © OpenStreetMap.",
    aboutH2: "Que faire à Paris maintenant ?",
    aboutP:
      "<strong>today.paris</strong> est un outil gratuit qui vous dit <strong>quoi faire à Paris, maintenant</strong>, selon votre position, l'heure, votre budget et votre envie : événements du jour, bars, cafés et parcs ouverts près de vous, affichés sur une carte. En temps réel, sans inscription.",
    faq: [
      ["C'est vraiment gratuit ?", "Oui, entièrement gratuit et sans inscription."],
      ["D'où viennent les informations ?", "Les événements viennent de l'Open Data de la Ville de Paris (« Que faire à Paris ? ») ; les lieux (bars, cafés, parcs) d'OpenStreetMap. Les horaires et disponibilités sont réels — jamais inventés."],
      ["Comment ça marche ?", "Indiquez où vous êtes, avec qui, votre budget, votre envie et le temps dont vous disposez. Le moteur classe pour vous les meilleures idées disponibles maintenant, autour de vous."],
    ],
    explore: "Explorer :", switchTo: "English", switchHref: "/en/", youAreHere: "Vous êtes ici", clockLocale: "fr-FR", mapLabel: "Carte des lieux proposés",
  },
  en: {
    htmlLang: "en",
    title: "today.paris — What to do in Paris right now? Events, bars & cafés open now",
    metaDesc:
      "What to do in Paris right now? Tell us where you are, the time, your budget and your mood: today's events, bars, cafés and parks open near you, on a map. Free, real-time.",
    ogTitle: "today.paris — What to do in Paris, right now",
    ogDesc:
      "Tell us where you are, the time, your budget and your mood. We'll tell you what to do in Paris right now — live events and places.",
    tagline: "Tell us where you are, the time, your budget and your mood. We'll tell you what to do, right now.",
    where: "📍 Where are you?", geoloc: "📍 Use my location", geolocTitle: "Use my location",
    who: "👥 Who with?", budget: "💶 Budget per person", mood: "✨ Your mood", time: "⏱️ Time available",
    openNow: "Only what's open right now", submit: "What should I do right now?", surprise: "🎲 Surprise me",
    resultsHead: (n) => `Here ${n === 1 ? "is 1 idea" : "are " + n + " ideas"} for you, right now:`,
    emptyTitle: "Nothing ideal at this exact moment.",
    emptyHint: "Try increasing the budget or the time available, or uncheck « open now ».",
    interest: "👍 I'm interested", noted: "✓ Noted", share: "🔗 Share", shared: "✓ Link copied", shareText: (n) => `${n} — found on today.paris`,
    err: "Something went wrong. Please try again.",
    dataErr: "Couldn't reach Paris Open Data right now. Please try again shortly.",
    locating: "Locating…", locFound: "📍 Location found — starting from here.",
    locOutside: (city) => `You seem to be outside ${city}: keeping the selected area.`,
    locDenied: "Location denied: keeping the selected area.",
    locUnavail: "Geolocation isn't available on this device.",
    onNow: "🔴 on now", until: "until", todayAt: "🗓️ today at", showing: "🗓️ showing now",
    openUntil: "⏰ open until", open247: "⏰ open 24/7",
    footer: "today.paris — Events: City of Paris Open Data · Places & map: © OpenStreetMap.",
    aboutH2: "What to do in Paris right now?",
    aboutP:
      "<strong>today.paris</strong> is a free tool that tells you <strong>what to do in Paris, right now</strong>, based on where you are, the time, your budget and your mood: today's events, bars, cafés and parks open near you, shown on a map. Real-time, no sign-up.",
    faq: [
      ["Is it really free?", "Yes, completely free and no sign-up."],
      ["Where does the information come from?", "Events come from the City of Paris Open Data (« Que faire à Paris ? »); places (bars, cafés, parks) from OpenStreetMap. Opening hours and availability are real — never made up."],
      ["How does it work?", "Tell us where you are, who you're with, your budget, your mood and how much time you have. The engine ranks the best ideas available right now, around you."],
    ],
    explore: "Explore:", switchTo: "Français", switchHref: "/", youAreHere: "You are here", clockLocale: "en-GB", mapLabel: "Map of suggested places",
  },
};

// --- Traductions des libellés (moteur + interface) ----------------------
const MOODS = {
  detente: "Relax", culture: "Culture", gourmand: "Food", fete: "Party / night out",
  nature: "Outdoors", romantique: "Romantic", sport: "Active", decouverte: "Discover",
};
const GROUPS = {
  solo: ["Solo", "Great solo"], couple: ["As a couple", "Perfect for two"],
  friends: ["With friends", "Great with friends"], family: ["With family", "Family-friendly"],
};
const CATS = {
  event: "Event", cafe: "Café", restaurant: "Restaurant", bar: "Bar", rooftop: "Rooftop",
  "wine-bar": "Wine bar", museum: "Museum", gallery: "Gallery", monument: "Monument", cinema: "Cinema",
  theatre: "Theatre", "live-music": "Live music", jazz: "Jazz", club: "Club", park: "Park", garden: "Garden",
  walk: "Walk", viewpoint: "Viewpoint", market: "Market", "food-market": "Food hall", shopping: "Shop",
  spa: "Spa", hammam: "Hammam", sport: "Sport", boat: "Boat", workshop: "Workshop", bookshop: "Bookshop",
  patisserie: "Pastry shop",
};
const BUDGETS = { "0": "Free", "10": "≤ €10", "25": "≤ €25", "50": "≤ €50", "null": "Any budget" };
const TIMES = { "30": "30 min", "60": "1 hr", "120": "2 hrs", "240": "Half a day", "null": "All my time" };
const COPY_EN = {
  decimalSep: ".", // séparateur décimal des distances en anglais (2.8 km, pas 2,8 km)
  distance: "{distance} away", budget: "Within your budget ({price})", free: "Free", paid: "Paid",
  mood: "Perfect for « {mood} »", open: "Open until {close}", time: "Fits your time slot",
  priceNotes: { "à la conso": "pay on site", "à la carte": "à la carte", "à la pièce": "per item", "(sous condition)": "(conditions apply)", "(prix libre)": "(pay what you want)", "Payant": "Paid", "à p. de": "from" },
};

/**
 * Renvoie une copie de la config avec les libellés/textes traduits pour `lang`.
 * (fr = identité.) Le moteur consomme cette config sans savoir quelle langue c'est.
 */
export function localizeConfig(config, lang) {
  if (lang !== "en") return config;
  const clone = JSON.parse(JSON.stringify(config)); // config = données pures (sans fonctions)
  for (const [id, m] of Object.entries(clone.moods)) if (MOODS[id]) m.label = MOODS[id];
  for (const [id, g] of Object.entries(clone.groups)) if (GROUPS[id]) { g.label = GROUPS[id][0]; g.reason = GROUPS[id][1]; }
  for (const [id, c] of Object.entries(clone.categories)) if (CATS[id]) c.label = CATS[id];
  clone.budgets = clone.budgets.map((b) => ({ ...b, label: BUDGETS[String(b.value)] ?? b.label }));
  clone.times = clone.times.map((t) => ({ ...t, label: TIMES[String(t.value)] ?? t.label }));
  clone.copy = { ...clone.copy, ...COPY_EN };
  return clone;
}
