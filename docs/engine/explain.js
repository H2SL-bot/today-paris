// engine/explain.js
// Génère les raisons "pourquoi cette activité vous correspond".
// Les gabarits de texte viennent du domaine (config.copy), pour rester réutilisable.

import { formatDistance } from "./geo.js";
import { priceAmount } from "./filters.js";

/**
 * @param {object} offer
 * @param {object} scored  résultat de scoreOffer (dims, weighted, km)
 * @param {object} context
 * @param {object} config
 * @returns {string[]} 2 à 3 raisons courtes, en français
 */
export function explain(offer, scored, context, config, avail) {
  const copy = config.copy || {};
  const sep = copy.decimalSep || ","; // séparateur décimal des distances (langue)
  const reasons = [];

  // Classe les dimensions par contribution pondérée décroissante
  const ranked = Object.entries(scored.weighted)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const builders = {
    distance: () => {
      if (scored.km == null) return null;
      return tpl(copy.distance, { distance: formatDistance(scored.km, sep) }) ||
        `À ${formatDistance(scored.km, sep)} de vous`;
    },
    budget: () => {
      const price = priceAmount(offer);
      if (price === 0) return copy.free || "Gratuit";
      if (context.budget == null) return null;
      return tpl(copy.budget, { price: `${price} €`, budget: `${context.budget} €` }) ||
        `Dans votre budget (${price} €)`;
    },
    mood: () => {
      const label = config.moods?.[context.moodId]?.label;
      if (!label || scored.dims.mood < 0.45) return null;
      return tpl(copy.mood, { mood: label.toLowerCase() }) ||
        `Parfait pour « ${label.toLowerCase()} »`;
    },
    group: () => {
      if (scored.dims.group < 1) return null;
      const label = config.groups?.[context.group]?.reason;
      return label || null;
    },
    openWindow: () => {
      if (!avail || !avail.open) return null;
      if (avail.kind === "event-now") return `En ce moment, jusqu'à ${avail.label}`;
      if (avail.kind === "event-today") return `Aujourd'hui à ${avail.startsAt}`;
      if (avail.kind === "ongoing") return "À l'affiche en ce moment";
      if (!avail.label) return null;
      return tpl(copy.open, { close: avail.label }) || `Ouvert jusqu'à ${avail.label}`;
    },
    time: () => {
      if (context.timeAvailableMin == null || scored.dims.time < 0.55) return null;
      return tpl(copy.time, { duration: offer.durationMin }) ||
        `Tient dans vos ${context.timeAvailableMin} min`;
    },
    novelty: () => null,
  };

  for (const dim of ranked) {
    if (reasons.length >= 3) break;
    const r = builders[dim]?.();
    if (r && !reasons.includes(r)) reasons.push(r);
  }

  // Toujours garantir au moins la distance comme repère concret
  if (reasons.length === 0 && scored.km != null) {
    reasons.push(`À ${formatDistance(scored.km, sep)} de vous`);
  }
  return reasons.slice(0, 3);
}

/** Remplit un gabarit "{clé}" avec des valeurs. Renvoie null si pas de gabarit. */
function tpl(template, vars) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ""));
}
