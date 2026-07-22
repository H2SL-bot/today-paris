// engine/time.js
// Logique horaire : est-ce ouvert maintenant ? combien de temps encore ?
// Sensible au fuseau : on raisonne en HEURE MURALE de la ville (timeZone), pas celle du serveur.
// Format des horaires d'une offre :
//   hours === "24/7"                      -> toujours ouvert
//   hours === { mon:[["09:00","18:00"]], ... }  (clés : mon..sun)
//   Un intervalle dont la fermeture <= l'ouverture traverse minuit ("20:00"->"02:00").

import { wallClock } from "./clock.js";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
};

/**
 * L'offre est-elle ouverte à l'instant `now` (dans le fuseau `timeZone`) ?
 */
export function isOpenAt(hours, now, timeZone) {
  // Horaires inconnus : on ne PEUT pas affirmer que c'est ouvert. On renvoie null
  // (« on ne sait pas »), distinct de false (« fermé »). Le filtre « ouvert
  // maintenant » écarte les inconnus ; sans ce filtre, le lieu reste proposé avec
  // une mention honnête. Renvoyer true reviendrait à envoyer quelqu'un devant une
  // grille fermée — un parc clôturé n'est pas ouvert à 3 h du matin.
  if (!hours) return null;
  if (hours === "24/7") return true;

  const wc = wallClock(now, timeZone);
  const nowMin = wc.minutes;
  const todayKey = DAY_KEYS[wc.dayIndex];
  const yestKey = DAY_KEYS[(wc.dayIndex + 6) % 7];

  for (const [openStr, closeStr] of hours[todayKey] || []) {
    const open = toMinutes(openStr);
    const close = toMinutes(closeStr);
    if (close > open) {
      if (nowMin >= open && nowMin < close) return true;
    } else if (nowMin >= open) {
      return true; // traverse minuit : ouvert jusqu'à la fin de journée
    }
  }
  // intervalles de la veille qui débordent après minuit
  for (const [openStr, closeStr] of hours[yestKey] || []) {
    const open = toMinutes(openStr);
    const close = toMinutes(closeStr);
    if (close <= open && nowMin < close) return true;
  }
  return false;
}

/**
 * Minutes restantes avant la prochaine fermeture (à partir de `now`).
 * Renvoie Infinity si 24/7, 0 si fermé.
 */
export function minutesUntilClose(hours, now, timeZone) {
  if (!hours) return Infinity;
  if (hours === "24/7") return Infinity;
  if (!isOpenAt(hours, now, timeZone)) return 0;

  const wc = wallClock(now, timeZone);
  const nowMin = wc.minutes;
  const todayKey = DAY_KEYS[wc.dayIndex];
  const yestKey = DAY_KEYS[(wc.dayIndex + 6) % 7];

  for (const [openStr, closeStr] of hours[todayKey] || []) {
    const open = toMinutes(openStr);
    const close = toMinutes(closeStr);
    if (close > open) {
      if (nowMin >= open && nowMin < close) return close - nowMin;
    } else if (nowMin >= open) {
      return 24 * 60 - nowMin + close; // ferme après minuit
    }
  }
  for (const [openStr, closeStr] of hours[yestKey] || []) {
    const open = toMinutes(openStr);
    const close = toMinutes(closeStr);
    if (close <= open && nowMin < close) return close - nowMin;
  }
  return 0;
}

/** "23h00" : heure de fermeture, exprimée en heure murale de la ville. */
export function closingTimeLabel(hours, now, timeZone) {
  const left = minutesUntilClose(hours, now, timeZone);
  if (!isFinite(left)) return "24h/24";
  const wc = wallClock(now, timeZone);
  const total = wc.minutes + left;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}h${String(mm).padStart(2, "0")}`;
}
