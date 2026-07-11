// data/opening-hours.js
// Conversion CONSERVATRICE d'un tag OpenStreetMap `opening_hours` vers les horaires
// hebdomadaires du moteur ({ mon:[["08:00","20:00"]], ... } ou "24/7").
//
// RÈGLE D'OR : en cas de doute (syntaxe non reconnue, horaires saisonniers, etc.),
// on renvoie null → le lieu est écarté. On n'invente JAMAIS d'horaire.

const KEY = { Su: "sun", Mo: "mon", Tu: "tue", We: "wed", Th: "thu", Fr: "fri", Sa: "sat" };
const ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function dayTokensToList(spec) {
  const out = [];
  for (const part of spec.split(",")) {
    const p = part.trim();
    if (/^(Mo|Tu|We|Th|Fr|Sa|Su)$/.test(p)) { out.push(p); continue; }
    const m = p.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/);
    if (!m) return null;
    let k = ORDER.indexOf(m[1]);
    const end = m[2];
    for (let n = 0; n < 7; n++) {
      out.push(ORDER[k]);
      if (ORDER[k] === end) break;
      k = (k + 1) % 7;
    }
  }
  return out.length ? out : null;
}

function parseTimes(spec) {
  const intervals = [];
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const oh = +m[1], om = +m[2], ch = +m[3], cm = +m[4];
    if (oh > 24 || ch > 24 || om > 59 || cm > 59) return null;
    intervals.push([`${String(oh).padStart(2, "0")}:${m[2]}`, `${String(ch).padStart(2, "0")}:${m[4]}`]);
  }
  return intervals;
}

/**
 * @param {string} raw valeur brute du tag opening_hours
 * @returns {object|string|null} horaires hebdo, "24/7", ou null si non convertible sûrement
 */
export function parseOpeningHours(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (s === "24/7" || s === "24/7 open" || s === "Mo-Su 00:00-24:00") return "24/7";

  // Rejets sûrs : mois/saisons, semaines, dates, éphémérides, opérateurs avancés.
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s)) return null;
  if (/week|easter|sunrise|sunset|dawn|dusk|\+|\bSH\b\s*\d|"/.test(s)) return null;
  if (/\b\d{4}\b/.test(s)) return null; // années / dates

  const week = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  let any = false;

  for (let rule of s.split(";")) {
    rule = rule.trim();
    if (!rule) continue;
    if (/^(PH|SH)\b/i.test(rule)) continue; // jours fériés / vacances : n'affecte pas la semaine type

    let dayList, rest;
    const dm = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su))*)\s+(.*)$/);
    if (dm) {
      dayList = dayTokensToList(dm[1]);
      rest = dm[2].trim();
      if (!dayList) return null;
    } else {
      dayList = [...ORDER];
      rest = rule;
    }

    if (/^(off|closed)$/i.test(rest)) {
      for (const d of dayList) week[KEY[d]] = [];
      any = true;
      continue;
    }
    rest = rest.replace(/\s+open$/i, "");
    const intervals = parseTimes(rest);
    if (!intervals) return null; // syntaxe inconnue → on écarte le lieu entier
    for (const d of dayList) week[KEY[d]] = intervals.slice();
    any = true;
  }

  if (!any) return null;
  for (const k of Object.keys(week)) if (!week[k].length) delete week[k];
  return Object.keys(week).length ? week : null;
}
