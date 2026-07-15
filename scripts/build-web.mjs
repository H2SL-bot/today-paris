#!/usr/bin/env node
// scripts/build-web.mjs
// Assemble le site STATIQUE dans docs/ (servi par GitHub Pages) à partir des modules réels.
// Rend l'accueil en 2 langues : / (fr) et /en/ (en). Aucun bundler : modules ES natifs.

import { cp, mkdir, rm, writeFile, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UI, PILLARS } from "../domains/today.paris/i18n.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const DOMAIN = process.env.DOMAIN || "today.paris";
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || "";
const BASE = CUSTOM_DOMAIN ? `https://${CUSTOM_DOMAIN}/` : "https://h2sl-bot.github.io/today-paris/";

const copy = (from, to) => cp(path.join(ROOT, from), path.join(DOCS, to), { recursive: true });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function renderHome(lang, template) {
  const L = UI[lang];
  const canonical = lang === "en" ? BASE + "en/" : BASE;
  const prefix = lang === "en" ? "/en/" : "/";
  const hreflang = [
    `  <link rel="alternate" hreflang="fr" href="${BASE}" />`,
    `  <link rel="alternate" hreflang="en" href="${BASE}en/" />`,
    `  <link rel="alternate" hreflang="x-default" href="${BASE}" />`,
  ].join("\n");
  const jsonld = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: "today.paris", url: BASE, inLanguage: lang },
      {
        "@type": "WebApplication", name: "today.paris", url: canonical, description: L.metaDesc,
        applicationCategory: "TravelApplication", operatingSystem: "Web", inLanguage: lang,
        areaServed: { "@type": "City", name: "Paris" }, offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      },
    ],
  });
  const faqHtml = L.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n      ");
  const pillarLinks = PILLARS.map((p) => `<a href="${prefix}${lang === "en" ? p.en : p.fr}/">${esc(lang === "en" ? p.labelEn : p.labelFr)}</a>`).join(" ·\n        ");

  const vars = {
    htmlLang: L.htmlLang, title: esc(L.title), metaDesc: esc(L.metaDesc), ogTitle: esc(L.ogTitle), ogDesc: esc(L.ogDesc),
    ogLocale: lang === "en" ? "en_US" : "fr_FR", canonical, hreflang, jsonld,
    switchHref: L.switchHref, switchTo: esc(L.switchTo), tagline: esc(L.tagline),
    where: esc(L.where), geoloc: esc(L.geoloc), geolocTitle: esc(L.geolocTitle), who: esc(L.who),
    budget: esc(L.budget), mood: esc(L.mood), time: esc(L.time), openNow: esc(L.openNow), submit: esc(L.submit), mapLabel: esc(L.mapLabel),
    aboutH2: esc(L.aboutH2), aboutP: L.aboutP, faqHtml, explore: esc(L.explore), pillarLinks, footer: esc(L.footer),
  };
  let html = template;
  for (const [k, v] of Object.entries(vars)) html = html.replaceAll(`{{${k}}}`, v);
  return html;
}

async function build() {
  await rm(DOCS, { recursive: true, force: true });
  await mkdir(path.join(DOCS, "data", "adapters"), { recursive: true });
  await mkdir(path.join(DOCS, "engine"), { recursive: true });
  await mkdir(path.join(DOCS, "en"), { recursive: true });

  // 1. Moteur + 2. couche données + 3. config + langue
  await copy("engine", "engine");
  await copy("data/freshness.js", "data/freshness.js");
  await copy("data/adapters/opendata-paris.js", "data/adapters/opendata-paris.js");
  await copy(`domains/${DOMAIN}/config.js`, "config.js");
  await copy(`domains/${DOMAIN}/i18n.js`, "i18n.js");
  await copy(`domains/${DOMAIN}/translate.js`, "translate.js");
  // Dictionnaire de traduction des événements (facultatif — présent une fois généré).
  if (existsSync(path.join(ROOT, "domains", DOMAIN, "translations.events.json")))
    await copy(`domains/${DOMAIN}/translations.events.json`, "translations.events.json");
  // 4. Lieux (instantané OpenStreetMap)
  if (existsSync(path.join(ROOT, "domains", DOMAIN, "venues.json"))) await copy(`domains/${DOMAIN}/venues.json`, "venues.json");
  else console.warn("[build:web] venues.json absent — lance `npm run fetch:venues`.");
  // 4 bis. Événements (instantané quotidien Open Data — inventaire complet)
  if (existsSync(path.join(ROOT, "domains", DOMAIN, "events.json"))) await copy(`domains/${DOMAIN}/events.json`, "events.json");
  else console.warn("[build:web] events.json absent — lance `npm run fetch:events` (le site repassera en direct).");

  // 5. Interface bilingue : / (fr) et /en/ (en)
  const template = await readFile(path.join(ROOT, "web", "index.html"), "utf8");
  await writeFile(path.join(DOCS, "index.html"), renderHome("fr", template));
  await writeFile(path.join(DOCS, "en", "index.html"), renderHome("en", template));
  await copy("web/app.js", "app.js");
  await copy("web/tableau-de-bord.html", "tableau-de-bord.html");
  await copy("public/styles.css", "styles.css");
  await copy("web/vendor", "vendor");
  await copy("web/og.png", "og.png");
  await copy("web/manifest.webmanifest", "manifest.webmanifest");
  await copy("web/sw.js", "sw.js");
  await copy("web/icon-192.png", "icon-192.png");
  await copy("web/icon-512.png", "icon-512.png");
  await copy("web/apple-touch-icon.png", "apple-touch-icon.png");

  // 6. SEO : robots + sitemap (les 2 accueils ; build:pages complètera avec les piliers)
  await writeFile(path.join(DOCS, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`);
  await writeFile(
    path.join(DOCS, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${BASE}</loc><priority>1.0</priority></url>\n  <url><loc>${BASE}en/</loc><priority>0.9</priority></url>\n</urlset>\n`
  );

  // 7. GitHub Pages
  await writeFile(path.join(DOCS, ".nojekyll"), "");
  if (CUSTOM_DOMAIN) await writeFile(path.join(DOCS, "CNAME"), CUSTOM_DOMAIN + "\n");

  const files = await readdir(DOCS);
  console.log(`[build:web] docs/ généré (fr + en) :`, files.join(", "));
}

build().catch((e) => { console.error("[build:web] échec :", e); process.exit(1); });
