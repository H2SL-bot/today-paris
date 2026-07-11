// data/adapters/opendata-paris.js
// Source RÉELLE : jeu de données « Que faire à Paris ? » de l'Open Data de la Ville de Paris.
// https://opendata.paris.fr/explore/dataset/que-faire-a-paris-/
// Gratuit, sans clé d'API. On ne récupère que les événements qui se passent AUJOURD'HUI
// (fenêtre chevauchant le jour), et on les traduit dans le schéma du moteur.

import { zonedInstant } from "../../engine/clock.js";

const BASE = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records";
const PAGE = 100; // maximum autorisé par l'API par appel

// qfap_tags (normalisé) -> catégorie du moteur (déjà présentes dans les affinités d'humeur).
const CATEGORY_MAP = {
  concert: "live-music", festival: "live-music", musique: "live-music", "musique live": "live-music",
  expo: "museum", exposition: "museum", "visite guidée": "walk", visite: "walk",
  "théâtre": "theatre", humour: "theatre", spectacle: "theatre", danse: "theatre", cirque: "theatre", "one man show": "theatre",
  "cinéma": "cinema", projection: "cinema",
  "conférence": "workshop", rencontre: "workshop", atelier: "workshop", "jeune public": "workshop", stage: "workshop",
  lecture: "bookshop", "littérature": "bookshop", "dédicace": "bookshop",
  balade: "walk", "balade urbaine": "walk", promenade: "walk", randonnée: "walk",
  brocante: "market", "marché": "market", salon: "market", "vide-grenier": "market",
  sport: "sport", "activité sportive": "sport",
  "loisir": "workshop", nature: "park", "sortie nature": "park",
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
  // payant : on extrait le plus petit tarif > 0 du texte.
  // Gère les milliers "1 500 €" / "10 000 €" (espace normal, insécable, insécable fin).
  const text = stripHtml(priceDetail);
  const SEP = "[\\u0020\\u00a0\\u202f]";
  const re = new RegExp(`(\\d{1,3}(?:${SEP}\\d{3})+|\\d+)(?:[.,](\\d{1,2}))?\\s*€`, "g");
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
  const adultsOnly =
    /adulte|interdit aux mineurs|\+\s*18|18\s*ans et plus|réservé aux adultes/.test(a) ||
    (minAge != null && minAge >= 13);
  const familyHint =
    /tout public|famille|enfant|jeune public|en famille/.test(a) || (minAge != null && minAge <= 12);
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
    validFrom: r.date_start || undefined,
    validUntil: r.date_end || undefined,
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
