#!/usr/bin/env node
// scripts/fetch-parcs.mjs
// Complète venues.json avec les ESPACES VERTS de la Ville de Paris (Open Data officiel).
// On ne retient que ceux SANS CLÔTURE : l'absence de clôture est une donnée publiée,
// et elle signifie que le lieu est accessible en permanence. Aucun horaire n'est inventé —
// les squares clôturés (qui ferment la nuit à des heures non publiées) sont écartés.
// À lancer APRÈS fetch:venues ; n'écrase jamais les lieux existants, il complète.

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { distanceKm } from "../engine/geo.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIBLE = path.join(ROOT, "domains", "today.paris", "venues.json");
const CATS = new Set(["Square", "Jardin", "Parc", "Promenade", "Espace Vert", "Jardin partage"]);
const API = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/espaces_verts/records";

// « JARDIN DE KYIV » → « Jardin de Kyiv » (les données sont en capitales).
const PETITS = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et", "à", "au", "aux", "sur", "sous", "en"]);
function casseTitre(s) {
  const mots = String(s).toLowerCase().replace(/\s+/g, " ").trim().split(" ");
  return mots.map((m, i) => {
    if (i > 0 && PETITS.has(m.replace(/['’]$/, ""))) return m;
    return m.replace(/^[\p{L}]/u, (c) => c.toUpperCase()).replace(/([-'’])(\p{L})/gu, (_, s2, c) => s2 + c.toUpperCase());
  }).join(" ");
}

async function main() {
  if (!existsSync(CIBLE)) { console.log("[parcs] venues.json absent — lance d'abord `npm run fetch:venues`."); return; }
  const doc = JSON.parse(readFileSync(CIBLE, "utf8"));
  const offres = doc.offers || [];

  // Récupération paginée du jeu officiel.
  const brut = [];
  for (let offset = 0; offset < 3000; offset += 100) {
    const u = `${API}?limit=100&offset=${offset}&select=nsq_espace_vert,nom_ev,categorie,presence_cloture,adresse_codepostal,geom_x_y`;
    const r = await fetch(u).catch(() => null);
    if (!r || !r.ok) { console.log(`[parcs] Open Data indisponible (${r ? r.status : "réseau"}) — venues.json inchangé.`); return; }
    const j = await r.json();
    const res = j.results || [];
    brut.push(...res);
    if (res.length < 100) break;
  }

  const candidats = brut.filter((x) =>
    CATS.has(x.categorie) && x.presence_cloture === "Non" && x.geom_x_y && x.nom_ev);

  // Déduplication : on n'ajoute pas un espace vert déjà présent (même nom OU à moins de 80 m).
  const dejaLa = offres.filter((o) => ["park", "garden"].includes(o.category));
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const nomsExistants = new Set(dejaLa.map((o) => norm(o.name)));

  const nouveaux = [];
  for (const x of candidats) {
    const nom = casseTitre(x.nom_ev);
    const pos = { lat: x.geom_x_y.lat, lng: x.geom_x_y.lon };
    if (nomsExistants.has(norm(nom))) continue;
    if (dejaLa.some((o) => distanceKm(pos, { lat: o.lat, lng: o.lng }) < 0.08)) continue;
    if (nouveaux.some((o) => distanceKm(pos, { lat: o.lat, lng: o.lng }) < 0.08)) continue;
    const cp = String(x.adresse_codepostal || "");
    const arr = /^75(\d{3})$/.test(cp) ? Number(cp.slice(2)) : null;
    nouveaux.push({
      id: `paris-ev-${x.nsq_espace_vert}`,
      source: "opendata-paris",
      demo: false,
      name: nom,
      category: x.categorie === "Parc" ? "park" : "garden",
      tags: ["plein air", "gratuit"],
      neighborhood: arr && arr >= 1 && arr <= 20 ? `${arr}${arr === 1 ? "ᵉʳ" : "ᵉ"} arrondissement` : "Paris",
      lat: pos.lat, lng: pos.lng,
      hours: "24/7", // sans clôture = accessible en permanence (donnée publiée, non inventée)
      price: { amount: 0, free: true, note: "" },
      durationMin: 60,
      suitableFor: ["solo", "couple", "friends", "family"],
      descriptionShort: "Un espace vert pour souffler.", // gabarit déjà traduit dans les 13 langues
      bookingUrl: "", bookingLabel: "",
    });
  }

  if (!nouveaux.length) { console.log("[parcs] aucun espace vert à ajouter (déjà couverts)."); return; }
  doc.offers = [...offres, ...nouveaux];
  doc.count = doc.offers.length;
  const tmp = `${CIBLE}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc));
  renameSync(tmp, CIBLE);
  console.log(`[parcs] +${nouveaux.length} espaces verts de la Ville de Paris (sans clôture, accessibles en permanence).`);
  console.log(`[parcs] venues.json : ${offres.length} → ${doc.offers.length} lieux.`);
}

main().catch((e) => { console.error("[parcs] échec :", e.message, "— venues.json inchangé."); process.exit(0); });
