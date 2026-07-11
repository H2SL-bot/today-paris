// data/freshness.js
// Vérifie la fraîcheur des offres et désactive celles qui sont périmées ou obsolètes.
// Règle d'or du projet : ne jamais présenter une offre expirée comme disponible.
// Les dates seules "AAAA-MM-JJ" sont interprétées en journée LOCALE de la ville :
// validFrom = début de journée (00:00), validUntil = fin de journée (23:59:59) inclus.

import { parseBoundaryDate } from "../engine/clock.js";

/**
 * @param {Array} offers offres brutes ingérées
 * @param {Date} now
 * @param {object} opts { staleAfterHours, timeZone }
 * @returns {{active:Array, expired:Array, stale:Array, invalid:Array}}
 */
export function validateAndExpire(offers, now = new Date(), opts = {}) {
  const staleAfterHours = opts.staleAfterHours ?? 72;
  const timeZone = opts.timeZone;
  const active = [];
  const expired = [];
  const stale = [];
  const invalid = [];

  for (const raw of offers) {
    const offer = normalize(raw);

    // Champs indispensables : sans eux, l'offre est inexploitable
    if (!offer.id || !offer.name || offer.lat == null || offer.lng == null) {
      invalid.push({ offer, reason: "champs-obligatoires-manquants" });
      continue;
    }

    // Expirée : la fin de validité (fin de journée locale) est passée
    const until = parseBoundaryDate(offer.validUntil, { endOfDay: true, timeZone });
    if (until && until < now) {
      offer.active = false;
      expired.push(offer);
      continue;
    }

    // Pas encore valide : le début de validité (début de journée locale) est dans le futur
    const from = parseBoundaryDate(offer.validFrom, { endOfDay: false, timeZone });
    if (from && from > now) {
      offer.active = false;
      expired.push(offer);
      continue;
    }

    // Obsolète : pas "revue" depuis trop longtemps (donnée qui n'a pas été rafraîchie)
    if (offer.lastSeen) {
      const ageH = (now - new Date(offer.lastSeen)) / 3600000;
      if (ageH > staleAfterHours) {
        offer.active = false;
        stale.push(offer);
        continue;
      }
    }

    offer.active = true;
    active.push(offer);
  }

  return { active, expired, stale, invalid };
}

/** Normalise une offre brute : valeurs par défaut, types propres. */
function normalize(raw) {
  return {
    active: true,
    tags: [],
    suitableFor: [],
    durationMin: null,
    ...raw,
    lat: raw.lat != null ? Number(raw.lat) : null,
    lng: raw.lng != null ? Number(raw.lng) : null,
  };
}
