#!/usr/bin/env node
// scripts/build-pages.mjs
// Génère des PAGES PILIERS statiques et indexables (contenu réel lisible par Google) dans docs/ :
//   /ouvert-maintenant/ , /ce-soir/ , et quelques pages quartier.
// Le SEO a besoin de vrai texte : ces pages listent de VRAIS lieux/événements (Open Data +
// OpenStreetMap), avec un lien vers l'outil temps réel. À lancer APRÈS build:web.
//
//   node scripts/build-pages.mjs

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import config from "../domains/today.paris/config.js";
import { opendataParisAdapter } from "../data/adapters/opendata-paris.js";
import { validateAndExpire } from "../data/freshness.js";
import { distanceKm } from "../engine/geo.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const TZ = config.city?.timezone || "Europe/Paris";
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || "today.paris";
const BASE = `https://${CUSTOM_DOMAIN}/`;
const CATS = config.categories || {};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const localDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const hhmm = (d) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");

function priceLabel(o) {
  if (!o.price || o.price.free) return o.price?.note ? `Gratuit ${o.price.note}` : "Gratuit";
  if (o.price.unknown) return o.price.note || "Payant";
  return `${o.price.amount} €${o.price.note ? " " + o.price.note : ""}`;
}

// Occurrence "ce soir" (aujourd'hui, à partir de 17h) -> heure de début, sinon null.
function tonight(o, now) {
  if (!Array.isArray(o.occurrences)) return null;
  const today = localDate(now);
  let best = null;
  for (const oc of o.occurrences) {
    const s = new Date(oc.start);
    if (isNaN(s)) continue;
    if (localDate(s) !== today) continue;
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(s));
    if (h >= 17 || h < 4) {
      if (!best || s < best.date) best = { date: s, label: hhmm(s) };
    }
  }
  return best;
}

// --- Carte statique (contenu indexable) --------------------------------
function cardHtml(o, extra = "") {
  const emoji = CATS[o.category]?.emoji || "📍";
  const cat = CATS[o.category]?.label || o.category;
  const link = o.bookingUrl
    ? ` — <a href="${esc(o.bookingUrl)}" target="_blank" rel="noopener nofollow">${esc(o.bookingLabel || "en savoir plus")}</a>`
    : "";
  return `<li class="pcard">
      <span class="pemoji">${emoji}</span>
      <span class="pbody"><strong>${esc(o.name)}</strong>
      <span class="pmeta">${esc(cat)} · ${esc(o.neighborhood || "Paris")}${extra ? " · " + extra : ""} · ${esc(priceLabel(o))}${link}</span></span>
    </li>`;
}

// --- Données structurées (JSON-LD) -------------------------------------
function itemListLd(offers, name) {
  return {
    "@type": "ItemList",
    name,
    numberOfItems: offers.length,
    itemListElement: offers.slice(0, 20).map((o, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: o.name,
    })),
  };
}
function breadcrumbLd(label) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "today.paris", item: BASE },
      { "@type": "ListItem", position: 2, name: label },
    ],
  };
}

// --- Gabarit de page ----------------------------------------------------
function pageHtml({ slug, title, description, h1, intro, sections, related }) {
  const url = `${BASE}${slug}/`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: title, url, description, inLanguage: "fr", isPartOf: { "@type": "WebSite", url: BASE, name: "today.paris" } },
      breadcrumbLd(h1),
      ...sections.filter((s) => s.offers.length).map((s) => itemListLd(s.offers, s.h2)),
    ],
  };
  const body = sections
    .map((s) => (s.offers.length ? `<h2>${esc(s.h2)}</h2>\n<ul class="plist">\n${s.offers.map((o) => cardHtml(o, s.extra?.(o))).join("\n")}\n</ul>` : ""))
    .join("\n");
  const rel = related.length
    ? `<nav class="prelated"><span>À explorer :</span> ${related.map((r) => `<a href="${BASE}${r.slug}/">${esc(r.label)}</a>`).join(" · ")}</nav>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🗼</text></svg>" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${BASE}og.png" />
  <link rel="stylesheet" href="/styles.css" />
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
  <header class="hero">
    <p class="crumb"><a href="/">today.paris</a> › ${esc(h1)}</p>
    <h1 class="logo" style="font-size:clamp(26px,6vw,40px)">${esc(h1)}</h1>
    <p class="tagline">${esc(intro)}</p>
    <p><a class="btn-primary pcta" href="/">👉 Voir ce qui est ouvert <strong>maintenant</strong> près de vous</a></p>
  </header>
  <main>
    <article class="page">
      ${body}
      ${rel}
      <p class="pnote">Données réelles : événements de l'Open Data de la Ville de Paris, lieux d'OpenStreetMap.
      Les disponibilités changent en continu — <a href="/">ouvrez l'outil</a> pour voir ce qui est ouvert à l'instant, autour de vous.</p>
    </article>
  </main>
  <footer class="footer"><p>today.paris — Quoi faire à Paris, maintenant. Événements : Open Data Ville de Paris · Lieux : © OpenStreetMap.</p></footer>
  <script>(function(){var B=${JSON.stringify(config.brainUrl || "")};if(!B)return;try{var v=!sessionStorage.getItem("tp_v");if(v)sessionStorage.setItem("tp_v","1");fetch(B+"/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({events:[{type:"view",path:location.pathname,visit:v}]}),keepalive:true}).catch(function(){});}catch(e){}})();</script>
</body>
</html>
`;
}

async function writePage(slug, html) {
  const dir = path.join(DOCS, slug);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), html, "utf8");
}

// --- Construction -------------------------------------------------------
const QUARTIERS = [
  { slug: "marais", label: "le Marais", lat: 48.8590, lng: 2.3620 },
  { slug: "montmartre", label: "Montmartre", lat: 48.8867, lng: 2.3431 },
  { slug: "quartier-latin", label: "le Quartier latin", lat: 48.8490, lng: 2.3470 },
  { slug: "canal-saint-martin", label: "le Canal Saint-Martin", lat: 48.8710, lng: 2.3660 },
];

async function main() {
  const now = new Date();
  const events = await opendataParisAdapter({ name: "que-faire", limit: 300, timezone: TZ }, { now }).catch((e) => {
    console.warn("[pages] événements indisponibles:", e.message);
    return [];
  });
  const venuesPath = path.join(ROOT, "domains", "today.paris", "venues.json");
  const venues = existsSync(venuesPath) ? JSON.parse(await readFile(venuesPath, "utf8")).offers : [];
  const { active } = validateAndExpire([...events, ...venues], now, { timeZone: TZ });

  const isVenue = (o) => o.source === "openstreetmap";
  const cafes = active.filter((o) => ["cafe", "bar"].includes(o.category));
  const parks = active.filter((o) => ["park", "garden"].includes(o.category));

  const pages = []; // { slug, label }

  // 1) /ouvert-maintenant/
  {
    const bars = cafes.filter((o) => o.category === "bar").slice(0, 8);
    const kfe = cafes.filter((o) => o.category === "cafe").slice(0, 8);
    const html = pageHtml({
      slug: "ouvert-maintenant",
      title: "Ouvert maintenant à Paris — bars, cafés & parcs près de vous | today.paris",
      description: "Que faire à Paris maintenant ? Bars, cafés et parcs ouverts, autour de vous, en temps réel et sur une carte. Gratuit.",
      h1: "Ouvert maintenant à Paris",
      intro: "Bars, cafés et parcs ouverts à Paris — repérez en un clic ce qui est ouvert autour de vous, à l'heure qu'il est, sur une carte.",
      sections: [
        { h2: "Bars à Paris", offers: bars },
        { h2: "Cafés à Paris", offers: kfe },
        { h2: "Parcs & jardins", offers: parks.slice(0, 6) },
      ],
      related: [{ slug: "ce-soir", label: "Ce soir" }, ...QUARTIERS],
    });
    await writePage("ouvert-maintenant", html);
    pages.push({ slug: "ouvert-maintenant" });
  }

  // 2) /ce-soir/  (vrais événements de ce soir)
  {
    const evts = active
      .map((o) => ({ o, t: tonight(o, now) }))
      .filter((x) => x.t)
      .sort((a, b) => a.t.date - b.t.date)
      .slice(0, 18)
      .map((x) => ({ ...x.o, _time: x.t.label }));
    const dateFr = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
    const html = pageHtml({
      slug: "ce-soir",
      title: "Que faire à Paris ce soir — événements & sorties du jour | today.paris",
      description: "Que faire à Paris ce soir ? Concerts, expos, sorties et événements du jour, près de vous, sur une carte. En temps réel, gratuit.",
      h1: "Que faire à Paris ce soir",
      intro: `Les événements de ce soir à Paris (${dateFr}) : concerts, spectacles, expos et sorties, autour de vous.`,
      sections: [{ h2: "Événements de ce soir", offers: evts, extra: (o) => (o._time ? "à " + o._time : "") }],
      related: [{ slug: "ouvert-maintenant", label: "Ouvert maintenant" }, ...QUARTIERS],
    });
    await writePage("ce-soir", html);
    pages.push({ slug: "ce-soir" });
  }

  // 3) Pages quartier
  for (const q of QUARTIERS) {
    const near = active
      .map((o) => ({ o, d: distanceKm({ lat: q.lat, lng: q.lng }, { lat: o.lat, lng: o.lng }) }))
      .filter((x) => x.d <= 1.3)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.o);
    const evN = near.filter((o) => !isVenue(o)).slice(0, 8);
    const barN = near.filter((o) => o.category === "bar").slice(0, 6);
    const cafeN = near.filter((o) => o.category === "cafe").slice(0, 6);
    const html = pageHtml({
      slug: q.slug,
      title: `Que faire à ${q.label} (Paris) — sorties, bars & cafés | today.paris`,
      description: `Que faire à ${q.label} à Paris ? Événements du jour, bars et cafés ouverts près de vous, sur une carte. En temps réel.`,
      h1: `Que faire à ${q.label}`,
      intro: `Sorties, événements, bars et cafés à ${q.label} — ce qui est ouvert et se passe autour de vous, maintenant.`,
      sections: [
        { h2: `Événements près de ${q.label}`, offers: evN },
        { h2: `Bars à ${q.label}`, offers: barN },
        { h2: `Cafés à ${q.label}`, offers: cafeN },
      ],
      related: [
        { slug: "ouvert-maintenant", label: "Ouvert maintenant" },
        { slug: "ce-soir", label: "Ce soir" },
        ...QUARTIERS.filter((x) => x.slug !== q.slug),
      ],
    });
    await writePage(q.slug, html);
    pages.push({ slug: q.slug });
  }

  // 4) Sitemap complet (accueil + piliers)
  const urls = ["", ...pages.map((p) => p.slug + "/")];
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${BASE}${u}</loc><changefreq>daily</changefreq><priority>${u === "" ? "1.0" : "0.8"}</priority></url>`).join("\n") +
    `\n</urlset>\n`;
  await writeFile(path.join(DOCS, "sitemap.xml"), sitemap);

  console.log(`[pages] ${pages.length} pages piliers générées : ${pages.map((p) => "/" + p.slug).join(", ")}`);
  console.log(`[pages] sitemap mis à jour (${urls.length} URLs).`);
}

main().catch((e) => {
  console.error("[pages] échec :", e);
  process.exit(1);
});
