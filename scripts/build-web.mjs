#!/usr/bin/env node
// scripts/build-web.mjs
// Assemble le site STATIQUE dans docs/ (servi par GitHub Pages) à partir des modules réels.
// Rend l'accueil en 2 langues : / (fr) et /en/ (en). Aucun bundler : modules ES natifs.

import { cp, mkdir, rm, writeFile, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normKey } from "../domains/today.paris/translate.js";
import { UI, PILLARS, LANGS, LANG_LABELS, langHref, pillarSlug, pillarLabel, GYG } from "../domains/today.paris/i18n.js";

// Langues qui ont réellement des pages piliers (mêmes règles que build-pages.mjs) :
// fr/en écrites à la main + celles dont les textes SEO sont traduits. Une langue sans
// textes SEO n'affiche pas la nav « Explorer » → jamais de lien mort.
let BUNDLE_SEO = {};
try { ({ PILLAR_SEO: BUNDLE_SEO } = await import("../domains/today.paris/pillar-seo.data.js")); } catch { /* pas encore traduit */ }
const PILLAR_LANGS = LANGS.filter((l) => l === "fr" || l === "en" || BUNDLE_SEO[l]);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const DOMAIN = process.env.DOMAIN || "today.paris";
// Même défaut que build-pages.mjs : sans cet alignement, une construction sans la variable
// d'environnement produisait des hreflang vers github.io alors que les pages pointaient vers
// today.paris — des liens croisés morts pour Google.
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || "today.paris";
const BASE = `https://${CUSTOM_DOMAIN}/`;
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
  const gygLocale = GYG.locales[lang] || "en-US";
  const gygSection = `<aside class="affiliate">
      <p>${esc(g.p)}</p>
      <div class="gyg-widget" data-gyg-href="https://widget.getyourguide.com/default/activities.frame" data-gyg-locale-code="${gygLocale}" data-gyg-widget="activities" data-gyg-number-of-items="${GYG.numberOfItems}" data-gyg-partner-id="${GYG.partnerId}" data-gyg-q="Paris"><span>Powered by <a target="_blank" rel="sponsored noopener nofollow" href="https://www.getyourguide.com/paris-l16/?partner_id=${GYG.partnerId}">GetYourGuide</a></span></div>
      <p class="affiliate-note">${esc(g.note)}</p>
    </aside>`;
  // Nav « Explorer » (liens piliers) seulement pour les langues qui ONT des pages piliers.
  const pillarLinks = PILLARS.map((p) => `<a href="${langHref(lang)}${pillarSlug(p, lang)}/">${esc(pillarLabel(p, lang))}</a>`).join(" ·\n        ");
  const exploreNav = PILLAR_LANGS.includes(lang)
    ? `<nav class="prelated" aria-label="${esc(L.explore)}"><span>${esc(L.explore)}</span>\n        ${pillarLinks}</nav>`
    : "";

  const vars = {
    htmlLang: L.htmlLang, dir: L.dir, title: esc(L.title), metaDesc: esc(L.metaDesc), ogTitle: esc(L.ogTitle), ogDesc: esc(L.ogDesc),
    ogLocale: L.ogLocale, canonical, hreflang, jsonld, langSwitch, tagline: esc(L.tagline),
    where: esc(L.where), geoloc: esc(L.geoloc), geolocTitle: esc(L.geolocTitle), who: esc(L.who),
    budget: esc(L.budget), mood: esc(L.mood), time: esc(L.time), openNow: esc(L.openNow), submit: esc(L.submit), surprise: esc(L.surprise), mapLabel: esc(L.mapLabel),
    aboutH2: esc(L.aboutH2), aboutP: L.aboutP, faqHtml, exploreNav, footer: esc(L.footer), gygSection,
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
  // Ce dont le visiteur a réellement besoin : les noms des événements à l'affiche
  // aujourd'hui et ceux des lieux servis. Tout le reste de l'historique reste au dépôt.
  const besoins = new Set();
  for (const f of ["events.json", "venues.json"]) {
    const p = path.join(ROOT, "domains", DOMAIN, f);
    if (!existsSync(p)) continue;
    for (const o of JSON.parse(await readFile(p, "utf8")).offers || []) {
      if (o.name) besoins.add(o.name);
      if (o.descriptionShort) besoins.add(o.descriptionShort);
    }
  }
  const allege = [];

  // Dictionnaires de traduction des événements, par langue (facultatifs — repli français sinon).
  for (const lang of LANGS.filter((l) => l !== "fr")) {
    const src = path.join(ROOT, "domains", DOMAIN, `translations.${lang}.json`);
    if (!existsSync(src)) continue;
    // On NE publie QUE les traductions des événements réellement à l'affiche.
    // Le dictionnaire complet reste dans le dépôt (capital réutilisable : un
    // événement qui revient retrouve sa traduction sans la repayer), mais le
    // visiteur ne télécharge jamais l'historique des événements terminés.
    const dict = JSON.parse(await readFile(src, "utf8"));
    // Appariement par clé NORMALISÉE — exactement comme le fait le site à l'exécution
    // (translate.js). En comparaison stricte, une apostrophe courbe suffirait à rater
    // une traduction qui existe, et l'événement s'afficherait en français pour rien.
    const parNorm = new Map(Object.keys(dict).map((k) => [normKey(k), k]));
    const utile = {};
    for (const nom of besoins) {
      const k = parNorm.get(normKey(nom));
      if (k) utile[k] = dict[k];
    }
    await writeFile(path.join(DOCS, `translations.${lang}.json`), JSON.stringify(utile));
    allege.push(`${lang} ${Object.keys(utile).length}/${Object.keys(dict).length}`);
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
  if (allege.length) console.log(`[build:web] dictionnaires publiés (utiles/total) : ${allege.join(" · ")}`);
}

build().catch((e) => { console.error("[build:web] échec :", e); process.exit(1); });
