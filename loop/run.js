#!/usr/bin/env node
// loop/run.js
// Boucle automatisée : récupère -> vérifie la fraîcheur -> désactive les périmées ->
// classe (contrôle) -> mesure les clics -> repère ce qui marche -> écrit un rapport -> recommence.
//
//   node loop/run.js --once            (un seul passage)
//   node loop/run.js --interval 15     (toutes les 15 minutes)

import { loadDomain } from "../lib/domain.js";
import { ingestFromSources } from "../data/source.js";
import { validateAndExpire } from "../data/freshness.js";
import { saveActiveOffers } from "../data/store.js";
import { aggregateMetrics, signalsFromMetrics } from "./metrics.js";
import { buildReport, writeReport } from "./report.js";
import { recommend } from "../engine/index.js";

function parseArgs(argv) {
  const args = { once: true, intervalMin: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--interval") {
      args.intervalMin = Number(argv[i + 1]);
      args.once = false;
      i++;
    } else if (argv[i] === "--once") {
      args.once = true;
    }
  }
  return args;
}

/** Un passage complet de la boucle. Renvoie un résumé. */
export async function runOnce() {
  const now = new Date();
  const { config, domainDir, domain } = await loadDomain();

  // 1. Récupération depuis les sources déclarées par le domaine
  const raw = await ingestFromSources(config, { domainDir });

  // Marque "vu maintenant" les offres sans lastSeen (on vient de les relire à la source).
  for (const o of raw) if (!o.lastSeen) o.lastSeen = now.toISOString();

  // 2+3. Fraîcheur : on écarte expirées / à venir / obsolètes / invalides
  const freshness = validateAndExpire(raw, now, {
    staleAfterHours: config.freshness?.staleAfterHours,
    timeZone: config.city?.timezone,
  });
  await saveActiveOffers(domain, freshness.active);

  // 5. Mesure des clics (agrégation impressions/clics)
  const metrics = await aggregateMetrics(domain);

  // 4. Classement de contrôle : on vérifie que le moteur sort bien des résultats.
  // Valeurs prises DANS la config du domaine (pas de littéraux propres à today.paris).
  const sanity = recommend({
    context: {
      location: config.city.center,
      now,
      budget: null,
      group: Object.keys(config.groups)[0],
      moodId: Object.keys(config.moods)[0],
      timeAvailableMin: 120,
      requireOpenNow: true,
    },
    candidates: attachSignals(freshness.active, metrics),
    config,
  });

  // 6+7. Rapport : ce qui marche + pistes d'amélioration
  const report = buildReport({ domain, config, now, freshness, metrics, activeOffers: freshness.active });
  const paths = await writeReport(domain, report, now);

  const summary = {
    domain,
    at: now.toISOString(),
    active: freshness.active.length,
    expired: freshness.expired.length,
    stale: freshness.stale.length,
    invalid: freshness.invalid.length,
    sanityResults: sanity.results.length,
    impressions: metrics.totals.impressions,
    clicks: metrics.totals.clicks,
    report: paths.mdPath,
  };

  console.log(
    `[loop] ${domain} — actives:${summary.active} expirées:${summary.expired} obsolètes:${summary.stale} ` +
      `invalides:${summary.invalid} | contrôle:${summary.sanityResults} résultats | ` +
      `clics:${summary.clicks}/${summary.impressions} → ${paths.mdPath}`
  );
  return summary;
}

function attachSignals(offers, metrics) {
  const sig = signalsFromMetrics(metrics);
  return offers.map((o) => (sig[o.id] ? { ...o, _signals: sig[o.id] } : o));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await runOnce();
  if (!args.once && args.intervalMin > 0) {
    console.log(`[loop] mode continu : nouveau passage toutes les ${args.intervalMin} min. (Ctrl+C pour arrêter)`);
    setInterval(() => {
      runOnce().catch((e) => console.error("[loop] erreur:", e.message));
    }, args.intervalMin * 60000);
  }
}

// Exécuté directement (et non importé) ?
const invokedDirectly = process.argv[1] && process.argv[1].endsWith("run.js");
if (invokedDirectly) {
  main().catch((e) => {
    console.error("[loop] échec:", e);
    process.exit(1);
  });
}
