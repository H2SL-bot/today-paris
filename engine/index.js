// engine/index.js
// Surface publique du moteur réutilisable.
// Pour un nouveau domaine (visitwine.com, lacanau.surf, ...) : réutiliser ce moteur
// tel quel, changer uniquement `config` (domaine) et la source de données.

export { recommend } from "./recommend.js";
export { distanceKm, travelMinutes, formatDistance } from "./geo.js";
export { isOpenAt, minutesUntilClose, closingTimeLabel } from "./time.js";
export { availability } from "./availability.js";
export { wallClock, parseBoundaryDate } from "./clock.js";
export { scoreOffer } from "./scoring.js";
