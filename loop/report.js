// loop/report.js
// Produit le rapport d'amélioration : quelles recommandations marchent, lesquelles non,
// et quoi faire ensuite. Sortie en Markdown (lisible) + JSON (réutilisable).

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { storePaths, ensureDir } from "../data/store.js";

const pct = (x) => `${(x * 100).toFixed(1)} %`;

/**
 * @param {object} args { domain, config, now, freshness, metrics, activeOffers }
 * @returns {{json:object, markdown:string}}
 */
export function buildReport({ domain, config, now, freshness, metrics, activeOffers }) {
  // Index id -> offre (offres connues, actives ou désactivées ce tour-ci)
  const index = new Map();
  for (const o of [...activeOffers, ...freshness.expired, ...freshness.stale]) index.set(o.id, o);

  // Performance par catégorie
  const byCat = new Map();
  for (const [id, rec] of metrics.byOffer) {
    const cat = index.get(id)?.category || "inconnue";
    const c = byCat.get(cat) || { impressions: 0, clicks: 0 };
    c.impressions += rec.impressions;
    c.clicks += rec.clicks;
    byCat.set(cat, c);
  }
  const categoryPerf = [...byCat.entries()]
    .map(([category, c]) => ({ category, ...c, ctr: c.impressions ? c.clicks / c.impressions : 0 }))
    .sort((a, b) => b.ctr - a.ctr);

  const ctrs = categoryPerf.filter((c) => c.impressions > 0).map((c) => c.ctr);
  const avgCtr = ctrs.length ? ctrs.reduce((s, x) => s + x, 0) / ctrs.length : 0;

  // Meilleures offres (au moins 3 affichages pour éviter le bruit)
  const MIN_IMPR = 3;
  const topOffers = [...metrics.byOffer.entries()]
    .filter(([, r]) => r.impressions >= MIN_IMPR)
    .map(([id, r]) => ({ id, name: index.get(id)?.name || id, ...r }))
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 5);

  // Offres jamais cliquées malgré une exposition suffisante
  const neverClicked = [...metrics.byOffer.entries()]
    .filter(([, r]) => r.impressions >= 5 && r.clicks === 0)
    .map(([id, r]) => ({ id, name: index.get(id)?.name || id, impressions: r.impressions }));

  // Couverture : catégories du domaine sans aucune offre active
  const activeCats = new Set(activeOffers.map((o) => o.category));
  const missingCats = Object.keys(config.categories || {}).filter((c) => !activeCats.has(c));

  // --- Recommandations d'amélioration (règles simples et honnêtes) ---
  const suggestions = [];
  if (metrics.totals.impressions < 20) {
    suggestions.push(
      `Données d'usage encore faibles (${metrics.totals.impressions} affichages). Conclusions à prendre avec prudence : continuez à utiliser l'app pour alimenter la boucle.`
    );
  }
  for (const c of categoryPerf) {
    if (c.impressions >= 10 && c.ctr >= avgCtr * 1.3) {
      suggestions.push(`La catégorie « ${c.category} » sur-performe (${pct(c.ctr)} de clics). Piste : enrichir l'offre dans cette catégorie.`);
    }
    if (c.impressions >= 10 && c.ctr <= avgCtr * 0.5) {
      suggestions.push(`La catégorie « ${c.category} » sous-performe (${pct(c.ctr)}). Piste : revoir les textes, les prix affichés, ou la pertinence.`);
    }
  }
  for (const o of neverClicked) {
    suggestions.push(`« ${o.name} » : ${o.impressions} affichages, 0 clic. Piste : améliorer la fiche ou la retirer.`);
  }
  if (missingCats.length) {
    suggestions.push(`Aucune offre active dans : ${missingCats.join(", ")}. Piste : compléter les sources de données.`);
  }
  if (freshness.expired.length) {
    suggestions.push(`${freshness.expired.length} offre(s) expirée(s)/à venir écartée(s) automatiquement. La fraîcheur des données est bien appliquée.`);
  }
  if (suggestions.length === 0) suggestions.push("Rien à signaler ce tour-ci. La boucle tourne correctement.");

  const json = {
    domain,
    generatedAt: now.toISOString(),
    dataHealth: {
      active: activeOffers.length,
      expiredOrUpcoming: freshness.expired.length,
      stale: freshness.stale.length,
      invalid: freshness.invalid.length,
      demoActive: activeOffers.filter((o) => o.demo).length,
    },
    usage: metrics.totals,
    avgCategoryCtr: avgCtr,
    topOffers,
    neverClicked,
    categoryPerf,
    missingCategories: missingCats,
    suggestions,
  };

  return { json, markdown: renderMarkdown(json) };
}

function renderMarkdown(j) {
  const L = [];
  L.push(`# Rapport d'amélioration — ${j.domain}`);
  L.push(`_Généré le ${new Date(j.generatedAt).toLocaleString("fr-FR")}_`);
  L.push("");
  L.push("## 1. Santé des données");
  L.push(`- Offres actives : **${j.dataHealth.active}** (dont démo : ${j.dataHealth.demoActive})`);
  L.push(`- Expirées / à venir écartées : ${j.dataHealth.expiredOrUpcoming}`);
  L.push(`- Obsolètes désactivées : ${j.dataHealth.stale}`);
  L.push(`- Invalides ignorées : ${j.dataHealth.invalid}`);
  L.push("");
  L.push("## 2. Usage");
  L.push(`- Affichages : ${j.usage.impressions} · Clics : ${j.usage.clicks} · Taux de clic global : ${pct(j.usage.ctr)}`);
  L.push("");
  L.push("## 3. Ce qui marche (top offres)");
  if (j.topOffers.length === 0) L.push("_Pas encore assez de clics pour un classement fiable._");
  else for (const o of j.topOffers) L.push(`- **${o.name}** — ${pct(o.ctr)} (${o.clicks}/${o.impressions})`);
  L.push("");
  L.push("## 4. Performance par catégorie");
  if (j.categoryPerf.length === 0) L.push("_Aucune donnée d'usage pour l'instant._");
  else for (const c of j.categoryPerf) L.push(`- ${c.category} : ${pct(c.ctr)} (${c.clicks}/${c.impressions})`);
  L.push("");
  L.push("## 5. Recommandations");
  for (const s of j.suggestions) L.push(`- ${s}`);
  L.push("");
  return L.join("\n");
}

/** Écrit le rapport (markdown horodaté + latest.json) et renvoie les chemins. */
export async function writeReport(domain, report, now) {
  const p = storePaths(domain);
  await ensureDir(p.reportsDir);
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const mdPath = path.join(p.reportsDir, `report-${stamp}.md`);
  await writeFile(mdPath, report.markdown, "utf8");
  await writeFile(p.latestReport, JSON.stringify(report.json, null, 2), "utf8");
  return { mdPath, jsonPath: p.latestReport };
}
