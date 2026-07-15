#!/usr/bin/env node
// scripts/fetch-events.mjs
// Construit l'instantané QUOTIDIEN des événements du jour → domains/today.paris/events.json.
// But : charger TOUT l'inventaire réel (~850 événements) au lieu des 200 chargés en direct.
// La boucle relance ce script chaque jour ; le client lit l'instantané (rapide, léger, fiable)
// et calcule « en ce moment / à HHh » côté navigateur à partir des horaires réels.
// Repli : si l'instantané manque ou date d'hier, le client repasse en direct sur l'Open Data.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { opendataParisAdapter } from "../data/adapters/opendata-paris.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TZ = "Europe/Paris";
const OUT = path.join(ROOT, "domains", "today.paris", "events.json");

const localDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// Un événement multi-jours liste TOUS ses créneaux futurs (parfois des centaines).
// La disponibilité côté client ne regarde QUE les créneaux du jour (ou en cours) : on jette
// le reste pour alléger l'instantané (~60 % de moins). On garde toujours au moins un créneau
// pour que le tableau reste non vide (comportement de disponibilité identique).
function trimOccurrences(occ, now, today) {
  const keep = occ.filter((o) => {
    const s = new Date(o.start), e = new Date(o.end);
    if (isNaN(s) || isNaN(e)) return false;
    return (s <= now && now <= e) || localDate(s) === today; // en cours OU commence aujourd'hui
  });
  if (keep.length) return keep;
  const future = occ.map((o) => ({ o, s: new Date(o.start) })).filter((x) => !isNaN(x.s)).sort((a, b) => a.s - b.s);
  return future.length ? [future[0].o] : occ.slice(0, 1);
}

async function main() {
  const now = new Date();
  const builtFor = localDate(now);
  // limit large : on veut TOUT l'inventaire du jour (l'adaptateur s'arrête à la dernière page).
  const raw = await opendataParisAdapter({ name: "que-faire", limit: 1200, timezone: TZ }, { now });
  const offers = raw.map((o) =>
    Array.isArray(o.occurrences) && o.occurrences.length > 1
      ? { ...o, occurrences: trimOccurrences(o.occurrences, now, builtFor) }
      : o
  );
  const snapshot = {
    _source: "Open Data Ville de Paris — que-faire-a-paris-",
    builtFor,
    builtAt: now.toISOString(),
    count: offers.length,
    offers,
  };
  await writeFile(OUT, JSON.stringify(snapshot));
  console.log(`[fetch:events] ${offers.length} événements → events.json (${builtFor})`);
}

main().catch((e) => { console.error("[fetch:events] échec :", e.message); process.exit(1); });
