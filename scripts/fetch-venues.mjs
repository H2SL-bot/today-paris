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

import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpeningHours } from "../data/opening-hours.js";
import { arrondissementLabel } from "../data/arrondissement.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "domains", "today.paris", "venues.json");
const BOUND_PATH = path.join(ROOT, "domains", "today.paris", "arrondissements.json");
let BOUNDARIES = []; // limites des arrondissements (chargées dans main)

// Paris intra-muros (+ marges)
const BBOX = "48.815,2.224,48.902,2.470";
// UNE requête par groupe (plus légères → Overpass ne tombe pas en 504 comme la requête combinée).
// Chaque groupe est indépendant : si l'un échoue, on garde les autres.
const wrap = (body) => `[out:json][timeout:180];(${body});out center tags;`;
// Chaque groupe déclare les catégories qu'il produit : si sa requête échoue, on RÉUTILISE ces
// catégories depuis l'instantané précédent (on ne perd jamais une famille de lieux).
// `cap` = plafond par groupe (échantillon uniforme) pour borner le poids du fichier.
const QUERIES = [
  { label: "cafés/bars", cats: ["cafe", "bar", "wine-bar"], cap: Infinity, data: wrap(`nwr["amenity"~"^(cafe|bar|pub)$"]["opening_hours"]["name"](${BBOX});`) },
  { label: "restaurants", cats: ["restaurant"], cap: Infinity, data: wrap(`nwr["amenity"="restaurant"]["opening_hours"]["name"](${BBOX});`) },
  { label: "pâtisseries/halles", cats: ["patisserie", "food-market"], cap: Infinity, data: wrap(`nwr["shop"~"^(bakery|pastry|confectionery|chocolate|deli)$"]["opening_hours"]["name"](${BBOX});nwr["amenity"="marketplace"]["opening_hours"]["name"](${BBOX});`) },
  { label: "parcs/jardins", cats: ["park", "garden"], cap: Infinity, data: wrap(`nwr["leisure"~"^(park|garden)$"]["opening_hours"]["name"](${BBOX});`) },
];

// Échantillon UNIFORME (pas les N premiers) : on garde 1 lieu sur k pour atteindre le plafond,
// afin de préserver la couverture partout dans Paris. Log de ce qui est écarté (pas de coupe silencieuse).
function capUniform(offers, cap, label) {
  if (offers.length <= cap) return offers;
  const k = offers.length / cap;
  const kept = [];
  for (let i = 0; i < offers.length && kept.length < cap; i += 1) {
    if (Math.floor(i / k) > Math.floor((i - 1) / k)) kept.push(offers[i]);
  }
  console.log(`[venues] ${label} : ${offers.length} → plafonné à ${kept.length} (échantillon uniforme, ${offers.length - kept.length} écartés pour le poids)`);
  return kept;
}

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

const CATEGORY = {
  cafe: "cafe", bar: "bar", pub: "bar", restaurant: "restaurant",
  park: "park", garden: "garden",
  bakery: "patisserie", pastry: "patisserie", confectionery: "patisserie", chocolate: "patisserie",
  deli: "food-market", marketplace: "food-market",
};
const DURATION = { cafe: 45, bar: 90, "wine-bar": 90, restaurant: 75, patisserie: 20, "food-market": 40, park: 60, garden: 45 };
const DESC = {
  cafe: "Un café où se poser.",
  bar: "Un bar pour boire un verre.",
  "wine-bar": "Un bar à vin pour un verre choisi.",
  restaurant: "Un restaurant pour un vrai repas.",
  patisserie: "Une pâtisserie pour une pause sucrée.",
  "food-market": "Un marché / une épicerie fine à parcourir.",
  park: "Un espace vert pour souffler.",
  garden: "Un jardin pour une pause au calme.",
};
// Un "bar à vin" est un bar OSM avec un signal vin (cuisine ou boisson) : on affine la catégorie.
const isWineBar = (t) => /wine|vin/i.test(t.cuisine || "") || t["drink:wine"] === "yes" || /bar à vin|wine bar|cave à/i.test(t.name || "");

function arrondissement(zip) {
  const m = /^75(\d{3})$/.exec(String(zip || ""));
  if (!m) return null;
  let n = parseInt(m[1], 10);
  if (n > 100) n -= 100;
  return n >= 1 && n <= 20 ? `${n}ᵉ arrondissement` : null;
}

function suitableFor(category) {
  if (category === "bar" || category === "wine-bar") return ["solo", "couple", "friends"];
  return ["solo", "couple", "friends", "family"]; // café, resto, pâtisserie, halle, parc, jardin
}

function price(category) {
  if (category === "park" || category === "garden") return { free: true };
  if (category === "restaurant") return { unknown: true, note: "à la carte" };
  if (category === "patisserie") return { unknown: true, note: "à la pièce" };
  return { unknown: true, note: "à la conso" }; // café, bar, bar à vin, halle
}

function toOffer(el) {
  const t = el.tags || {};
  const kind = t.amenity || t.leisure || t.shop;
  let category = CATEGORY[kind];
  if (!category) return null;
  if (category === "bar" && isWineBar(t)) category = "wine-bar"; // affine bar -> bar à vin

  const hours = parseOpeningHours(t.opening_hours);
  if (!hours) return null; // horaires non convertibles sûrement → on écarte

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const indoor = category !== "park" && category !== "garden"; // seuls parcs/jardins sont en plein air
  return {
    id: `osm-${el.type[0]}${el.id}`,
    source: "openstreetmap",
    demo: false,
    name: t.name,
    category,
    tags: [category, indoor ? "abrité" : "plein-air"],
    // Code postal OSM d'abord ; sinon point-dans-polygone (2/3 des lieux n'ont pas de CP).
    neighborhood: arrondissement(t["addr:postcode"]) || arrondissementLabel(lat, lng, BOUNDARIES) || "Paris",
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpass(query) {
  let lastErr;
  // 2 passes sur les miroirs (Overpass renvoie souvent un 504 transitoire quand il est chargé).
  for (let pass = 0; pass < 2; pass++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "today.paris/0.1" },
          body: "data=" + encodeURIComponent(query),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.trimStart().startsWith("<")) throw new Error("réponse HTML (surcharge Overpass)");
        return JSON.parse(text).elements || [];
      } catch (err) {
        console.warn(`[venues] ${url} -> ${err.message}`);
        lastErr = err;
        await sleep(2000);
      }
    }
  }
  throw lastErr;
}

async function loadExisting() {
  try {
    const j = JSON.parse(await readFile(OUT, "utf8"));
    const byCat = new Map();
    for (const o of j.offers || []) { if (!byCat.has(o.category)) byCat.set(o.category, []); byCat.get(o.category).push(o); }
    return { count: j.count || 0, byCat };
  } catch { return { count: 0, byCat: new Map() }; }
}

async function main() {
  try { BOUNDARIES = JSON.parse(await readFile(BOUND_PATH, "utf8")); }
  catch { console.warn("[venues] arrondissements.json absent — quartiers via code postal seulement."); }
  console.log("[venues] interrogation d'OpenStreetMap (Overpass)…");
  const existing = await loadExisting();
  const offers = [];
  let groupsOk = 0;

  for (const q of QUERIES) {
    let els;
    try {
      els = await fetchOverpass(q.data);
      groupsOk++;
    } catch (err) {
      // Repli : on garde CES catégories depuis l'instantané précédent (jamais de perte).
      const kept = q.cats.flatMap((c) => existing.byCat.get(c) || []);
      console.warn(`[venues] ${q.label} : ÉCHEC (${err.message}) — repli sur l'instantané précédent (${kept.length} lieux)`);
      offers.push(...kept);
      await sleep(1500);
      continue;
    }
    const seen = new Set();
    const groupOffers = [];
    for (const el of els) {
      const offer = toOffer(el);
      if (!offer || !q.cats.includes(offer.category)) continue;
      const key = offer.name.toLowerCase() + offer.category;
      if (seen.has(key)) continue;
      seen.add(key);
      groupOffers.push(offer);
    }
    console.log(`[venues] ${q.label} : ${els.length} éléments → ${groupOffers.length} lieux`);
    offers.push(...capUniform(groupOffers, q.cap, q.label));
    await sleep(1500); // on ménage Overpass entre les requêtes
  }

  // GARDE-FOU : ne JAMAIS écraser l'instantané par un résultat vide ou tronqué (Overpass en panne).
  if (offers.length === 0 || (existing.count > 0 && offers.length < existing.count * 0.5)) {
    console.error(`[venues] résultat suspect (${offers.length} lieux vs ${existing.count} précédents, ${groupsOk}/${QUERIES.length} groupes OK) — on GARDE l'instantané précédent.`);
    process.exit(1);
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
  console.log(`[venues] ${offers.length} lieux gardés (horaires réels), ${groupsOk}/${QUERIES.length} groupes récupérés.`);
  console.log("[venues] par catégorie :", JSON.stringify(byCat));
  console.log("[venues] écrit :", OUT);
}

main().catch((e) => {
  console.error("[venues] échec :", e.message);
  process.exit(1);
});
