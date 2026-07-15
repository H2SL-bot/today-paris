#!/usr/bin/env node
// scripts/build-web.mjs
// Assemble le site STATIQUE dans docs/ (servi par GitHub Pages) à partir des modules réels.
// Rend l'accueil en 2 langues : / (fr) et /en/ (en). Aucun bundler : modules ES natifs.

import { cp, mkdir, rm, writeFile, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UI, PILLARS, LANGS, LANG_LABELS, langHref, pillarSlug, pillarLabel, GYG } from "../domains/today.paris/i18n.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const DOMAIN = process.env.DOMAIN || "today.paris";
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || "";
const BASE = CUSTOM_DOMAIN ? `https://${CUSTOM_DOMAIN}/` : "https://h2sl-bot.github.io/today-paris/";
const urlFor = (lang) => BASE + (lang === "fr" ? "" : lang + "/"); // accueil d'une langue

const copy = (from, to) => cp(path.join(ROOT, from), path.join(DOCS, to), { recursive: true });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function renderHome(lang, template) {
  const L = UI[lang];
  const canonical = urlFor(lang);
  const hreflang = [
    ...LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${urlFor(l)}" />`),
    `  <link rel="alternate" hreflang="x-default" href="${BASE}" />`,
  ].join("\n");
  // Sélecteur de langue à 4 entrées (langue courante en évidence).
  const langSwitch = LANGS.map((l) =>
    l === lang ? `<span class="cur">${LANG_LABELS[l]}</span>` : `<a href="${langHref(l)}" hreflang="${l}">${LANG_LABELS[l]}</a>`
  ).join(" · ");
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
  const g = GYG.text[lang] || GYG.text.en;
  const gygSection = `<aside class="affiliate">
      <p>${esc(g.p)}</p>
      <p><a class="btn-action affiliate-cta" href="${GYG.url}" target="_blank" rel="sponsored noopener nofollow">${esc(g.cta)}</a></p>
      <p class="affiliate-note">${esc(g.note)}</p>
    </aside>`;
  const pillarLinks = PILLARS.map((p) => `<a href="${langHref(lang)}${pillarSlug(p, lang)}/">${esc(pillarLabel(p, lang))}</a>`).join(" ·\n        ");

  const vars = {
    htmlLang: L.htmlLang, dir: L.dir, title: esc(L.title), metaDesc: esc(L.metaDesc), ogTitle: esc(L.ogTitle), ogDesc: esc(L.ogDesc),
    ogLocale: L.ogLocale, canonical, hreflang, jsonld, langSwitch, tagline: esc(L.tagline),
    where: esc(L.where), geoloc: esc(L.geoloc), geolocTitle: esc(L.geolocTitle), who: esc(L.who),
    budget: esc(L.budget), mood: esc(L.mood), time: esc(L.time), openNow: esc(L.openNow), submit: esc(L.submit), surprise: esc(L.surprise), mapLabel: esc(L.mapLabel),
    aboutH2: esc(L.aboutH2), aboutP: L.aboutP, faqHtml, explore: esc(L.explore), pillarLinks, footer: esc(L.footer), gygSection,
  };
  let html = template;
  for (const [k, v] of Object.entries(vars)) html = html.replaceAll(`{{${k}}}`, v);
  return html;
}

async function build() {
  await rm(DOCS, { recursive: true, force: true });
  await mkdir(path.join(DOCS, "data", "adapters"), { recursive: true });
  await mkdir(path.join(DOCS, "engine"), { recursive: true });

  // 1. Moteur + 2. couche données + 3. config + langue
  await copy("engine", "engine");
  await copy("data/freshness.js", "data/freshness.js");
  await copy("data/adapters/opendata-paris.js", "data/adapters/opendata-paris.js");
  await copy(`domains/${DOMAIN}/config.js`, "config.js");
  await copy(`domains/${DOMAIN}/i18n.js`, "i18n.js");
  await copy(`domains/${DOMAIN}/translate.js`, "translate.js");
  await copy(`domains/${DOMAIN}/ui-i18n.data.js`, "ui-i18n.data.js");
  // Dictionnaires de traduction des événements, par langue (facultatifs — repli français sinon).
  for (const lang of LANGS.filter((l) => l !== "fr")) {
    if (existsSync(path.join(ROOT, "domains", DOMAIN, `translations.${lang}.json`)))
      await copy(`domains/${DOMAIN}/translations.${lang}.json`, `translations.${lang}.json`);
  }
  // 4. Lieux (instantané OpenStreetMap)
  if (existsSync(path.join(ROOT, "domains", DOMAIN, "venues.json"))) await copy(`domains/${DOMAIN}/venues.json`, "venues.json");
  else console.warn("[build:web] venues.json absent — lance `npm run fetch:venues`.");
  // 4 bis. Événements (instantané quotidien Open Data — inventaire complet)
  if (existsSync(path.join(ROOT, "domains", DOMAIN, "events.json"))) await copy(`domains/${DOMAIN}/events.json`, "events.json");
  else console.warn("[build:web] events.json absent — lance `npm run fetch:events` (le site repassera en direct).");

  // 5. Interface multilingue : / (fr), /en/, /zh/, /ar/ (arabe en RTL)
  const template = await readFile(path.join(ROOT, "web", "index.html"), "utf8");
  for (const lang of LANGS) {
    const dir = lang === "fr" ? DOCS : path.join(DOCS, lang);
    if (lang !== "fr") await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), renderHome(lang, template));
  }
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
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      LANGS.map((l) => `  <url><loc>${urlFor(l)}</loc><priority>${l === "fr" ? "1.0" : "0.9"}</priority></url>`).join("\n") +
      `\n</urlset>\n`
  );

  // 7. GitHub Pages
  await writeFile(path.join(DOCS, ".nojekyll"), "");
  if (CUSTOM_DOMAIN) await writeFile(path.join(DOCS, "CNAME"), CUSTOM_DOMAIN + "\n");

  console.log(`[build:web] docs/ généré (${LANGS.join(", ")}).`);
}

build().catch((e) => { console.error("[build:web] échec :", e); process.exit(1); });
