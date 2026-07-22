#!/usr/bin/env node
// scripts/translate-delta.mjs
// Traduction quotidienne du DÉLTA d'événements (boucle GitHub Actions, Mac éteint).
// Pour chaque langue : événements du jour absents du dictionnaire → traduction + relecture
// via l'API Claude (modèle économique), fusion sous garde-fous. JAMAIS destructif :
// sans clé API, en cas d'erreur ou de résultat suspect, les dictionnaires restent intacts
// (le site affiche le français en repli — jamais cassé).
//
// Env : ANTHROPIC_API_KEY (requis — sinon sortie silencieuse code 0)
//       TRANSLATE_MODEL   (défaut claude-haiku-4-5 — économique, validé par Gérald)
//       MAX_DELTA         (défaut 200 — borne le coût quotidien par langue)

import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOM = path.join(ROOT, "domains", "today.paris");
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.TRANSLATE_MODEL || "claude-haiku-4-5";
const MAX_DELTA = Number(process.env.MAX_DELTA || 200);
const BATCH = 40;

if (!API_KEY) {
  console.log("[translate-delta] ANTHROPIC_API_KEY absent — étape sautée (repli français).");
  process.exit(0);
}

// Même normalisation que translate.js côté site : les modèles normalisent la typographie
// française invisible (espaces fines U+202F, apostrophes courbes) en recopiant les clés.
const normKey = (s) => String(s == null ? "" : s)
  .replace(/[  ​]/g, " ").replace(/[‘’′]/g, "'")
  .replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

const LANGS = {
  en: { name: "English", extra: "Natural, concise English for a traveler in Paris." },
  es: { name: "Spanish (neutral Spain/Latin America)", extra: "Natural neutral Spanish; Spanish punctuation (¡…!, «…») where fitting." },
  it: { name: "Italian", extra: '"Visita guidata", "Mostra", "Spettacolo", "Gratuito"; "Laboratorio" sauf nom propre.' },
  de: { name: "German", extra: 'German noun capitalization. "Führung", "Ausstellung", "Aufführung", "Kostenlos".' },
  pt: { name: "Brazilian Portuguese (você)", extra: '"Visita guiada", "Oficina", "Exposição", "Espetáculo", "Gratuito".' },
  nl: { name: "Dutch", extra: '"Rondleiding", "Tentoonstelling", "Voorstelling", "Gratis".' },
  ru: { name: "Russian", extra: 'Cyrillic for descriptive parts ONLY. Proper nouns stay in LATIN script verbatim — never transliterate. "Экскурсия", "Выставка", "Бесплатно".' },
  hi: { name: "Hindi (Devanagari)", extra: "Devanagari for descriptive parts; common English loanwords fine. Proper nouns stay in LATIN script verbatim." },
  zh: { name: "Simplified Chinese", extra: "Simplified characters only. Proper nouns stay in LATIN script verbatim." },
  ja: { name: "Japanese", extra: 'Proper nouns stay in LATIN script verbatim — never katakana-ize them. "ガイドツアー", "展覧会", "無料".' },
  ko: { name: "Korean", extra: 'Proper nouns stay in LATIN script verbatim — never Hangul-ize them. "가이드 투어", "전시", "무료".' },
  ar: { name: "Modern Standard Arabic", extra: "MSA readable across the Arab world. Proper nouns stay in LATIN script verbatim." },
};

const RULES = (L) => `You translate real Paris event listings (City of Paris open data) from French into ${L.name}. ${L.extra}
STRICT RULES: translate DESCRIPTIVE parts (guided tour, workshop, exhibition, concert, show…); KEEP PROPER NOUNS IN LATIN SCRIPT verbatim (venues, artists, people, brands, streets, work titles, festivals); if the WHOLE title is a proper name, n EQUALS fr exactly; NEVER invent facts, dates or prices; d = faithful rendering of desc, <=160 chars, "" if the source desc is empty; every "fr" MUST be copied VERBATIM from the batch (it is the dictionary key).`;

// Sortie JSON GARANTIE par le schéma (structured outputs) — jamais de parsing hasardeux.
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["fr", "n", "d"],
        properties: { fr: { type: "string" }, n: { type: "string" }, d: { type: "string" } },
      },
    },
  },
};

// Appel API avec retries (429/5xx/529 + erreurs réseau), délai retry-after respecté.
async function callClaude(prompt) {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 16000,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  });
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, [2000, 10000][attempt - 1] || 10000));
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 180000);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body, signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) || 0;
        if (wait) await new Promise((r) => setTimeout(r, wait * 1000));
        lastErr = new Error(`HTTP ${res.status}`); continue; // retryable
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); // 4xx : définitif
      const msg = await res.json();
      if (msg.stop_reason === "refusal") throw new Error("refusal");
      if (msg.stop_reason === "max_tokens") throw new Error("max_tokens (lot trop gros)");
      const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      return JSON.parse(text); // valide par construction (json_schema)
    } catch (e) {
      lastErr = e;
      if (String(e.message).startsWith("HTTP 4")) throw e; // pas de retry sur 4xx
    }
  }
  throw lastErr;
}

async function main() {
  const events = JSON.parse(readFileSync(path.join(DOM, "events.json"), "utf8"));
  const seen = new Set(), today = [];
  for (const o of events.offers || []) {
    const k = normKey(o.name);
    if (!o.name || seen.has(k)) continue;
    seen.add(k);
    today.push({ fr: o.name, tag: o.category || "", desc: o.descriptionShort || "" });
  }
  console.log(`[translate-delta] ${today.length} événements du jour · modèle ${MODEL}`);

  let totalNew = 0;
  for (const [lang, L] of Object.entries(LANGS)) {
    const dictPath = path.join(DOM, `translations.${lang}.json`);
    if (!existsSync(dictPath)) { console.log(`  ${lang}: dictionnaire absent — sauté`); continue; }
    const dict = JSON.parse(readFileSync(dictPath, "utf8"));
    const have = new Set(Object.keys(dict).map(normKey));
    let delta = today.filter((e) => !have.has(normKey(e.fr)));
    if (!delta.length) { console.log(`  ${lang}: à jour ✓`); continue; }
    if (delta.length > MAX_DELTA) { console.log(`  ${lang}: délta ${delta.length} borné à ${MAX_DELTA}`); delta = delta.slice(0, MAX_DELTA); }

    // Le manifeste : seules ces clés (normalisées) pourront entrer au dictionnaire.
    // On garde l'entrée SOURCE complète pour pouvoir vérifier la description après coup.
    const manifest = new Map(delta.map((e) => [normKey(e.fr), e]));
    const results = new Map();
    let lots = 0, lotsKO = 0;
    for (let i = 0; i < delta.length; i += BATCH) {
      const batch = delta.slice(i, i + BATCH);
      lots++;
      try {
        // 1re passe : traduction (contenu EMBARQUÉ dans le prompt — jamais de lecture de fichier).
        const t = await callClaude(`${RULES(L)}\n\nBatch (JSON, entries {fr, tag, desc}) — translate EVERY entry, in order:\n${JSON.stringify(batch)}\n\nReturn {items:[{fr,n,d}]} for all ${batch.length} entries.`);
        // 2e passe : relecture stricte contre la source.
        const v = await callClaude(`You are a STRICT bilingual editor (French → ${L.name}). ${L.extra}\nGround truth (JSON):\n${JSON.stringify(batch)}\n\nProposed translations:\n${JSON.stringify(t.items)}\n\nFIX: translated/transliterated proper nouns → restore LATIN original; leftover French → translate; drift/inventions → correct; unnatural phrasing → smooth. Keep every "fr" verbatim. Return the FULL corrected {items:[{fr,n,d}]} in order.`);
        // Une relecture TRONQUÉE (moins d'entrées que la source) perdrait des traductions
        // valides : on retombe alors sur la 1re passe plutôt que d'accepter le lot amputé.
        const relu = Array.isArray(v.items) && v.items.length === batch.length;
        if (!relu && Array.isArray(v.items) && v.items.length) {
          console.log(`  ${lang}: lot ${lots} relecture tronquée (${v.items.length}/${batch.length}) — 1re passe conservée`);
        }
        const items = (relu ? v.items : t.items) || [];
        for (const it of items) {
          if (!it || !it.fr || !it.n || !String(it.n).trim()) continue;
          const src = manifest.get(normKey(it.fr));
          if (!src) continue; // hors manifeste → rejeté
          // Pas de description inventée quand la source est vide ; borne à 160 caractères.
          let d = typeof it.d === "string" ? it.d.trim() : "";
          if (!src.desc) d = "";
          if (d.length > 160) d = d.slice(0, 160).replace(/\s+\S*$/, "");
          results.set(src.fr, { n: it.n, ...(d ? { d } : {}) });
        }
      } catch (e) {
        // Un lot qui échoue ne doit PAS emporter les lots déjà traduits.
        lotsKO++;
        console.log(`  ${lang}: lot ${lots} en échec (${e.message}) — lot ignoré, les autres sont conservés`);
      }
    }
    if (lotsKO === lots) {
      console.log(`  ${lang}: tous les lots en échec — langue sautée, dictionnaire intact`);
      continue;
    }
    // Garde-fou : couverture < 50 % du délta = suspect → on ne touche pas.
    if (results.size < delta.length * 0.5) {
      console.log(`  ${lang}: ${results.size}/${delta.length} seulement — suspect, dictionnaire intact`);
      continue;
    }
    const avant = Object.keys(dict).length;
    for (const [canon, val] of results) dict[canon] = val; // ajout uniquement — jamais de suppression
    if (Object.keys(dict).length < avant) {
      console.log(`  ${lang}: incohérence de comptage — écriture annulée, dictionnaire intact`);
      continue;
    }
    // Écriture ATOMIQUE : un runner interrompu en plein writeFileSync laisserait
    // un JSON tronqué, et le site perdrait la langue. tmp + rename est indivisible.
    const tmp = `${dictPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(dict));
    renameSync(tmp, dictPath);
    totalNew += results.size;
    console.log(`  ${lang}: +${results.size}/${delta.length} traduits ✓`);
  }
  console.log(`[translate-delta] terminé : ${totalNew} traductions ajoutées.`);
}

main().catch((e) => {
  // Jamais fatal pour la boucle : on publie sans traductions plutôt que de casser la publication.
  console.error("[translate-delta] échec global :", e.message, "— dictionnaires intacts.");
  process.exit(0);
});
