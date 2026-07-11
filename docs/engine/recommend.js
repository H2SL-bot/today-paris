// engine/recommend.js
// Point d'entrée du moteur. Domaine-agnostique.
// Contrat : recommend({ context, candidates, config }) -> { results, meta }

import { evaluateHardFilters } from "./filters.js";
import { scoreOffer } from "./scoring.js";
import { explain } from "./explain.js";
import { rankAndDiversify } from "./rank.js";
import { formatDistance } from "./geo.js";
import { availability } from "./availability.js";

/**
 * @param {object} params
 * @param {object} params.context     profil de l'utilisateur (voir README)
 * @param {Array}  params.candidates  offres actives à évaluer
 * @param {object} params.config      configuration propre au domaine
 * @returns {{results:Array, meta:object}}
 */
export function recommend({ context, candidates, config }) {
  const now = context.now instanceof Date ? context.now : new Date(context.now || Date.now());
  const ctx = { ...context, now };
  const tz = config.city?.timezone;

  const kept = [];
  const rejected = { closed: 0, "over-budget": 0, "too-far": 0, "not-enough-time": 0, inactive: 0 };

  for (const offer of candidates) {
    // Disponibilité calculée UNE fois, puis partagée (filtres, score, explication, affichage).
    const avail = availability(offer, now, tz);
    const verdict = evaluateHardFilters(offer, ctx, config, now, avail);
    if (!verdict.ok) {
      if (rejected[verdict.reason] != null) rejected[verdict.reason]++;
      continue;
    }
    const scored = scoreOffer(offer, ctx, config, verdict.km, avail);
    kept.push({
      offer,
      score: scored.total,
      breakdown: scored.dims,
      distanceKm: verdict.km,
      avail,
      reasons: explain(offer, scored, ctx, config, avail),
    });
  }

  const ranked = rankAndDiversify(kept, config);
  const results = ranked.map((r) => present(r, config, now));

  return {
    results,
    meta: {
      domain: config.domain,
      now: now.toISOString(),
      evaluated: candidates.length,
      eligible: kept.length,
      returned: results.length,
      rejected,
    },
  };
}

/** Met en forme un résultat pour l'affichage (champs prêts pour l'UI). */
function present(r, config, now) {
  const o = r.offer;
  const a = r.avail;
  return {
    id: o.id,
    name: o.name,
    category: o.category,
    descriptionShort: o.descriptionShort,
    neighborhood: o.neighborhood,
    lat: o.lat,
    lng: o.lng,
    distance: formatDistance(r.distanceKm),
    distanceKm: Number(r.distanceKm?.toFixed?.(2) ?? r.distanceKm),
    price: priceLabel(o),
    // Disponibilité prête pour l'UI (lieu ouvert / événement en cours / événement ce jour)
    availability: {
      kind: a.kind,
      ongoing: a.ongoing,
      closingLabel: a.label,
      startsAt: a.startsAt,
    },
    closingLabel: a.kind === "venue" ? a.label : null, // rétro-compat
    durationMin: o.durationMin ?? null,
    reasons: r.reasons,
    booking: o.bookingUrl
      ? { url: o.bookingUrl, label: o.bookingLabel || "Réserver" }
      : o.mapUrl
        ? { url: o.mapUrl, label: "Y aller" }
        : null,
    demo: o.demo === true,
    score: Number(r.score.toFixed(3)),
  };
}

function priceLabel(offer) {
  if (!offer.price || offer.price.free) {
    return offer.price?.note ? `Gratuit ${offer.price.note}` : "Gratuit";
  }
  if (offer.price.unknown) return offer.price.note || "Payant";
  const suffix = offer.price.note ? ` ${offer.price.note}` : "";
  return `${offer.price.amount} €${suffix}`;
}
