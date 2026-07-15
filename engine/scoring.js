// engine/scoring.js
// Chaque dimension renvoie un score normalisé 0..1. Les poids viennent du domaine.

import { travelMinutes } from "./geo.js";
import { priceAmount } from "./filters.js";

// Borne 0..1 ET filet de sécurité : une entrée non finie (NaN/Infinity) -> 0,
// ce qui empêche un score bancal de contaminer le total d'une offre.
const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** Proximité : plus c'est près, mieux c'est. */
export function scoreDistance(km, config) {
  const maxKm = config.output?.maxDistanceKm ?? 6;
  return clamp01(1 - km / maxKm);
}

/** Budget : tient dans le budget, avec une petite préférence pour la marge. */
export function scoreBudget(offer, context) {
  const price = priceAmount(offer);
  if (!Number.isFinite(context.budget)) return 0.7; // budget non précisé -> neutre
  if (price === null) return 0.5; // prix inconnu (payant sans montant) -> neutre
  if (context.budget === 0) return price === 0 ? 1 : 0;
  return clamp01(1 - 0.35 * (price / context.budget));
}

/** Adéquation au temps disponible (trajet + durée de l'activité). */
export function scoreTime(offer, context, km, config) {
  if (!Number.isFinite(context.timeAvailableMin)) return 0.7;
  const travel = travelMinutes(km, config.output?.travelSpeedKmh ?? 11);
  const needed = travel + (offer.durationMin ?? 45);
  if (needed <= context.timeAvailableMin) {
    // reste-t-il de la marge sans que ce soit démesuré ? pic autour d'un bon ajustement
    return clamp01(1 - (context.timeAvailableMin - needed) / (context.timeAvailableMin * 2));
  }
  // dépasse un peu : pénalité progressive
  return clamp01(1 - (needed - context.timeAvailableMin) / context.timeAvailableMin);
}

/** Correspondance à l'envie/humeur via les affinités du domaine. */
export function scoreMood(offer, context, config) {
  const mood = config.moods?.[context.moodId];
  if (!mood || !mood.affinities) return 0.5;
  // Dédoublonnage : les lieux répètent leur catégorie dans les tags (category:"cafe", tags:["cafe",…]),
  // ce qui comptait deux fois la même affinité et gonflait injustement les lieux face aux événements.
  const keys = [...new Set([offer.category, ...(offer.tags || [])])];
  let best = 0;
  let sum = 0;
  for (const k of keys) {
    const a = mood.affinities[k];
    if (a != null) {
      best = Math.max(best, a);
      sum += a;
    }
  }
  // mélange "meilleure correspondance" + "accumulation" pour récompenser les offres très ciblées
  return clamp01(0.7 * best + 0.3 * Math.min(1, sum));
}

/** Adéquation à la configuration du groupe (solo, couple, amis, famille). */
export function scoreGroup(offer, context) {
  const list = offer.suitableFor;
  if (!list || list.length === 0) return 0.6;
  return list.includes(context.group) ? 1 : 0.25;
}

/**
 * Qualité de la disponibilité "maintenant".
 * Un événement qui a lieu EN CE MOMENT prime ; un lieu ouvert est jugé sur sa marge
 * avant fermeture ; un événement plus tard aujourd'hui ou "à l'affiche" vient après.
 */
export function scoreOpenWindow(offer, context, km, config, avail) {
  if (!avail) return 0.7;
  if (avail.kind === "event-now") return 1; // ça se passe là, tout de suite
  if (avail.kind === "event-today") return 0.8; // ce soir / plus tard aujourd'hui
  if (avail.kind === "ongoing") return 0.6; // à l'affiche ces jours-ci (horaire précis inconnu)

  // Lieu à horaires : marge de temps avant fermeture
  const left = avail.closesInMin;
  if (!isFinite(left)) return 1; // 24/7
  const travel = travelMinutes(km, config.output?.travelSpeedKmh ?? 11);
  const usable = left - travel;
  const needed = Math.min(offer.durationMin ?? 45, 45);
  if (usable <= 0) return 0.05;
  return clamp01(usable / needed);
}

/**
 * Nouveauté / exploration : léger bonus aux offres récentes ou peu montrées.
 * `signals` (optionnel) : { impressions, clicks } injecté par la couche données.
 */
export function scoreNovelty(offer, context) {
  const s = offer._signals;
  if (s && s.impressions > 0) {
    // moins une offre a été montrée, plus on l'explore (décroît avec les impressions)
    return clamp01(1 / Math.log2(s.impressions + 2));
  }
  // sinon, fraîcheur : mise en ligne récente (date validée)
  if (offer.validFrom) {
    const t = Date.parse(offer.validFrom);
    if (Number.isFinite(t)) {
      const ageDays = (context.now - t) / 86400000;
      return clamp01(1 - ageDays / 21);
    }
  }
  return 0.5;
}

/**
 * Popularité : ce que les visiteurs cliquent vraiment (via context.stats du "cerveau").
 * Lissé pour ne PAS sur-réagir tant qu'il y a peu de données (reste neutre au début).
 */
export function scorePopularity(offer, context) {
  const stats = context.stats;
  if (!stats) return 0.5; // pas de cerveau branché -> neutre
  let base = 0.5;
  const cat = stats.categories?.[offer.category];
  if (cat && cat.i >= 5) {
    const ctr = (cat.c + 0.5) / (cat.i + 5); // taux de clic lissé
    base = clamp01(ctr * 4); // ctr ~0.1 -> 0.4 ; ctr ~0.25 -> 1
  }
  const clicks = stats.offerClicks?.[offer.id] || 0;
  const bonus = clicks > 0 ? Math.min(0.3, 0.1 * clicks) : 0;
  return clamp01(base + bonus);
}

/**
 * Calcule toutes les dimensions + le total pondéré et normalisé.
 * @returns {{total:number, dims:Record<string,number>, weighted:Record<string,number>, km:number}}
 */
export function scoreOffer(offer, context, config, km, avail) {
  const dims = {
    mood: scoreMood(offer, context, config),
    distance: scoreDistance(km, config),
    budget: scoreBudget(offer, context),
    time: scoreTime(offer, context, km, config),
    group: scoreGroup(offer, context),
    openWindow: scoreOpenWindow(offer, context, km, config, avail),
    popularity: scorePopularity(offer, context),
    novelty: scoreNovelty(offer, context),
  };

  const weights = config.weights || {};
  const totalWeight =
    Object.keys(dims).reduce((s, k) => s + (weights[k] ?? 0), 0) || 1;

  const weighted = {};
  let total = 0;
  for (const k of Object.keys(dims)) {
    const w = (weights[k] ?? 0) / totalWeight;
    weighted[k] = dims[k] * w;
    total += weighted[k];
  }

  // Facteur "maintenant" : un événement réellement EN COURS (ou un lieu OUVERT) prime ;
  // un lieu FERMÉ ou un événement seulement "à l'affiche" (horaire du jour inconnu) est
  // minoré car on n'a pas confirmé qu'il est accessible à cette minute.
  let nowness;
  if (avail?.kind === "venue") nowness = avail.open ? 1 : 0.4;
  else nowness = { "event-now": 1, "event-today": 0.92, ongoing: 0.72, "event-none": 0.4 }[avail?.kind] ?? 1;
  total *= nowness;

  return { total, dims, weighted, km };
}
