// data/store.js
// Stockage runtime (sans base de données) : snapshot des offres actives,
// journal des impressions et des clics. Tout est écrit sous data-store/<domaine>/.

import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // .../data
const BASE = path.join(ROOT, "..", "data-store");

export function storePaths(domain) {
  const dir = path.join(BASE, domain);
  return {
    dir,
    active: path.join(dir, "offers.active.json"),
    impressions: path.join(dir, "impressions.jsonl"),
    clicks: path.join(dir, "clicks.jsonl"),
    reportsDir: path.join(dir, "reports"),
    latestReport: path.join(dir, "reports", "latest.json"),
  };
}

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

// Bornage des valeurs journalisées : on ne recopie jamais un champ client sans limite.
const capStr = (v, max = 80) => (v == null ? undefined : String(v).slice(0, max));
const capNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Sauvegarde le jeu d'offres actives calculé par la boucle. */
export async function saveActiveOffers(domain, offers) {
  const p = storePaths(domain);
  await ensureDir(p.dir);
  const payload = { domain, updatedAt: new Date().toISOString(), count: offers.length, offers };
  await writeFile(p.active, JSON.stringify(payload, null, 2), "utf8");
  return p.active;
}

/** Charge les offres actives (renvoie [] si la boucle n'a jamais tourné). */
export async function loadActiveOffers(domain) {
  const p = storePaths(domain);
  if (!existsSync(p.active)) return [];
  try {
    const parsed = JSON.parse(await readFile(p.active, "utf8"));
    return parsed.offers || [];
  } catch {
    return [];
  }
}

/** Journalise les offres montrées à un utilisateur (pour calculer le taux de clic). */
export async function logImpressions(domain, offerIds, context = {}) {
  const p = storePaths(domain);
  await ensureDir(p.dir);
  const ts = new Date().toISOString();
  const lines = offerIds
    .map((id) => JSON.stringify({ ts, offerId: capStr(id, 128), moodId: capStr(context.moodId), group: capStr(context.group) }))
    .join("\n");
  if (lines) await appendFile(p.impressions, lines + "\n", "utf8");
}

/** Journalise un clic sur une offre / un bouton d'action. */
export async function logClick(domain, record) {
  const p = storePaths(domain);
  await ensureDir(p.dir);
  // On ne journalise que des champs connus et bornés (jamais le corps client brut).
  const safe = {
    ts: new Date().toISOString(),
    offerId: capStr(record.offerId, 128),
    action: capStr(record.action, 40),
    moodId: capStr(record.moodId),
    group: capStr(record.group),
    position: capNum(record.position),
  };
  await appendFile(p.clicks, JSON.stringify(safe) + "\n", "utf8");
}

/** Lit un fichier JSONL en tableau d'objets (ignore les lignes invalides). */
export async function readJsonl(file) {
  if (!existsSync(file)) return [];
  const text = await readFile(file, "utf8");
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* ligne corrompue ignorée */
    }
  }
  return out;
}

export { ensureDir };
