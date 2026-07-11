#!/usr/bin/env node
// server.js
// Serveur HTTP sans dépendance : sert l'interface (/public) + l'API du moteur.
//   node server.js         -> http://localhost:3000
//   PORT=8080 node server.js
//   DOMAIN=today.paris node server.js

import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadDomain } from "./lib/domain.js";
import { ingestFromSources } from "./data/source.js";
import { validateAndExpire } from "./data/freshness.js";
import { saveActiveOffers, loadActiveOffers, logImpressions, logClick } from "./data/store.js";
import { aggregateMetrics, signalsFromMetrics } from "./loop/metrics.js";
import { recommend } from "./engine/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "public");
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

let STATE = { config: null, domain: null, domainDir: null, seedOffers: [] };

async function init() {
  const { config, domain, domainDir } = await loadDomain();
  STATE = { config, domain, domainDir, seedOffers: [] };

  // Amorçage : si la boucle n'a jamais tourné, on ingère et on écrit un snapshot.
  const existing = await loadActiveOffers(domain);
  if (existing.length === 0) {
    const raw = await ingestFromSources(config, { domainDir });
    const now = new Date();
    for (const o of raw) if (!o.lastSeen) o.lastSeen = now.toISOString();
    const fresh = validateAndExpire(raw, now, { staleAfterHours: config.freshness?.staleAfterHours });
    await saveActiveOffers(domain, fresh.active);
    STATE.seedOffers = fresh.active;
    console.log(`[server] amorçage : ${fresh.active.length} offres actives (démo).`);
  } else {
    STATE.seedOffers = existing;
    console.log(`[server] snapshot chargé : ${existing.length} offres actives.`);
  }
  STATE.hasDemoData = STATE.seedOffers.some((o) => o.demo === true);
}

// --------------------------------------------------------------------------
// Utilitaires HTTP
// --------------------------------------------------------------------------
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error("corps trop volumineux"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}

async function serveStatic(req, res, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Bad request");
  }
  if (rel === "/" || rel === "") rel = "/index.html";
  // Anti-traversée : le chemin résolu doit être PUBLIC_DIR lui-même ou un descendant
  // (on exige le séparateur de dossier, sinon un dossier frère "public.bak" passerait).
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  const ext = path.extname(filePath).toLowerCase();
  const body = await readFile(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(body);
}

// --------------------------------------------------------------------------
// Validation d'entrée
// --------------------------------------------------------------------------
// Bornes géographiques : viennent de la config du domaine (aucune valeur "Paris" en dur ici).
function inBounds(lat, lng, bounds) {
  if (!bounds) return true;
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}
// Nombre positif ou fini, sinon null (rejette NaN, Infinity, négatifs, chaînes non numériques).
function finitePositiveOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function sanitizeContext(input, config) {
  const c = input && typeof input === "object" ? input : {};
  let location = config.city.center;
  if (c.location && Number.isFinite(c.location.lat) && Number.isFinite(c.location.lng)) {
    location = inBounds(c.location.lat, c.location.lng, config.city?.bounds)
      ? { lat: c.location.lat, lng: c.location.lng }
      : config.city.center;
  }
  const groups = Object.keys(config.groups);
  const moods = Object.keys(config.moods);
  return {
    location,
    now: new Date(),
    budget: finitePositiveOrNull(c.budget),
    group: groups.includes(c.group) ? c.group : groups[0],
    moodId: moods.includes(c.moodId) ? c.moodId : moods[0],
    timeAvailableMin: finitePositiveOrNull(c.timeAvailableMin),
    requireOpenNow: c.requireOpenNow !== false,
  };
}

// --------------------------------------------------------------------------
// Routes API
// --------------------------------------------------------------------------
function apiConfig() {
  const cfg = STATE.config;
  return {
    domain: cfg.domain,
    title: cfg.title,
    tagline: cfg.tagline,
    city: { label: cfg.city.label, center: cfg.city.center, bounds: cfg.city.bounds },
    hasDemoData: STATE.hasDemoData === true,
    moods: Object.entries(cfg.moods).map(([id, m]) => ({ id, label: m.label, emoji: m.emoji })),
    groups: Object.entries(cfg.groups).map(([id, g]) => ({ id, label: g.label, emoji: g.emoji })),
    budgets: cfg.budgets,
    times: cfg.times,
    neighborhoods: cfg.neighborhoods,
    categories: cfg.categories,
  };
}

async function apiRecommend(body) {
  const ctx = sanitizeContext(body?.context, STATE.config);

  // Offres actives : on relit le snapshot (mis à jour par la boucle), sinon le seed mémoire.
  let offers = await loadActiveOffers(STATE.domain);
  if (offers.length === 0) offers = STATE.seedOffers;

  // Fraîcheur REVÉRIFIÉE à chaque requête : garantit la règle d'or même si la boucle
  // n'a pas tourné depuis longtemps (le snapshot peut avoir vieilli). On ne sert jamais d'expirée.
  const fresh = validateAndExpire(offers, ctx.now, {
    staleAfterHours: STATE.config.freshness?.staleAfterHours,
    timeZone: STATE.config.city?.timezone,
  });
  offers = fresh.active;

  // Signaux d'usage -> score de nouveauté/exploration
  const metrics = await aggregateMetrics(STATE.domain);
  const sig = signalsFromMetrics(metrics);
  const candidates = offers.map((o) => (sig[o.id] ? { ...o, _signals: sig[o.id] } : o));

  const out = recommend({ context: ctx, candidates, config: STATE.config });

  // Journalise les impressions (offres réellement montrées)
  await logImpressions(STATE.domain, out.results.map((r) => r.id), ctx);

  return { ...out, context: { ...ctx, now: ctx.now.toISOString() } };
}

async function apiClick(body) {
  if (!body || !body.offerId) throw new Error("offerId manquant");
  await logClick(STATE.domain, {
    offerId: String(body.offerId),
    action: body.action || "interest",
    moodId: body.moodId,
    group: body.group,
    position: body.position,
  });
  return { ok: true };
}

// --------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || "/";
    if (url.startsWith("/api/")) {
      if (url === "/api/health") return sendJson(res, 200, { ok: true, domain: STATE.domain });
      if (url === "/api/config" && req.method === "GET") return sendJson(res, 200, apiConfig());
      if (url === "/api/recommend" && req.method === "POST") {
        const body = await readBody(req);
        return sendJson(res, 200, await apiRecommend(body));
      }
      if (url === "/api/click" && req.method === "POST") {
        const body = await readBody(req, 4096); // un clic est minuscule
        return sendJson(res, 200, await apiClick(body));
      }
      return sendJson(res, 404, { error: "route inconnue" });
    }
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error("[server] erreur:", err.message);
    return sendJson(res, 400, { error: err.message });
  }
});

init()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`\n  today.paris — serveur prêt`);
      console.log(`  → http://localhost:${PORT}\n`);
    });
  })
  .catch((err) => {
    console.error("[server] échec d'initialisation:", err);
    process.exit(1);
  });
