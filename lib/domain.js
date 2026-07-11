// lib/domain.js
// Charge la configuration d'un domaine et l'emplacement de son dossier.
// C'est le point de bascule multi-domaines : DOMAIN=visitwine.com -> autre config.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DOMAINS_DIR = path.join(HERE, "..", "domains");

export function resolveDomainName() {
  return process.env.DOMAIN || "today.paris";
}

/**
 * @param {string} [domain]
 * @returns {Promise<{config:object, domainDir:string, domain:string}>}
 */
export async function loadDomain(domain = resolveDomainName()) {
  const domainDir = path.join(DOMAINS_DIR, domain);
  const configPath = path.join(domainDir, "config.js");
  if (!existsSync(configPath)) {
    throw new Error(`Domaine introuvable : ${domain} (attendu : ${configPath})`);
  }
  const mod = await import(`file://${configPath}`);
  const config = mod.default;
  return { config, domainDir, domain: config.domain || domain };
}
