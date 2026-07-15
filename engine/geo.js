// engine/geo.js
// Outils géographiques génériques. Aucune dépendance à un domaine.

const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Distance à vol d'oiseau entre deux points (formule de Haversine).
 * @param {{lat:number,lng:number}} a
 * @param {{lat:number,lng:number}} b
 * @returns {number} distance en kilomètres
 */
export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Estimation grossière du temps de trajet (marche + transports) en minutes.
 * @param {number} km
 * @param {number} speedKmh vitesse moyenne effective porte-à-porte
 */
export function travelMinutes(km, speedKmh = 11) {
  if (!isFinite(km)) return Infinity;
  // + 4 min forfaitaires (attente, marche jusqu'au lieu exact)
  return Math.round((km / speedKmh) * 60) + 4;
}

/** Formatte une distance pour l'affichage : "400 m", "1,2 km" (séparateur décimal selon la langue). */
export function formatDistance(km, decimalSep = ",") {
  if (!isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", decimalSep)} km`;
}
