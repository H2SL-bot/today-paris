#!/usr/bin/env node
// scripts/translate-events.mjs
// Entretien du dictionnaire de traduction des ÉVÉNEMENTS
// (domains/today.paris/translations.events.json), pour garder la version anglaise fraîche
// à mesure que les événements du jour changent.
//
// - Récupère les événements du jour (mêmes bornes que l'adaptateur Open Data).
// - Repère les titres SANS traduction dans le dictionnaire.
// - Par défaut (sans clé) : signale le nombre manquant et les liste dans
//   domains/today.paris/translations.todo.json (à traduire hors ligne, p. ex. via une passe LLM).
// - Si DEEPL_AUTH_KEY est fournie : remplit automatiquement (meilleur effort).
//   ⚠️ DeepL peut traduire des noms propres (groupes, salles) : le dictionnaire vérifié
//   à la main/LLM reste la référence de qualité. C'est un filet, pas un remplacement.
//
// Ne bloque JAMAIS le build (sort en code 0 même en cas d'erreur réseau).

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TZ = "Europe/Paris";
const DICT_PATH = path.join(ROOT, "domains", "today.paris", "translations.events.json");
const TODO_PATH = path.join(ROOT, "domains", "today.paris", "translations.todo.json");
const BASE = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records";

const strip = (h) => String(h || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
const shorten = (s, n = 160) => { const t = strip(s); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };

async function fetchToday() {
  const now = new Date();
  const [y, mo, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  const end = new Date(Date.UTC(y, mo - 1, d, 22, 59, 59, 999)); // ~fin de journée Paris (borne large)
  const where = `date_end >= '${now.toISOString()}' and date_start <= '${end.toISOString()}' and lat_lon is not null`;
  const map = new Map();
  for (let off = 0; off < 300; off += 100) {
    const url = `${BASE}?where=${encodeURIComponent(where)}&order_by=${encodeURIComponent("date_start desc")}&limit=100&offset=${off}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) break;
    const rows = (await r.json()).results || [];
    for (const x of rows) if (x.lat_lon && x.title && !map.has(x.title)) map.set(x.title, shorten(x.lead_text || x.description));
    if (rows.length < 100) break;
  }
  return map; // Map<titreFR, descFR>
}

async function deeplTranslate(texts, key) {
  const host = key.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const out = [];
  for (let i = 0; i < texts.length; i += 40) { // DeepL : 50 textes max/appel
    const chunk = texts.slice(i, i + 40);
    const body = new URLSearchParams();
    body.set("auth_key", key);
    body.set("source_lang", "FR");
    body.set("target_lang", "EN-GB");
    for (const t of chunk) body.append("text", t || "·");
    const r = await fetch(`${host}/v2/translate`, { method: "POST", body });
    if (!r.ok) throw new Error(`DeepL HTTP ${r.status}`);
    out.push(...((await r.json()).translations || []).map((t) => t.text));
  }
  return out;
}

async function main() {
  const dict = existsSync(DICT_PATH) ? JSON.parse(await readFile(DICT_PATH, "utf8")) : {};
  const today = await fetchToday();
  const missing = [...today.keys()].filter((t) => !dict[t]);
  console.log(`[translate:events] ${today.size} événements du jour · ${Object.keys(dict).length} déjà au dico · ${missing.length} manquants.`);
  if (!missing.length) return console.log("[translate:events] rien à faire.");

  const key = process.env.DEEPL_AUTH_KEY;
  if (!key) {
    await writeFile(TODO_PATH, JSON.stringify(missing.map((t) => ({ fr: t, desc: today.get(t) })), null, 0));
    console.log(`[translate:events] Pas de DEEPL_AUTH_KEY → ${missing.length} titres listés dans translations.todo.json (repli : ils s'afficheront en français jusqu'à traduction).`);
    return;
  }
  const names = await deeplTranslate(missing, key);
  const descs = await deeplTranslate(missing.map((t) => today.get(t) || ""), key);
  missing.forEach((t, i) => { dict[t] = { n: names[i] || t, d: descs[i] || "" }; });
  await writeFile(DICT_PATH, JSON.stringify(dict, null, 0));
  console.log(`[translate:events] +${missing.length} traductions via DeepL → ${Object.keys(dict).length} au total.`);
}

main().catch((e) => { console.error("[translate:events] échec (non bloquant) :", e.message); process.exit(0); });
