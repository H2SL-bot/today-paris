// domains/today.paris/translate.js
// Traduction d'AFFICHAGE (nom + description courte) des ÉVÉNEMENTS vers l'anglais.
//
// Principe d'HONNÊTETÉ (règle absolue du projet) : on ne traduit QUE ce qui figure dans
// un dictionnaire vérifié (produit hors ligne, contrôlé pour préserver les noms propres —
// groupes, artistes, salles, personnes). Si un titre n'y est pas, on garde le texte
// d'origine (français) : jamais de charabia mot-à-mot, jamais d'invention.
//
// Les NOMS DE LIEUX (cafés, bars, parcs) ne passent pas par ce dictionnaire : ce sont des
// noms propres de commerces, gardés tels quels — comme dans tout guide (« Café de Flore »
// ne se traduit pas). La catégorie, elle, est déjà affichée en anglais.
//
// Le dictionnaire a la forme : { "<titre français>": { "n": "<nom anglais>", "d": "<desc anglaise>" } }

// Normalise une clé pour que la correspondance ne dépende pas de variantes invisibles :
// espaces insécables/fines (avant « ! : ? ; » en typographie FR) et apostrophes/guillemets
// courbes, que la génération du dictionnaire a pu convertir en espace/apostrophe simples.
function normKey(s) {
  return String(s == null ? "" : s)
    .replace(/[   ​]/g, " ") // NBSP, fine insécable, fine, chasse nulle
    .replace(/[‘’′]/g, "'") // apostrophes courbes → droite
    .replace(/[“”]/g, '"') // guillemets courbes → droit
    .replace(/\s+/g, " ")
    .trim();
}

// Descriptions-gabarits génériques des LIEUX (définies par catégorie dans fetch-venues.mjs).
// Ce ne sont pas des données réelles ni des noms propres : on peut les traduire sans risque.
const VENUE_DESC_EN = {
  "Un café où se poser.": "A café to settle into.",
  "Un bar pour boire un verre.": "A bar for a drink.",
  "Un bar à vin pour un verre choisi.": "A wine bar for a good glass.",
  "Un restaurant pour un vrai repas.": "A restaurant for a proper meal.",
  "Une pâtisserie pour une pause sucrée.": "A pâtisserie for a sweet treat.",
  "Un marché / une épicerie fine à parcourir.": "A market / deli to browse.",
  "Un espace vert pour souffler.": "A green space to unwind.",
  "Un jardin pour une pause au calme.": "A garden for a quiet break.",
};

// Ordinal anglais : 1st, 2nd, 3rd, 4th… 11th, 21st.
function enOrdinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Localise un libellé de quartier. En anglais, « 11ᵉ arrondissement » → « 11th arrondissement »
 * (« arrondissement » est le terme standard en anglais ; seul l'ordinal change). Le reste inchangé.
 */
export function localizeNeighborhood(nb, lang) {
  if (lang !== "en" || !nb) return nb || "";
  const m = /^(\d{1,2})(?:ᵉ|er|e)?\s+arrondissement$/i.exec(nb.trim());
  return m ? `${enOrdinal(Number(m[1]))} arrondissement` : nb;
}

/**
 * Fabrique une fonction de traduction d'affichage.
 * @param {object|null} dict   dictionnaire vérifié des événements (ou null)
 * @param {string} lang        "fr" | "en"
 * @returns {(name:string, desc?:string) => {name:string, desc:string}}
 */
export function makeEventTranslator(dict, lang) {
  if (lang !== "en") return (name, desc = "") => ({ name, desc: desc || "" });
  const map = new Map();
  for (const k of Object.keys(dict || {})) map.set(normKey(k), dict[k]);
  return (name, desc = "") => {
    const hit = map.get(normKey(name));
    const outName = hit ? hit.n || name : name;                 // repli : nom d'origine (FR)
    const outDesc = (hit && hit.d) || VENUE_DESC_EN[desc] || desc || ""; // dico → gabarit lieu → FR
    return { name: outName, desc: outDesc };
  };
}
