#!/usr/bin/env node
// scripts/fetch-venues.mjs
// Récupère les LIEUX (cafés, bars, parcs, jardins) de Paris depuis OpenStreetMap (Overpass),
// ne garde que ceux dont les horaires réels sont convertibles SÛREMENT, et écrit un fichier
// statique domains/today.paris/venues.json au format d'offre du moteur.
//
//   node scripts/fetch-venues.mjs
//
// À relancer de temps en temps (ex. via la boucle) pour rafraîchir les lieux. Les horaires
// des lieux étant stables, un instantané suffit ; le « ouvert maintenant » est recalculé en
// direct côté navigateur à partir de ces vrais horaires.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpeningHours } from "../data/opening-hours.js";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "domains", "today.paris", "venues.json");

// Paris intra-muros (+ marges)
const BBOX = "48.815,2.224,48.902,2.470";
const QUERY = `[out:json][timeout:90];
(
  nwr["amenity"~"^(cafe|bar|pub)$"]["opening_hours"]["name"](${BBOX});
  nwr["leisure"~"^(park|garden)$"]["opening_hours"]["name"](${BBOX});
);
out center tags;`;

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

const CATEGORY = { cafe: "cafe", bar: "bar", pub: "bar", park: "park", garden: "garden" };
const DURATION = { cafe: 45, bar: 90, park: 60, garden: 45 };
const DESC = {
  cafe: "Un café où se poser.",
  bar: "Un bar pour boire un verre.",
  park: "Un espace vert pour souffler.",
  garden: "Un jardin pour une pause au calme.",
};

function arrondissement(zip) {
  const m = /^75(\d{3})$/.exec(String(zip || ""));
  if (!m) return null;
  let n = parseInt(m[1], 10);
  if (n > 100) n -= 100;
  return n >= 1 && n <= 20 ? `${n}ᵉ arrondissement` : null;
}

function suitableFor(category) {
  if (category === "bar") return ["solo", "couple", "friends"];
  return ["solo", "couple", "friends", "family"]; // café, parc, jardin
}

function price(category) {
  if (category === "park" || category === "garden") return { free: true };
  return { unknown: true, note: "à la conso" };
}

function toOffer(el) {
  const t = el.tags || {};
  const kind = t.amenity || t.leisure;
  const category = CATEGORY[kind];
  if (!category) return null;

  const hours = parseOpeningHours(t.opening_hours);
  if (!hours) return null; // horaires non convertibles sûrement → on écarte

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const indoor = category === "cafe" || category === "bar";
  return {
    id: `osm-${el.type[0]}${el.id}`,
    source: "openstreetmap",
    demo: false,
    name: t.name,
    category,
    tags: [category, indoor ? "abrité" : "plein-air"],
    neighborhood: arrondissement(t["addr:postcode"]) || "Paris",
    lat, lng,
    hours,
    price: price(category),
    durationMin: DURATION[category],
    suitableFor: suitableFor(category),
    descriptionShort: DESC[category],
    bookingUrl: t.website || null,
    bookingLabel: t.website ? "Site web" : null,
  };
}

async function fetchOverpass() {
  let lastErr;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "today.paris/0.1" },
        body: "data=" + encodeURIComponent(QUERY),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.trimStart().startsWith("<")) throw new Error("réponse HTML (surcharge Overpass)");
      return JSON.parse(text);
    } catch (err) {
      console.warn(`[venues] ${url} -> ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr;
}

async function main() {
  console.log("[venues] interrogation d'OpenStreetMap (Overpass)…");
  const json = await fetchOverpass();
  const elements = json.elements || [];

  const seen = new Set();
  const offers = [];
  let dropped = 0;
  for (const el of elements) {
    const offer = toOffer(el);
    if (!offer) { dropped++; continue; }
    if (seen.has(offer.name.toLowerCase() + offer.category)) continue; // dédoublonnage léger
    seen.add(offer.name.toLowerCase() + offer.category);
    offers.push(offer);
  }

  const byCat = offers.reduce((a, o) => ((a[o.category] = (a[o.category] || 0) + 1), a), {});
  // Tri stable (par id) + pas d'horodatage : le fichier ne change QUE si les lieux changent
  // vraiment → la boucle automatique ne republie pas pour rien.
  offers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const payload = {
    _source: "© OpenStreetMap contributors (ODbL)",
    count: offers.length,
    offers,
  };
  await writeFile(OUT, JSON.stringify(payload), "utf8");
  console.log(`[venues] ${elements.length} éléments OSM → ${offers.length} lieux gardés (horaires sûrs), ${dropped} écartés.`);
  console.log("[venues] par catégorie :", JSON.stringify(byCat));
  console.log("[venues] écrit :", OUT);
}

main().catch((e) => {
  console.error("[venues] échec :", e.message);
  process.exit(1);
});
