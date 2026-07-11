// data/source.js
// Couche "sources de données". Chaque source est un adaptateur interchangeable.
// Aujourd'hui : fichier local (données de démonstration).
// Demain : API billetterie, flux ICS, Google Places, open data ville... même contrat.
//
// Contrat d'un adaptateur : async fetch(sourceDef, ctx) -> Array<offreBrute>

import { readFile } from "node:fs/promises";
import path from "node:path";
import { opendataParisAdapter } from "./adapters/opendata-paris.js";

/**
 * Adaptateur "fichier" : lit un JSON d'offres relatif au dossier du domaine.
 */
async function fileAdapter(sourceDef, ctx) {
  const filePath = path.isAbsolute(sourceDef.path)
    ? sourceDef.path
    : path.join(ctx.domainDir, sourceDef.path);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.offers || [];
}

const ADAPTERS = {
  file: fileAdapter,
  "opendata-paris": opendataParisAdapter, // événements réels "Que faire à Paris ?"
  // ics: icsAdapter,   // <- autres flux d'événements, plus tard
};

/**
 * Récupère et fusionne les offres de toutes les sources déclarées par le domaine.
 * @param {object} config  configuration du domaine (contient `sources`)
 * @param {object} ctx      { domainDir }
 * @returns {Promise<Array>} offres brutes, chacune tagguée avec sa source
 */
export async function ingestFromSources(config, ctx) {
  const out = [];
  for (const sourceDef of config.sources || []) {
    const adapter = ADAPTERS[sourceDef.type];
    if (!adapter) {
      console.warn(`[data] type de source inconnu: "${sourceDef.type}" (ignoré)`);
      continue;
    }
    try {
      const offers = await adapter(sourceDef, ctx);
      for (const o of offers) {
        out.push({
          ...o,
          source: sourceDef.name || sourceDef.type,
          // Une offre est de démonstration si sa source OU l'offre le déclare.
          demo: sourceDef.demo === true || o.demo === true,
        });
      }
      console.log(`[data] source "${sourceDef.name || sourceDef.type}" -> ${offers.length} offres`);
    } catch (err) {
      console.error(`[data] échec source "${sourceDef.name || sourceDef.type}":`, err.message);
    }
  }
  return out;
}

export const availableAdapters = () => Object.keys(ADAPTERS);
