#!/usr/bin/env node
// scripts/fetch-parcs.mjs
// Complète venues.json avec les ESPACES VERTS VISITABLES de la Ville de Paris
// (jeu officiel « Espaces verts et assimilés »). Objectif : des lieux où un
// visiteur a une raison d'aller — squares, jardins, parcs, promenades.
//
// Ce qui est EXCLU : jardinières, murs végétalisés, talus, plates-bandes,
// jardinets, décorations, pelouses d'accompagnement — du décor urbain, pas des
// destinations. Et tout ce qui fait moins de 1000 m².
//
// HORAIRES, sans rien inventer :
//   • sans clôture           -> accès permanent (24/7), c'est une donnée publiée ;
//   • clôturé + horaires OSM -> on adopte les horaires d'OpenStreetMap ;
//   • clôturé sans horaires  -> horaires INCONNUS : le lieu est proposé, mais
//     jamais présenté comme ouvert, et il est écarté du filtre « ouvert maintenant ».
// À lancer APRÈS fetch:venues ; complète, n'écrase jamais.

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { distanceKm } from "../engine/geo.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIBLE = path.join(ROOT, "domains", "today.paris", "venues.json");
const VISITABLES = new Set(["Square", "Jardin", "Parc", "Promenade"]);
const SURFACE_MIN = 1000; // m² — en deçà, ce n'est pas une destination
const API = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/espaces_verts/records";

// Les données sont en capitales : « JARDIN DE KYIV » → « Jardin de Kyiv ».
const PETITS = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et", "à", "au", "aux", "sur", "sous", "en", "un", "une"]);
function casseTitre(s) {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim().split(" ")
    .map((m, i) => (i > 0 && PETITS.has(m.replace(/['’]$/, "")) ? m
      : m.replace(/^[\p{L}]/u, (c) => c.toUpperCase()).replace(/([-'’])(\p{L})/gu, (_, s, c) => s + c.toUpperCase())))
    .join(" ");
}
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function main() {
  if (!existsSync(CIBLE)) { console.log("[parcs] venues.json absent — lance d'abord `npm run fetch:venues`."); return; }
  const doc = JSON.parse(readFileSync(CIBLE, "utf8"));
  const offres = doc.offers || [];

  const brut = [];
  for (let offset = 0; offset < 3000; offset += 100) {
    const u = `${API}?limit=100&offset=${offset}&select=nsq_espace_vert,nom_ev,categorie,presence_cloture,adresse_codepostal,geom_x_y,surface_totale_reelle`;
    const r = await fetch(u).catch(() => null);
    if (!r || !r.ok) { console.log(`[parcs] Open Data indisponible (${r ? r.status : "réseau"}) — venues.json inchangé.`); return; }
    const j = await r.json();
    const res = j.results || [];
    brut.push(...res);
    if (res.length < 100) break;
  }

  const candidats = brut.filter((x) =>
    VISITABLES.has(x.categorie) && x.geom_x_y && x.nom_ev &&
    (x.surface_totale_reelle || 0) >= SURFACE_MIN);

  // Parcs déjà présents (OpenStreetMap) : servent à la fois de source d'horaires
  // pour les espaces clôturés voisins, et d'anti-doublon.
  const parcsOSM = offres.filter((o) => ["park", "garden"].includes(o.category));
  const nomsExistants = new Set(parcsOSM.map((o) => norm(o.name)));

  const nouveaux = [];
  let permanents = 0, viaOSM = 0, inconnus = 0;
  for (const x of candidats) {
    const nom = casseTitre(x.nom_ev);
    const pos = { lat: x.geom_x_y.lat, lng: x.geom_x_y.lon };
    if (nomsExistants.has(norm(nom))) continue;
    if (parcsOSM.some((o) => distanceKm(pos, { lat: o.lat, lng: o.lng }) < 0.08)) continue;
    if (nouveaux.some((o) => distanceKm(pos, { lat: o.lat, lng: o.lng }) < 0.08)) continue;

    let hours = null;
    if (x.presence_cloture === "Non") { hours = "24/7"; permanents++; }
    else {
      // Un parc OSM proche a peut-être ses horaires publiés : on les reprend.
      const jumeau = parcsOSM.find((o) => o.hours && distanceKm(pos, { lat: o.lat, lng: o.lng }) < 0.15);
      if (jumeau) { hours = jumeau.hours; viaOSM++; } else inconnus++;
    }

    const cp = String(x.adresse_codepostal || "");
    const arr = /^75(\d{3})$/.test(cp) ? Number(cp.slice(2)) : null;
    nouveaux.push({
      id: `paris-ev-${x.nsq_espace_vert}`,
      source: "opendata-paris",
      demo: false,
      name: nom,
      category: x.categorie === "Parc" ? "park" : "garden",
      tags: ["plein air", "gratuit"],
      neighborhood: arr >= 1 && arr <= 20 ? `${arr}${arr === 1 ? "ᵉʳ" : "ᵉ"} arrondissement` : "Paris",
      lat: pos.lat, lng: pos.lng,
      ...(hours ? { hours } : {}), // pas d'horaires => statut « inconnu », jamais « ouvert »
      price: { amount: 0, free: true, note: "" },
      durationMin: 60,
      suitableFor: ["solo", "couple", "friends", "family"],
      descriptionShort: "Un espace vert pour souffler.", // gabarit déjà traduit en 13 langues
      bookingUrl: "", bookingLabel: "",
    });
  }

  if (!nouveaux.length) { console.log("[parcs] aucun espace vert à ajouter (déjà couverts)."); return; }
  doc.offers = [...offres, ...nouveaux];
  doc.count = doc.offers.length;
  const tmp = `${CIBLE}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc));
  renameSync(tmp, CIBLE);
  console.log(`[parcs] +${nouveaux.length} espaces verts visitables (≥${SURFACE_MIN} m², squares/jardins/parcs/promenades).`);
  console.log(`[parcs]   ${permanents} en accès permanent · ${viaOSM} avec horaires OpenStreetMap · ${inconnus} horaires inconnus (jamais annoncés ouverts).`);
  console.log(`[parcs] venues.json : ${offres.length} → ${doc.offers.length} lieux.`);
}

main().catch((e) => { console.error("[parcs] échec :", e.message, "— venues.json inchangé."); process.exit(0); });
