#!/usr/bin/env node
// scripts/healthcheck.mjs
// FILET DE SÉCURITÉ : contrôle le site construit (docs/) AVANT publication.
// Si un contrôle BLOQUANT échoue, on sort en erreur → la boucle ne publie pas et
// le site en ligne reste sur sa dernière version saine. Mieux vaut un site d'hier
// qui marche qu'un site d'aujourd'hui cassé.
//
// Ce filet attrape les CASSES (fichier manquant, lien mort, données effondrées,
// gabarit non rempli). Il ne juge pas la QUALITÉ d'une traduction — un texte
// resté en français passe le contrôle (c'est un repli volontaire, pas une panne).

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS } from "../domains/today.paris/i18n.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const DOM = path.join(ROOT, "domains", "today.paris");

const dur = [], mou = []; // bloquants / avertissements
const bloque = (m) => dur.push(m);
const alerte = (m) => mou.push(m);
const lire = (p) => readFileSync(p, "utf8");
const jsonDe = (p) => JSON.parse(lire(p));

// Un chemin d'URL du site → le fichier qui le sert dans docs/
function fichierPourUrl(u) {
  let p = String(u).replace(/^https?:\/\/[^/]+/, "");
  p = p.split("#")[0].split("?")[0];
  if (!p.startsWith("/")) return null;
  if (p.endsWith("/")) p += "index.html";
  return path.join(DOCS, p);
}

// 1. Le socle du site
for (const f of ["index.html", "app.js", "config.js", "styles.css", "sw.js", "manifest.webmanifest", "sitemap.xml", "robots.txt", "events.json", "venues.json"]) {
  const p = path.join(DOCS, f);
  if (!existsSync(p)) bloque(`fichier essentiel absent : docs/${f}`);
  else if (statSync(p).size < 50) bloque(`fichier essentiel quasi vide : docs/${f}`);
}

// 2. Une page d'accueil par langue, réellement rendue
for (const l of LANGS) {
  const p = path.join(DOCS, l === "fr" ? "index.html" : path.join(l, "index.html"));
  if (!existsSync(p)) { bloque(`accueil manquant : /${l === "fr" ? "" : l + "/"}`); continue; }
  const h = lire(p);
  if (h.includes("{{")) bloque(`gabarit non rempli (reste des {{…}}) : /${l}/`);
  const t = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  if (t.trim().length < 10) bloque(`titre vide ou trop court : /${l}/`);
  if (!/<html[^>]+lang=/.test(h)) bloque(`attribut lang absent : /${l}/`);
  if (l === "ar" && !/dir="rtl"/.test(h)) bloque(`arabe sans dir="rtl" : /ar/`);
}

// 3. Volume des données : un effondrement = source cassée, pas une vraie journée creuse
try {
  const ev = jsonDe(path.join(DOCS, "events.json"));
  const n = (ev.offers || []).length;
  if (n < 50) bloque(`events.json effondré : ${n} événements (attendu ≥ 50)`);
  else if (n < 200) alerte(`events.json bas : ${n} événements`);
} catch (e) { bloque(`events.json illisible : ${e.message}`); }
try {
  const ve = jsonDe(path.join(DOCS, "venues.json"));
  const n = (ve.offers || []).length;
  if (n < 500) bloque(`venues.json effondré : ${n} lieux (attendu ≥ 500)`);
} catch (e) { bloque(`venues.json illisible : ${e.message}`); }

// 4. Dictionnaires de traduction : présents et non effondrés
for (const l of LANGS.filter((x) => x !== "fr")) {
  const p = path.join(DOCS, `translations.${l}.json`);
  if (!existsSync(p)) { alerte(`dictionnaire absent : translations.${l}.json (repli français)`); continue; }
  try {
    const n = Object.keys(jsonDe(p)).length;
    if (n < 200) bloque(`dictionnaire ${l} effondré : ${n} entrées (attendu ≥ 200)`);
  } catch (e) { bloque(`dictionnaire ${l} illisible : ${e.message}`); }
}

// 5. Sitemap : chaque URL annoncée à Google doit exister pour de vrai
let urlsSitemap = [];
try {
  const xml = lire(path.join(DOCS, "sitemap.xml"));
  urlsSitemap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urlsSitemap.length < LANGS.length) bloque(`sitemap trop court : ${urlsSitemap.length} URLs`);
  for (const u of urlsSitemap) {
    const f = fichierPourUrl(u);
    if (!f || !existsSync(f)) bloque(`sitemap → page inexistante : ${u}`);
  }
} catch (e) { bloque(`sitemap illisible : ${e.message}`); }

// 6. Toutes les pages : liens internes, hreflang, canonical, JSON-LD, placeholders
function pagesHtml(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pagesHtml(p, acc);
    else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}
const pages = pagesHtml(DOCS);
if (pages.length < LANGS.length) bloque(`trop peu de pages générées : ${pages.length}`);

const PLACEHOLDERS = /\{(name|date|home|n|distance|price|mood|close|city)\}/;
let liensMorts = 0;
for (const p of pages) {
  const rel = "/" + path.relative(DOCS, p).replace(/index\.html$/, "");
  const h = lire(p);

  if (h.includes("{{")) bloque(`gabarit non rempli : ${rel}`);
  // Placeholders résiduels dans le contenu visible (titre, h1, description)
  const zones = [(h.match(/<title>([^<]*)<\/title>/) || [])[1], (h.match(/<h1[^>]*>([^<]*)</) || [])[1], (h.match(/name="description" content="([^"]*)"/) || [])[1]];
  for (const z of zones) if (z && PLACEHOLDERS.test(z)) bloque(`placeholder non remplacé : ${rel} → « ${z.slice(0, 60)} »`);

  // Liens internes (href="/…") : la cible doit exister
  for (const m of h.matchAll(/href="(\/[^"#?]*)"/g)) {
    const cible = m[1];
    if (/\.(css|js|png|svg|webmanifest|json|xml|txt|ico)$/.test(cible)) continue;
    const f = fichierPourUrl(cible);
    if (f && !existsSync(f)) { bloque(`lien interne mort : ${rel} → ${cible}`); liensMorts++; }
    if (liensMorts > 12) break;
  }
  // hreflang : la version annoncée doit exister (c'est le bug x-default de juillet)
  for (const m of h.matchAll(/rel="alternate"[^>]*href="([^"]+)"/g)) {
    const f = fichierPourUrl(m[1]);
    if (f && !existsSync(f)) bloque(`hreflang → page inexistante : ${rel} → ${m[1]}`);
  }
  // canonical présent et cohérent
  if (!/rel="canonical"/.test(h)) alerte(`canonical absent : ${rel}`);
  // JSON-LD : doit être du JSON valide, sinon Google l'ignore silencieusement
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { bloque(`JSON-LD invalide : ${rel}`); }
  }
}

// 7. Service worker : version bien formée (sinon le cache ne se rafraîchit pas)
try {
  const sw = lire(path.join(DOCS, "sw.js"));
  if (!/const CACHE = "today-paris-v\d+"/.test(sw)) bloque(`sw.js : version de cache introuvable ou mal formée`);
} catch (e) { bloque(`sw.js illisible : ${e.message}`); }

// --- Verdict
console.log(`[healthcheck] ${pages.length} pages · ${urlsSitemap.length} URLs au sitemap · ${LANGS.length} langues`);
for (const m of mou) console.log(`  ⚠️  ${m}`);
if (dur.length) {
  console.error(`\n❌ ${dur.length} problème(s) BLOQUANT(S) — publication annulée :`);
  for (const m of dur.slice(0, 25)) console.error(`  • ${m}`);
  if (dur.length > 25) console.error(`  … et ${dur.length - 25} autre(s)`);
  console.error(`\nLe site en ligne reste sur sa version précédente (saine).`);
  process.exit(1);
}
console.log(`✅ Site sain — publication autorisée.${mou.length ? ` (${mou.length} avertissement(s) non bloquant(s))` : ""}`);
