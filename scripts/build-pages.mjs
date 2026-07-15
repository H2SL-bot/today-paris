#!/usr/bin/env node
// scripts/build-pages.mjs
// Génère les PAGES PILIERS statiques indexables, en 2 langues :
//   fr : /ouvert-maintenant/ /ce-soir/ /<quartier>/
//   en : /en/open-now/ /en/tonight/ /en/<quartier>/
// Vrai contenu (Open Data + OpenStreetMap), JSON-LD, breadcrumb, hreflang, sitemap complet.
// À lancer APRÈS build:web.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import config from "../domains/today.paris/config.js";
import { UI, PILLARS, localizeConfig, LANGS } from "../domains/today.paris/i18n.js";
import { opendataParisAdapter } from "../data/adapters/opendata-paris.js";
import { validateAndExpire } from "../data/freshness.js";
import { distanceKm } from "../engine/geo.js";
import { makeEventTranslator, localizeNeighborhood } from "../domains/today.paris/translate.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const TZ = config.city?.timezone || "Europe/Paris";
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || "today.paris";
const BASE = `https://${CUSTOM_DOMAIN}/`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// N'accepte qu'une URL http(s) absolue (normalise « www.x.fr »). Écarte javascript:/data:/…
function safeUrl(u) {
  if (!u) return null;
  let s = String(u).trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try { const url = new URL(s); return url.protocol === "http:" || url.protocol === "https:" ? url.href : null; } catch { return null; }
}
const localDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const hhmm = (d) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d).replace(":", "h");

const BOOK_EN = { "Réserver": "Book", "En savoir plus": "Learn more", "Site web": "Website" };
const SEC = {
  fr: { barsIn: (n) => `Bars à ${n}`, cafesIn: (n) => `Cafés à ${n}`, parks: "Parcs & jardins", bars: "Bars à Paris", cafes: "Cafés à Paris", eventsTonight: "Événements de ce soir", eventsNear: (n) => `Événements près de ${n}` },
  en: { barsIn: (n) => `Bars in ${n}`, cafesIn: (n) => `Cafés in ${n}`, parks: "Parks & gardens", bars: "Bars in Paris", cafes: "Cafés in Paris", eventsTonight: "Tonight's events", eventsNear: (n) => `Events near ${n}` },
};
const CHROME = {
  fr: { cta: "👉 Voir ce qui est ouvert <strong>maintenant</strong> près de vous", explore: "À explorer :", note: (h) => `Données réelles : événements de l'Open Data de la Ville de Paris, lieux d'OpenStreetMap. Les disponibilités changent en continu — <a href="/">ouvrez l'outil</a> pour voir ce qui est ouvert à l'instant, autour de vous.` },
  en: { cta: "👉 See what's open <strong>now</strong> near you", explore: "Explore:", note: () => `Real data: events from the City of Paris Open Data, places from OpenStreetMap. Availability changes continuously — <a href="/en/">open the tool</a> to see what's open right now, around you.` },
};

function priceLabel(offer, copy) {
  const free = copy.free || "Gratuit", paid = copy.paid || "Payant";
  const tn = (n) => (n && copy.priceNotes && copy.priceNotes[n]) || n;
  if (!offer.price || offer.price.free) return offer.price?.note ? `${free} ${tn(offer.price.note)}` : free;
  if (offer.price.unknown) return tn(offer.price.note) || paid;
  return `${offer.price.amount} €${offer.price.note ? " " + tn(offer.price.note) : ""}`;
}

function tonight(o, now) {
  if (!Array.isArray(o.occurrences)) return null;
  const today = localDate(now);
  let best = null;
  for (const oc of o.occurrences) {
    const s = new Date(oc.start);
    if (isNaN(s) || localDate(s) !== today) continue;
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(s));
    if (h >= 17 || h < 4) if (!best || s < best.date) best = { date: s, label: hhmm(s) };
  }
  return best;
}

function cardHtml(o, lang, cats, copy, extra = "", tr = (n) => ({ name: n })) {
  const emoji = cats[o.category]?.emoji || "📍";
  const cat = cats[o.category]?.label || o.category;
  let link = "";
  const bookUrl = safeUrl(o.bookingUrl);
  if (bookUrl) {
    const raw = o.bookingLabel || (lang === "en" ? "learn more" : "en savoir plus");
    const label = lang === "en" ? BOOK_EN[raw] || raw : raw;
    link = ` — <a href="${esc(bookUrl)}" target="_blank" rel="noopener nofollow">${esc(label)}</a>`;
  }
  return `<li class="pcard"><span class="pemoji">${emoji}</span><span class="pbody"><strong>${esc(tr(o.name).name)}</strong><span class="pmeta">${esc(cat)} · ${esc(localizeNeighborhood(o.neighborhood || "Paris", lang))}${extra ? " · " + esc(extra) : ""} · ${esc(priceLabel(o, copy))}${link}</span></span></li>`;
}

function pageHtml({ lang, slug, altUrl, title, description, h1, intro, sections, relatedLinks, tr = (n) => ({ name: n }) }) {
  const L = UI[lang], C = CHROME[lang];
  const home = lang === "en" ? "/en/" : "/";
  const url = `${BASE}${lang === "en" ? "en/" : ""}${slug}/`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: title, url, description, inLanguage: lang, isPartOf: { "@type": "WebSite", url: BASE, name: "today.paris" } },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "today.paris", item: BASE + (lang === "en" ? "en/" : "") }, { "@type": "ListItem", position: 2, name: h1 }] },
      ...sections.filter((s) => s.offers.length).map((s) => ({ "@type": "ItemList", name: s.h2, numberOfItems: s.offers.length, itemListElement: s.offers.slice(0, 20).map((o, i) => ({ "@type": "ListItem", position: i + 1, name: tr(o.name).name })) })),
    ],
  };
  const body = sections.map((s) => (s.offers.length ? `<h2>${esc(s.h2)}</h2>\n<ul class="plist">\n${s.offers.map((o) => cardHtml(o, lang, s.cats, s.copy, s.extra?.(o), tr)).join("\n")}\n</ul>` : "")).join("\n");
  const alt = altUrl
    ? `  <link rel="alternate" hreflang="${lang === "en" ? "fr" : "en"}" href="${altUrl}" />\n  <link rel="alternate" hreflang="${lang}" href="${url}" />\n  <link rel="alternate" hreflang="x-default" href="${url.replace("/en/", "/")}" />`
    : "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
${alt}
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
    <p class="crumb"><a href="${home}">today.paris</a> › ${esc(h1)}</p>
    <h1 class="logo" style="font-size:clamp(26px,6vw,40px)">${esc(h1)}</h1>
    <p class="tagline">${esc(intro)}</p>
    <p><a class="btn-primary pcta" href="${home}">${C.cta}</a></p>
  </header>
  <main>
    <article class="page">
      ${body}
      <nav class="prelated"><span>${esc(C.explore)}</span> ${relatedLinks}</nav>
      <p class="pnote">${C.note(h1)}</p>
    </article>
  </main>
  <footer class="footer"><p>${esc(L.footer)}</p></footer>
  <script>(function(){var B=${JSON.stringify(config.brainUrl || "")};if(!B)return;try{var v=!sessionStorage.getItem("tp_v");if(v)sessionStorage.setItem("tp_v","1");fetch(B+"/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({events:[{type:"view",path:location.pathname,visit:v}]}),keepalive:true}).catch(function(){});}catch(e){}})();</script>
</body>
</html>
`;
}

async function writePage(segments, html) {
  const dir = path.join(DOCS, ...segments);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), html, "utf8");
}

function pillarSpec(pillar, lang, active, cats, copy, now) {
  const en = lang === "en";
  const name = en ? pillar.nameEn : pillar.nameFr;
  const S = SEC[lang];
  if (pillar.kind === "venues") {
    const bars = active.filter((o) => o.category === "bar").slice(0, 8);
    const cafes = active.filter((o) => o.category === "cafe").slice(0, 8);
    const parks = active.filter((o) => ["park", "garden"].includes(o.category)).slice(0, 6);
    return {
      title: en ? "Open now in Paris — bars, cafés & parks near you | today.paris" : "Ouvert maintenant à Paris — bars, cafés & parcs près de vous | today.paris",
      description: en ? "What's open right now in Paris? Bars, cafés and parks open around you, in real time and on a map. Free." : "Que faire à Paris maintenant ? Bars, cafés et parcs ouverts, autour de vous, en temps réel et sur une carte. Gratuit.",
      h1: en ? "Open now in Paris" : "Ouvert maintenant à Paris",
      intro: en ? "Bars, cafés and parks open in Paris — see at a glance what's open around you right now, on a map." : "Bars, cafés et parcs ouverts à Paris — repérez en un clic ce qui est ouvert autour de vous, à l'heure qu'il est, sur une carte.",
      sections: [{ h2: S.bars, offers: bars }, { h2: S.cafes, offers: cafes }, { h2: S.parks, offers: parks }],
    };
  }
  if (pillar.kind === "events") {
    const evts = active.map((o) => ({ o, t: tonight(o, now) })).filter((x) => x.t).sort((a, b) => a.t.date - b.t.date).slice(0, 18).map((x) => ({ ...x.o, _time: x.t.label }));
    const dateFr = new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
    return {
      title: en ? "What to do in Paris tonight — today's events & outings | today.paris" : "Que faire à Paris ce soir — événements & sorties du jour | today.paris",
      description: en ? "What to do in Paris tonight? Concerts, exhibitions and outings happening today, near you, on a map. Real-time, free." : "Que faire à Paris ce soir ? Concerts, expos, sorties et événements du jour, près de vous, sur une carte. En temps réel, gratuit.",
      h1: en ? "What to do in Paris tonight" : "Que faire à Paris ce soir",
      intro: en ? `Tonight's events in Paris (${dateFr}): concerts, shows, exhibitions and outings, around you.` : `Les événements de ce soir à Paris (${dateFr}) : concerts, spectacles, expos et sorties, autour de vous.`,
      sections: [{ h2: S.eventsTonight, offers: evts, extra: (o) => (o._time ? (en ? "at " : "à ") + o._time : "") }],
    };
  }
  // quartier
  const near = active.map((o) => ({ o, d: distanceKm({ lat: pillar.lat, lng: pillar.lng }, { lat: o.lat, lng: o.lng }) })).filter((x) => x.d <= 1.3).sort((a, b) => a.d - b.d).map((x) => x.o);
  return {
    title: en ? `What to do in ${name} (Paris) — outings, bars & cafés | today.paris` : `Que faire à ${name} (Paris) — sorties, bars & cafés | today.paris`,
    description: en ? `What to do in ${name}, Paris? Today's events, bars and cafés open near you, on a map. Real-time.` : `Que faire à ${name} à Paris ? Événements du jour, bars et cafés ouverts près de vous, sur une carte. En temps réel.`,
    h1: en ? `What to do in ${name}` : `Que faire à ${name}`,
    intro: en ? `Outings, events, bars and cafés in ${name} — what's open and happening around you, right now.` : `Sorties, événements, bars et cafés à ${name} — ce qui est ouvert et se passe autour de vous, maintenant.`,
    sections: [
      { h2: S.eventsNear(name), offers: near.filter((o) => o.source !== "openstreetmap").slice(0, 8) },
      { h2: S.barsIn(name), offers: near.filter((o) => o.category === "bar").slice(0, 6) },
      { h2: S.cafesIn(name), offers: near.filter((o) => o.category === "cafe").slice(0, 6) },
    ],
  };
}

async function main() {
  const now = new Date();
  // Événements : on privilégie l'instantané quotidien (inventaire complet ~850), sinon direct.
  const eventsPath = path.join(ROOT, "domains", "today.paris", "events.json");
  const events = existsSync(eventsPath)
    ? (JSON.parse(await readFile(eventsPath, "utf8")).offers || [])
    : await opendataParisAdapter({ name: "que-faire", limit: 1000, timezone: TZ }, { now }).catch((e) => { console.warn("[pages] événements indisponibles:", e.message); return []; });
  const venuesPath = path.join(ROOT, "domains", "today.paris", "venues.json");
  const venues = existsSync(venuesPath) ? JSON.parse(await readFile(venuesPath, "utf8")).offers : [];
  const { active } = validateAndExpire([...events, ...venues], now, { timeZone: TZ });

  // Dictionnaire de traduction des événements (facultatif) : noms/desc en anglais.
  const trPath = path.join(ROOT, "domains", "today.paris", "translations.events.json");
  const dict = existsSync(trPath) ? JSON.parse(await readFile(trPath, "utf8")) : null;

  // Sitemap : tous les accueils de langue (fr, en, zh, ar) + les piliers fr/en ajoutés plus bas.
  const urls = LANGS.map((l) => BASE + (l === "fr" ? "" : l + "/"));
  let count = 0;
  for (const lang of ["fr", "en"]) {
    const cats = localizeConfig(config, lang).categories;
    const copy = localizeConfig(config, lang).copy;
    const tr = makeEventTranslator(dict, lang);
    const en = lang === "en";
    for (const pillar of PILLARS) {
      const slug = en ? pillar.en : pillar.fr;
      const altSlug = en ? pillar.fr : pillar.en;
      const altUrl = `${BASE}${en ? "" : "en/"}${altSlug}/`;
      const spec = pillarSpec(pillar, lang, active, cats, copy, now);
      spec.sections.forEach((s) => { s.cats = cats; s.copy = copy; });
      const related = PILLARS.map((p) => `<a href="/${en ? "en/" + p.en : p.fr}/">${esc(en ? p.labelEn : p.labelFr)}</a>`).join(" · ");
      const html = pageHtml({ lang, slug, altUrl, ...spec, relatedLinks: related, tr });
      await writePage(en ? ["en", slug] : [slug], html);
      urls.push(`${BASE}${en ? "en/" : ""}${slug}/`);
      count++;
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u}</loc><changefreq>daily</changefreq><priority>${u === BASE ? "1.0" : "0.8"}</priority></url>`).join("\n") + `\n</urlset>\n`;
  await writeFile(path.join(DOCS, "sitemap.xml"), sitemap);

  console.log(`[pages] ${count} pages piliers générées (fr + en). Sitemap : ${urls.length} URLs.`);
}

main().catch((e) => { console.error("[pages] échec :", e); process.exit(1); });
