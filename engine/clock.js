// engine/clock.js
// Utilitaires de temps SENSIBLES AU FUSEAU HORAIRE, génériques (le fuseau vient du domaine).
// Sans dépendance : on s'appuie sur Intl.DateTimeFormat.

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Cache des formateurs : `new Intl.DateTimeFormat` est coûteux et était reconstruit des milliers
// de fois par recherche (une fois par lieu/événement). Les options sont constantes -> on réutilise.
const _dtfCache = new Map();
export function dtf(locale, options) {
  const key = locale + "|" + JSON.stringify(options);
  let f = _dtfCache.get(key);
  if (!f) { f = new Intl.DateTimeFormat(locale, options); _dtfCache.set(key, f); }
  return f;
}

/**
 * "Heure murale" d'un instant dans un fuseau donné.
 * @param {Date} date
 * @param {string} [timeZone] ex. "Europe/Paris". Si absent -> heure locale du process.
 * @returns {{dayIndex:number, minutes:number, hh:number, mm:number}}
 */
// Cache du RÉSULTAT : dans une recommandation, `now` est identique pour tous les lieux/événements,
// et wallClock(now, tz) est appelé ~4× par lieu. On mémorise le résultat (pas juste le formateur)
// → une seule construction par instant. (Objet en lecture seule côté appelants : partage sûr.)
const _wallCache = new Map();
export function wallClock(date, timeZone) {
  if (!timeZone) {
    return { dayIndex: date.getDay(), minutes: date.getHours() * 60 + date.getMinutes(), hh: date.getHours(), mm: date.getMinutes() };
  }
  const key = date.getTime() + "|" + timeZone;
  const cached = _wallCache.get(key);
  if (cached) return cached;
  const parts = dtf("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  let wd, h = 0, m = 0;
  for (const p of parts) {
    if (p.type === "weekday") wd = p.value;
    else if (p.type === "hour") h = parseInt(p.value, 10) % 24; // "24" (minuit) -> 0
    else if (p.type === "minute") m = parseInt(p.value, 10);
  }
  const result = { dayIndex: DAY_INDEX[wd] ?? date.getDay(), minutes: h * 60 + m, hh: h, mm: m };
  if (_wallCache.size > 256) _wallCache.clear(); // borne mémoire (nouvel instant à chaque recherche)
  _wallCache.set(key, result);
  return result;
}

/** Décalage (minutes) du fuseau à cet instant : local = utc + offset. */
export function tzOffsetMinutes(date, timeZone) {
  if (!timeZone) return -date.getTimezoneOffset();
  const p = dtf("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** Instant UTC correspondant à une heure murale (y,mo,d,h,mi) dans un fuseau. */
export function zonedInstant(y, mo, d, h, mi, s, ms, timeZone) {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const off = tzOffsetMinutes(new Date(utcGuess), timeZone);
  return new Date(utcGuess - off * 60000);
}

/**
 * Interprète une date de validité en frontière de journée LOCALE.
 * - "AAAA-MM-JJ"  -> début (00:00) ou fin (23:59:59.999) de journée dans le fuseau.
 * - avec 'T' (datetime ISO) -> instant exact tel quel.
 * @returns {Date|null}
 */
export function parseBoundaryDate(str, { endOfDay = false, timeZone } = {}) {
  if (!str) return null;
  if (String(str).includes("T")) {
    const d = new Date(str);
    return isNaN(d) ? null : d;
  }
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date(str);
    return isNaN(d) ? null : d;
  }
  const [, y, mo, d] = m.map(Number);
  return endOfDay
    ? zonedInstant(y, mo, d, 23, 59, 59, 999, timeZone)
    : zonedInstant(y, mo, d, 0, 0, 0, 0, timeZone);
}
