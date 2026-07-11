// engine/availability.js
// Disponibilité unifiée d'une offre à l'instant `now` :
//  - LIEU  : horaires hebdomadaires (offer.hours)               -> ouvert / fermé
//  - ÉVÉNEMENT : créneaux datés (offer.occurrences [{start,end}]) -> en ce moment / aujourd'hui
//  - ÉVÉNEMENT CONTINU : fenêtre (offer.eventWindow {start,end}) -> en cours (ex. expo)
// Renvoie une forme commune que les filtres, le score et l'affichage consomment.

import { isOpenAt, minutesUntilClose, closingTimeLabel } from "./time.js";
import { wallClock } from "./clock.js";

const localDateStr = (date, tz) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

const hhmm = (date, tz) => {
  const wc = wallClock(date, tz);
  return `${String(wc.hh).padStart(2, "0")}h${String(wc.mm).padStart(2, "0")}`;
};

/**
 * @returns {{open:boolean, ongoing:boolean, closesInMin:number, label:?string,
 *            startsAt:?string, kind:string}}
 */
export function availability(offer, now, timeZone) {
  if (Array.isArray(offer.occurrences) && offer.occurrences.length) {
    return fromOccurrences(offer.occurrences, now, timeZone);
  }
  if (offer.eventWindow) {
    const end = new Date(offer.eventWindow.end);
    const closesInMin = isNaN(end) ? Infinity : Math.max(0, (end - now) / 60000);
    return { open: true, ongoing: true, closesInMin, label: null, startsAt: null, kind: "ongoing" };
  }
  // Lieu à horaires hebdomadaires (ou sans horaires connus)
  const open = isOpenAt(offer.hours, now, timeZone);
  return {
    open,
    ongoing: open,
    closesInMin: open ? minutesUntilClose(offer.hours, now, timeZone) : 0,
    label: open ? closingTimeLabel(offer.hours, now, timeZone) : null,
    startsAt: null,
    kind: "venue",
  };
}

function fromOccurrences(occ, now, timeZone) {
  const today = localDateStr(now, timeZone);
  let ongoing = null;
  let nextToday = null;
  for (const o of occ) {
    const start = new Date(o.start);
    const end = new Date(o.end);
    if (isNaN(start) || isNaN(end)) continue;
    if (start <= now && now <= end) {
      if (!ongoing || end < new Date(ongoing.end)) ongoing = o;
    } else if (start > now && localDateStr(start, timeZone) === today) {
      if (!nextToday || start < new Date(nextToday.start)) nextToday = o;
    }
  }
  if (ongoing) {
    const end = new Date(ongoing.end);
    return { open: true, ongoing: true, closesInMin: Math.max(0, (end - now) / 60000), label: hhmm(end, timeZone), startsAt: null, kind: "event-now" };
  }
  if (nextToday) {
    const start = new Date(nextToday.start);
    const end = new Date(nextToday.end);
    return { open: true, ongoing: false, closesInMin: Math.max(1, (end - now) / 60000), label: hhmm(start, timeZone), startsAt: hhmm(start, timeZone), kind: "event-today" };
  }
  return { open: false, ongoing: false, closesInMin: 0, label: null, startsAt: null, kind: "event-none" };
}
