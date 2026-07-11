// loop/metrics.js
// Agrège impressions + clics en indicateurs par offre et par catégorie.

import { storePaths, readJsonl } from "../data/store.js";

/**
 * @param {string} domain
 * @returns {Promise<{byOffer:Map, totals:object, byCategoryRaw:Map, impressions:Array, clicks:Array}>}
 */
export async function aggregateMetrics(domain) {
  const p = storePaths(domain);
  const impressions = await readJsonl(p.impressions);
  const clicks = await readJsonl(p.clicks);

  const byOffer = new Map(); // offerId -> { impressions, clicks }
  const bump = (id, field) => {
    if (!id) return;
    const rec = byOffer.get(id) || { impressions: 0, clicks: 0 };
    rec[field]++;
    byOffer.set(id, rec);
  };
  for (const i of impressions) bump(i.offerId, "impressions");
  for (const c of clicks) bump(c.offerId, "clicks");

  for (const rec of byOffer.values()) {
    // CTR borné à 1 : un même utilisateur peut recliquer, on ne veut pas de "200 %".
    rec.ctr = rec.impressions > 0 ? Math.min(1, rec.clicks / rec.impressions) : 0;
  }

  return {
    byOffer,
    impressions,
    clicks,
    totals: {
      impressions: impressions.length,
      clicks: clicks.length,
      ctr: impressions.length ? clicks.length / impressions.length : 0,
    },
  };
}

/**
 * Construit une carte de "signaux" par offre pour nourrir le score de nouveauté.
 * @returns {Object<string,{impressions:number,clicks:number,ctr:number}>}
 */
export function signalsFromMetrics(metrics) {
  const out = {};
  for (const [id, rec] of metrics.byOffer) out[id] = rec;
  return out;
}
