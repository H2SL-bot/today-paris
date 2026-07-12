#!/usr/bin/env node
// scripts/build-web.mjs
// Assemble le site STATIQUE dans docs/ (servi par GitHub Pages) à partir des modules
// réels (source unique) : moteur, couche données, config du domaine, interface web.
// Aucun bundler : on copie des modules ES natifs que le navigateur importe directement.

import { cp, mkdir, rm, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const DOMAIN = process.env.DOMAIN || "today.paris";
// Domaine personnalisé à écrire dans docs/CNAME (vide = pas de CNAME, on reste sur l'URL github.io)
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || "";

const copy = (from, to) => cp(path.join(ROOT, from), path.join(DOCS, to), { recursive: true });

async function build() {
  await rm(DOCS, { recursive: true, force: true });
  await mkdir(path.join(DOCS, "data", "adapters"), { recursive: true });
  await mkdir(path.join(DOCS, "engine"), { recursive: true });

  // 1. Moteur (source unique, navigateur-compatible)
  await copy("engine", "engine");
  // 2. Couche données nécessaire côté client
  await copy("data/freshness.js", "data/freshness.js");
  await copy("data/adapters/opendata-paris.js", "data/adapters/opendata-paris.js");
  // 3. Config du domaine
  await copy(`domains/${DOMAIN}/config.js`, "config.js");
  // 4. Lieux (instantané OpenStreetMap) — s'il a été généré
  if (existsSync(path.join(ROOT, "domains", DOMAIN, "venues.json"))) {
    await copy(`domains/${DOMAIN}/venues.json`, "venues.json");
  } else {
    console.warn("[build:web] venues.json absent — lance `npm run fetch:venues` pour inclure les lieux.");
  }
  // 5. Interface + carte (Leaflet vendu localement)
  await copy("web/index.html", "index.html");
  await copy("web/app.js", "app.js");
  await copy("public/styles.css", "styles.css");
  await copy("web/vendor", "vendor");
  await copy("web/og.png", "og.png"); // carte de partage (Open Graph)

  // 5. SEO : robots.txt + sitemap.xml
  const baseUrl = CUSTOM_DOMAIN ? `https://${CUSTOM_DOMAIN}/` : "https://h2sl-bot.github.io/today-paris/";
  await writeFile(path.join(DOCS, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${baseUrl}sitemap.xml\n`);
  await writeFile(
    path.join(DOCS, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${baseUrl}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n</urlset>\n`
  );

  // 6. Fichiers GitHub Pages
  await writeFile(path.join(DOCS, ".nojekyll"), ""); // sert le dossier tel quel
  if (CUSTOM_DOMAIN) await writeFile(path.join(DOCS, "CNAME"), CUSTOM_DOMAIN + "\n");

  const files = await readdir(DOCS);
  console.log(`[build:web] docs/ généré (domaine ${DOMAIN}${CUSTOM_DOMAIN ? `, CNAME ${CUSTOM_DOMAIN}` : ""}) :`, files.join(", "));
}

build().catch((e) => {
  console.error("[build:web] échec :", e);
  process.exit(1);
});
