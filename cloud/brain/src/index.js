// today.paris — "cerveau" : collecte les impressions et les clics des visiteurs,
// les agrège dans un KV, et expose /stats pour que le site apprenne ce qui marche.
// Déployé sur Cloudflare Workers (gratuit, toujours actif). Aucune donnée personnelle :
// on ne stocke que des compteurs par catégorie et par offre.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const KEY = "counters:v1";

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

async function readCounters(env) {
  return (
    (await env.STATS.get(KEY, "json")) || {
      categories: {}, // { catégorie: { i: impressions, c: clics } }
      offerClicks: {}, // { offerId: nb de clics }
      totals: { i: 0, c: 0 },
      updatedAt: null,
    }
  );
}

async function handleEvent(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "json invalide" }, 400);
  }
  const events = (Array.isArray(body.events) ? body.events : [body]).slice(0, 25);
  const c = await readCounters(env);
  let changed = false;

  for (const e of events) {
    const isClick = e && e.type === "click";
    const isImpr = e && e.type === "impression";
    if (!isClick && !isImpr) continue;
    const field = isClick ? "c" : "i";
    c.totals[field] = (c.totals[field] || 0) + 1;

    if (typeof e.category === "string") {
      const cat = e.category.slice(0, 40);
      c.categories[cat] = c.categories[cat] || { i: 0, c: 0 };
      c.categories[cat][field]++;
    }
    if (isClick && typeof e.offerId === "string") {
      const id = e.offerId.slice(0, 128);
      c.offerClicks[id] = (c.offerClicks[id] || 0) + 1;
    }
    changed = true;
  }

  if (changed) {
    c.updatedAt = new Date().toISOString();
    // Borne la taille : on ne garde que les 300 offres les plus cliquées.
    const ids = Object.keys(c.offerClicks);
    if (ids.length > 400) {
      const top = ids.sort((a, b) => c.offerClicks[b] - c.offerClicks[a]).slice(0, 300);
      const pruned = {};
      for (const id of top) pruned[id] = c.offerClicks[id];
      c.offerClicks = pruned;
    }
    await env.STATS.put(KEY, JSON.stringify(c));
  }
  return json({ ok: true });
}

async function handleStats(env) {
  const c = await readCounters(env);
  return json(c, 200, { "Cache-Control": "public, max-age=60" });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/event" && request.method === "POST") return handleEvent(request, env);
    if (url.pathname === "/stats" && request.method === "GET") return handleStats(env);
    if (url.pathname === "/") return json({ ok: true, service: "today.paris brain" });
    return new Response("Not found", { status: 404, headers: CORS });
  },
};
