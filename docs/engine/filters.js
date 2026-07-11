// engine/filters.js
// Filtres "durs" : une offre qui échoue ici n'est jamais proposée.
// Aucune connaissance de domaine : tout vient de `context` et `config`.

import { distanceKm, travelMinutes } from "./geo.js";

/**
 * @param {object} offer
 * @param {object} context  { location:{lat,lng}, now:Date, budget:number|null,
 *                            group:string, moodId:string, timeAvailableMin:number|null }
 * @param {object} config
 * @param {Date} now
 * @param {object} avail    disponibilité pré-calculée (voir availability.js)
 * @returns {{ok:boolean, reason?:string, km?:number}}
 */
export function evaluateHardFilters(offer, context, config, now, avail) {
  // 1. Offre active (non expirée / non désactivée par la boucle)
  if (offer.active === false) return { ok: false, reason: "inactive" };

  // 2a. Événement dont AUCUNE séance n'a lieu aujourd'hui (toutes passées) = terminé :
  //     jamais proposé, même en mode « pas seulement ce qui est ouvert maintenant ».
  if (avail && avail.kind === "event-none") {
    return { ok: false, reason: "closed" };
  }
  // 2b. Disponible maintenant (lieu ouvert, ou événement en cours / plus tard aujourd'hui)
  if (context.requireOpenNow !== false && avail && !avail.open) {
    return { ok: false, reason: "closed" };
  }

  // 3. Budget : le prix mini par personne doit tenir dans le budget.
  //    price peut valoir null (prix inconnu, ex. "payant" sans montant).
  const price = priceAmount(offer);
  if (Number.isFinite(context.budget)) {
    if (context.budget === 0) {
      if (price !== 0) return { ok: false, reason: "over-budget" }; // veut gratuit : prix inconnu écarté
    } else if (Number.isFinite(price) && price > context.budget) {
      return { ok: false, reason: "over-budget" };
    }
  }

  // 4. Distance : trop loin -> écarté
  const km = context.location
    ? distanceKm(context.location, { lat: offer.lat, lng: offer.lng })
    : 0;
  const maxKm = (config.output?.maxDistanceKm ?? 6) * 1.5;
  if (km > maxKm) return { ok: false, reason: "too-far", km };

  // 5. Temps disponible : au minimum pouvoir s'y rendre + s'engager un peu
  if (Number.isFinite(context.timeAvailableMin)) {
    const travel = travelMinutes(km, config.output?.travelSpeedKmh ?? 11);
    const minEngage = Math.min(offer.durationMin ?? 30, 30);
    if (travel + minEngage > context.timeAvailableMin) {
      return { ok: false, reason: "not-enough-time", km };
    }
  }

  return { ok: true, km };
}

/** Prix minimum par personne : 0 si gratuit, null si inconnu, sinon le montant. */
export function priceAmount(offer) {
  if (!offer.price || offer.price.free) return 0;
  if (offer.price.unknown) return null; // "payant" sans montant connu
  const n = Number(offer.price.amount);
  return Number.isFinite(n) ? n : 0;
}
