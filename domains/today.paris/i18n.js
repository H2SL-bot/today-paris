// domains/today.paris/i18n.js
// Couche de LANGUE du domaine. Le moteur reste agnostique : on lui passe une config "localisée".
// L'interface lit UI[lang]. Les NOMS des événements/lieux (données) restent tels quels.
// 4 langues : fr, en (écrites à la main), zh (chinois simplifié) + ar (arabe MSA, droite-à-gauche)
// dont les textes viennent de ui-i18n.data.js (traductions vérifiées).

import { UI_DATA } from "./ui-i18n.data.js";

export const LANGS = ["fr", "en", "zh", "ar"];
export const LANG_LABELS = { fr: "FR", en: "EN", zh: "中文", ar: "العربية" };
export const langHref = (lang) => (lang === "fr" ? "/" : `/${lang}/`);

// Pages piliers (le slug d'URL reste en ASCII : /zh/open-now/, /ar/open-now/ — on réutilise le slug EN).
export const PILLARS = [
  { fr: "ouvert-maintenant", en: "open-now", labelFr: "Ouvert maintenant", labelEn: "Open now", kind: "venues" },
  { fr: "ce-soir", en: "tonight", labelFr: "Ce soir", labelEn: "Tonight", kind: "events" },
  { fr: "marais", en: "marais", labelFr: "Le Marais", labelEn: "Le Marais", kind: "quartier", lat: 48.8590, lng: 2.3620, nameFr: "le Marais", nameEn: "Le Marais" },
  { fr: "montmartre", en: "montmartre", labelFr: "Montmartre", labelEn: "Montmartre", kind: "quartier", lat: 48.8867, lng: 2.3431, nameFr: "Montmartre", nameEn: "Montmartre" },
  { fr: "quartier-latin", en: "latin-quarter", labelFr: "Quartier latin", labelEn: "Latin Quarter", kind: "quartier", lat: 48.8490, lng: 2.3470, nameFr: "le Quartier latin", nameEn: "the Latin Quarter" },
  { fr: "canal-saint-martin", en: "canal-saint-martin", labelFr: "Canal Saint-Martin", labelEn: "Canal Saint-Martin", kind: "quartier", lat: 48.8710, lng: 2.3660, nameFr: "le Canal Saint-Martin", nameEn: "Canal Saint-Martin" },
];
export const pillarSlug = (p, lang) => (lang === "fr" ? p.fr : p.en);
export function pillarLabel(p, lang) {
  if (lang === "fr") return p.labelFr;
  if (lang === "en") return p.labelEn;
  return UI_DATA[lang]?.pillars?.[p.en] || p.labelEn;
}
export function quartierName(p, lang) {
  if (lang === "fr") return p.nameFr;
  if (lang === "en") return p.nameEn;
  return UI_DATA[lang]?.quartierNames?.[p.en] || p.nameEn;
}

// --- Textes de l'interface ----------------------------------------------
const FR = {
  htmlLang: "fr", dir: "ltr", ogLocale: "fr_FR",
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
  relax: "🔓 Élargir la recherche",
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
  explore: "Explorer :", youAreHere: "Vous êtes ici", clockLocale: "fr-FR", mapLabel: "Carte des lieux proposés",
};

const EN = {
  htmlLang: "en", dir: "ltr", ogLocale: "en_US",
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
  relax: "🔓 Widen the search",
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
  explore: "Explore:", youAreHere: "You are here", clockLocale: "en-GB", mapLabel: "Map of suggested places",
};

// Construit UI[lang] pour zh/ar depuis le lot de données (templates {n}/{city} -> fonctions).
function fromBundle(lang) {
  const u = UI_DATA[lang].ui;
  return {
    ...u,
    htmlLang: lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    ogLocale: lang === "zh" ? "zh_CN" : lang === "ar" ? "ar_AR" : "en_US",
    clockLocale: lang === "zh" ? "zh-CN" : lang === "ar" ? "ar-EG" : "en-GB",
    resultsHead: (n) => String(u.resultsHead).replace("{n}", n),
    shareText: (n) => String(u.shareText).replace("{n}", n),
    locOutside: (city) => String(u.locOutside).replace("{city}", city),
  };
}

export const UI = { fr: FR, en: EN, zh: fromBundle("zh"), ar: fromBundle("ar") };

// --- Traductions des libellés (moteur) : anglais écrit à la main, zh/ar depuis les données ----
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
  decimalSep: ".",
  distance: "{distance} away", budget: "Within your budget ({price})", free: "Free", paid: "Paid",
  mood: "Perfect for « {mood} »", open: "Open until {close}", time: "Fits your time slot",
  priceNotes: { "à la conso": "pay on site", "à la carte": "à la carte", "à la pièce": "per item", "(sous condition)": "(conditions apply)", "(prix libre)": "(pay what you want)", "Payant": "Paid", "à p. de": "from" },
};

const L10N = {
  en: { moods: MOODS, groups: GROUPS, cats: CATS, budgets: BUDGETS, times: TIMES, copy: COPY_EN },
  zh: { moods: UI_DATA.zh.moods, groups: UI_DATA.zh.groups, cats: UI_DATA.zh.cats, budgets: UI_DATA.zh.budgets, times: UI_DATA.zh.times, copy: { ...UI_DATA.zh.copy, decimalSep: "." } },
  ar: { moods: UI_DATA.ar.moods, groups: UI_DATA.ar.groups, cats: UI_DATA.ar.cats, budgets: UI_DATA.ar.budgets, times: UI_DATA.ar.times, copy: { ...UI_DATA.ar.copy, decimalSep: "." } },
};

/**
 * Renvoie une copie de la config avec les libellés/textes traduits pour `lang`.
 * (fr = identité.) Le moteur consomme cette config sans savoir quelle langue c'est.
 */
export function localizeConfig(config, lang) {
  const l = L10N[lang];
  if (!l) return config; // fr (ou langue inconnue) : identité
  const clone = JSON.parse(JSON.stringify(config)); // config = données pures (sans fonctions)
  for (const [id, m] of Object.entries(clone.moods)) if (l.moods[id]) m.label = l.moods[id];
  for (const [id, g] of Object.entries(clone.groups)) if (l.groups[id]) { g.label = l.groups[id][0]; g.reason = l.groups[id][1]; }
  for (const [id, c] of Object.entries(clone.categories)) if (l.cats[id]) c.label = l.cats[id];
  clone.budgets = clone.budgets.map((b) => ({ ...b, label: l.budgets[String(b.value)] ?? b.label }));
  clone.times = clone.times.map((t) => ({ ...t, label: l.times[String(t.value)] ?? t.label }));
  clone.copy = { ...clone.copy, ...l.copy };
  return clone;
}
