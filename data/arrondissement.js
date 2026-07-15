// data/arrondissement.js
// Détermine l'arrondissement de Paris d'un point (lat/lng) par « point dans polygone »
// (ray casting), à partir des vraies limites (domains/*/arrondissements.json).
// Sert de secours quand l'adresse OSM n'a pas de code postal (2/3 des lieux).

/** Le point (lng,lat) est-il dans l'anneau (liste de [lng,lat]) ? */
export function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Numéro d'arrondissement (1..20) contenant le point, ou null s'il est hors de Paris. */
export function arrondissementNumber(lat, lng, boundaries) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Array.isArray(boundaries)) return null;
  for (const b of boundaries) if (pointInRing(lng, lat, b.ring)) return b.ar;
  return null;
}

/** Libellé « Nᵉ arrondissement » depuis lat/lng, ou null. (Même format que l'adaptateur événements.) */
export function arrondissementLabel(lat, lng, boundaries) {
  const n = arrondissementNumber(lat, lng, boundaries);
  return n ? `${n}ᵉ arrondissement` : null;
}
