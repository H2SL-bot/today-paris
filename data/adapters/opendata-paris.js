// data/adapters/opendata-paris.js
// Source RÉELLE : jeu de données « Que faire à Paris ? » de l'Open Data de la Ville de Paris.
// https://opendata.paris.fr/explore/dataset/que-faire-a-paris-/
// Gratuit, sans clé d'API. On ne récupère que les événements qui se passent AUJOURD'HUI
// (fenêtre chevauchant le jour), et on les traduit dans le schéma du moteur.

import { zonedInstant } from "../../engine/clock.js";

const BASE = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records";
const PAGE = 100; // maximum autorisé par l'API par appel

// qfap_tags (normalisé) -> catégorie du moteur (déjà présentes dans les affinités d'humeur).
// Établi à partir du VRAI vocabulaire de tags du jeu de données (qfap_tags), pas de noms devinés.
const CATEGORY_MAP = {
  concert: "live-music", festival: "live-music", musique: "live-music", "musique live": "live-music", "spectacle musical": "live-music",
  expo: "museum", exposition: "museum", "art contemporain": "museum", peinture: "museum", photo: "museum",
  "arts plastiques": "museum", "arts visuels": "museum", "street-art": "museum", "street art": "museum", sculpture: "museum", histoire: "museum", patrimoine: "museum",
  "visite guidée": "walk", visite: "walk",
  "théâtre": "theatre", humour: "theatre", spectacle: "theatre", danse: "theatre", cirque: "theatre", "one man show": "theatre", "arts de la rue": "theatre",
  "cinéma": "cinema", projection: "cinema", ecrans: "cinema", "écrans": "cinema",
  "conférence": "workshop", rencontre: "workshop", atelier: "workshop", "jeune public": "workshop", stage: "workshop", loisirs: "workshop", loisir: "workshop", enfants: "workshop", "atelier créatif": "workshop",
  lecture: "bookshop", "littérature": "bookshop", "dédicace": "bookshop",
  balade: "walk", "balade urbaine": "walk", promenade: "walk", randonnée: "walk",
  brocante: "market", "marché": "market", salon: "market", "vide-grenier": "market", gastronomie: "market", gourmand: "market",
  sport: "sport", "activité sportive": "sport",
  nature: "park", "sortie nature": "park", jardinage: "park",
};

const normTag = (t) => String(t || "").trim().toLowerCase();

function mapCategory(qfapTags) {
  const tags = String(qfapTags || "").split(";").map(normTag).filter(Boolean);
  for (const t of tags) if (CATEGORY_MAP[t]) return { category: CATEGORY_MAP[t], tags };
  return { category: "event", tags }; // catégorie générique "Événement" si non reconnue
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è").replace(/&agrave;/g, "à").replace(/&rsquo;/g, "’")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ").trim();
}

function shorten(s, n = 160) {
  const t = stripHtml(s);
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

export function parsePrice(priceType, priceDetail) {
  const type = normTag(priceType);
  if (type.includes("gratuit")) {
    return type.includes("condition") ? { free: true, note: "(sous condition)" } : { free: true };
  }
  const text = stripHtml(priceDetail);
  // Prix libre / au chapeau : gratuit, montant à la discrétion du visiteur.
  if (/prix libre|participation libre|libre participation|au chapeau/i.test(text)) return { free: true, note: "(prix libre)" };
  // Fourchette démarrant à 0 (« de 0 à X », « 0 à X ») : une entrée gratuite existe (sous condition).
  if (/(?:^|\bde\b|\bà partir de\b|\bentre\b|\bdès\b)\s*0\s*(?:€|euros?)?\s*(?:à|a|-|–|—|et)/i.test(text)) {
    return { free: true, note: "(sous condition)" };
  }
  // Payant : on extrait le plus petit tarif > 0. Accepte le glyphe € OU le mot « euro(s) » / « eur »
  // (l'Open Data l'écrit très souvent en toutes lettres : « 220 euros », « De 6 à 9 euros »).
  // Gère les milliers "1 500 €" / "10 000 €" (espace normal, insécable, insécable fin).
  const SEP = "[\\u0020\\u00a0\\u202f]";
  const re = new RegExp(`(\\d{1,3}(?:${SEP}\\d{3})+|\\d+)(?:[.,](\\d{1,2}))?\\s*(?:€|euros?|eur\\b)`, "gi");
  const nums = [...text.matchAll(re)]
    .map((m) => parseFloat(m[1].replace(new RegExp(SEP, "g"), "") + (m[2] ? "." + m[2] : "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length) {
    const min = Math.min(...nums);
    return { amount: min, note: nums.length > 1 ? "à p. de" : "" };
  }
  return { unknown: true, note: "Payant" };
}

export function audienceToGroups(audience) {
  const a = normTag(audience);
  const groups = ["solo", "couple", "friends"];
  // Âge minimal explicite (ex. "à partir de 18 ans", "dès 6 ans") : on ne veut PAS
  // classer "famille" un événement réservé aux ados/adultes.
  const ageMatch = a.match(/(?:à partir de|dès)\s*(\d{1,2})\s*ans?/);
  const minAge = ageMatch ? parseInt(ageMatch[1], 10) : null;
  const mentionsChild = /enfant|famille|tout public|jeune public|en famille|petit|tout-petit|bébé|ado/.test(a);
  // « adultes » ne suffit PAS à exclure la famille s'il cohabite avec un signal enfant
  // (ex. « Public enfants, jeunes et adultes »). On n'exclut que sur un signal EXCLUSIF adulte.
  const adultsOnly =
    /interdit aux mineurs|réservé aux adultes|\+\s*18\b|18 ans et plus/.test(a) ||
    (minAge != null && minAge >= 13) ||
    (/\badultes?\b/.test(a) && !mentionsChild);
  const familyHint = mentionsChild || (minAge != null && minAge <= 12);
  if (familyHint && !adultsOnly) groups.push("family");
  return groups;
}

function arrondissement(zip) {
  const m = /^75(\d{3})$/.exec(String(zip || ""));
  if (!m) return null;
  let n = parseInt(m[1], 10);
  if (n > 100) n -= 100; // 75116 -> 16
  return n >= 1 && n <= 20 ? `${n}ᵉ arrondissement` : null;
}

function parseOccurrences(str, now) {
  if (!str) return [];
  return String(str)
    .split(";")
    .map((pair) => {
      const [start, end] = pair.split("_");
      return start && end ? { start, end } : null;
    })
    .filter((o) => o && new Date(o.end) >= now); // on jette les créneaux déjà passés
}

function mapRecord(r, now) {
  const geo = r.lat_lon || {};
  const lat = Number(geo.lat);
  const lng = Number(geo.lon);
  // Sans coordonnées exploitables, l'offre est inutilisable pour "près de moi".
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;

  const { category, tags } = mapCategory(r.qfap_tags);
  const occurrences = parseOccurrences(r.occurrences, now);
  const first = occurrences[0];
  const durationMin = first ? Math.round((new Date(first.end) - new Date(first.start)) / 60000) : null;

  const offer = {
    id: `qfap-${r.id}`,
    source: "opendata-paris",
    demo: false,
    name: r.title,
    category,
    tags: [...tags, r.event_indoor ? "abrité" : "plein-air"],
    neighborhood: arrondissement(r.address_zipcode) || r.address_city || "Paris",
    lat, lng,
    price: parsePrice(r.price_type, r.price_detail),
    durationMin: durationMin && durationMin > 0 ? Math.min(durationMin, 300) : null,
    suitableFor: audienceToGroups(r.audience),
    descriptionShort: shorten(r.lead_text || r.description),
    bookingUrl: r.access_link || r.url || null,
    bookingLabel: r.access_link ? "Réserver" : "En savoir plus",
    // Photo réelle de l'événement (CDN officiel paris.fr) — jamais inventée.
    imageUrl: r.cover_url || null,
    imageAlt: r.cover_alt || null,
    // Bornes de VALIDITÉ au jour (pas à l'instant) : un événement de ce soir ne doit pas être
    // masqué tout l'après-midi. Le minutage précis reste géré par occurrences/eventWindow.
    validFrom: (r.date_start || "").slice(0, 10) || undefined,
    validUntil: (r.date_end || "").slice(0, 10) || undefined,
  };

  if (occurrences.length) offer.occurrences = occurrences;
  else if (r.date_start && r.date_end) offer.eventWindow = { start: r.date_start, end: r.date_end };

  return offer;
}

/**
 * Adaptateur. sourceDef : { type:'opendata-paris', name, limit?, timezone? }
 */
export async function opendataParisAdapter(sourceDef, ctx) {
  const now = ctx?.now instanceof Date ? ctx.now : new Date();
  const timeZone = sourceDef.timezone || "Europe/Paris";
  const maxRecords = sourceDef.limit || 300;

  // Fenêtre "aujourd'hui" en heure de Paris (bornes calées sur le fuseau).
  const [y, mo, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now).split("-").map(Number);
  const todayEndISO = zonedInstant(y, mo, d, 23, 59, 59, 999, timeZone).toISOString();
  const nowISO = now.toISOString();
  const where = `date_end >= '${nowISO}' and date_start <= '${todayEndISO}' and lat_lon is not null`;

  const out = [];
  for (let offset = 0; offset < maxRecords; offset += PAGE) {
    const url = `${BASE}?where=${encodeURIComponent(where)}&order_by=${encodeURIComponent("date_start desc")}&limit=${PAGE}&offset=${offset}`;
    let rows;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "today.paris/0.1 (+https://today.paris)", Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rows = (await res.json()).results || [];
    } catch (err) {
      // Un hoquet réseau sur UNE page ne doit pas jeter les pages déjà récupérées :
      // on conserve le partiel et on s'arrête proprement (la boucle réessaiera au prochain run).
      console.warn(`[opendata-paris] page offset=${offset} échouée (${err.message}) — ${out.length} offres déjà récupérées conservées.`);
      break;
    }
    for (const r of rows) {
      const offer = mapRecord(r, now);
      if (offer) out.push(offer);
    }
    if (rows.length < PAGE) break; // plus de pages
  }
  return out;
}
