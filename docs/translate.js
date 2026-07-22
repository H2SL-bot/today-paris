// domains/today.paris/translate.js
// Traduction d'AFFICHAGE (nom + description courte) des ÉVÉNEMENTS vers la langue courante.
//
// Principe d'HONNÊTETÉ : on ne traduit QUE ce qui figure dans un dictionnaire vérifié (par langue).
// Sinon on garde le texte d'origine (français) : jamais de charabia, jamais d'invention.
// Les NOMS DE LIEUX (cafés, bars…) sont des noms propres, gardés tels quels. Les noms propres
// à l'intérieur des titres d'événements restent en caractères latins (même en zh/ar).

import { UI_DATA } from "./ui-i18n.data.js";

// Descriptions-gabarits génériques des LIEUX en anglais (les autres langues via UI_DATA[lang].venueDesc).
const VENUE_DESC_EN = {
  "Un musée à visiter.": "A museum to visit.",
  "Une galerie d'art à parcourir.": "An art gallery to wander through.",
  "Une salle de cinéma.": "A cinema.",
  "Un théâtre pour un spectacle.": "A theatre for a show.",
  "Une librairie où flâner.": "A bookshop to browse.",
  "Un club pour danser.": "A club to dance in.",
  "Une salle de concert.": "A concert venue.",
  "Un café où se poser.": "A café to settle into.",
  "Un bar pour boire un verre.": "A bar for a drink.",
  "Un bar à vin pour un verre choisi.": "A wine bar for a good glass.",
  "Un restaurant pour un vrai repas.": "A restaurant for a proper meal.",
  "Une pâtisserie pour une pause sucrée.": "A pâtisserie for a sweet treat.",
  "Un marché / une épicerie fine à parcourir.": "A market / deli to browse.",
  "Un espace vert pour souffler.": "A green space to unwind.",
  "Un jardin pour une pause au calme.": "A garden for a quiet break.",
};
const VENUE_DESC_ES = {
  "Un musée à visiter.": "Un museo para visitar.",
  "Une galerie d'art à parcourir.": "Una galería de arte para recorrer.",
  "Une salle de cinéma.": "Un cine.",
  "Un théâtre pour un spectacle.": "Un teatro para ver un espectáculo.",
  "Une librairie où flâner.": "Una librería para curiosear.",
  "Un club pour danser.": "Un club para bailar.",
  "Une salle de concert.": "Una sala de conciertos.",
  "Un café où se poser.": "Un café para sentarse un rato.",
  "Un bar pour boire un verre.": "Un bar para tomar algo.",
  "Un bar à vin pour un verre choisi.": "Un bar de vinos para una buena copa.",
  "Un restaurant pour un vrai repas.": "Un restaurante para comer de verdad.",
  "Une pâtisserie pour une pause sucrée.": "Una pastelería para un capricho dulce.",
  "Un marché / une épicerie fine à parcourir.": "Un mercado o tienda gourmet para curiosear.",
  "Un espace vert pour souffler.": "Una zona verde para respirar.",
  "Un jardin pour une pause au calme.": "Un jardín para una pausa tranquila.",
};
const VENUE_DESC_IT = {
  "Un musée à visiter.": "Un museo da visitare.",
  "Une galerie d'art à parcourir.": "Una galleria d'arte da percorrere.",
  "Une salle de cinéma.": "Un cinema.",
  "Un théâtre pour un spectacle.": "Un teatro per uno spettacolo.",
  "Une librairie où flâner.": "Una libreria in cui curiosare.",
  "Un club pour danser.": "Un club per ballare.",
  "Une salle de concert.": "Una sala da concerti.",
  "Un café où se poser.": "Un caffè dove fermarsi un po'.",
  "Un bar pour boire un verre.": "Un bar per bere qualcosa.",
  "Un bar à vin pour un verre choisi.": "Un'enoteca per un buon bicchiere.",
  "Un restaurant pour un vrai repas.": "Un ristorante per un vero pasto.",
  "Une pâtisserie pour une pause sucrée.": "Una pasticceria per una pausa dolce.",
  "Un marché / une épicerie fine à parcourir.": "Un mercato o una gastronomia da esplorare.",
  "Un espace vert pour souffler.": "Uno spazio verde per respirare.",
  "Un jardin pour une pause au calme.": "Un giardino per una pausa tranquilla.",
};
// Descriptions de lieux par langue écrite à la main (les autres via UI_DATA[lang].venueDesc).
const VENUE_DESC = { en: VENUE_DESC_EN, es: VENUE_DESC_ES, it: VENUE_DESC_IT };
// Formats d'arrondissement pour les langues écrites à la main (en = ordinal spécial ; zh/ar via UI_DATA).
// it : l'usage italien garde le mot « arrondissement » pour Paris, avec l'ordinal « n° ».
const ARR_FORMAT = { es: "distrito {n}", it: "{n}° arrondissement" };

// Clé normalisée : neutralise espaces insécables/fines et apostrophes/guillemets courbes.
// Exportée : le build s'en sert pour publier exactement les entrées que le site retrouvera.
export function normKey(s) {
  return String(s == null ? "" : s)
    .replace(/[   ​]/g, " ")
    .replace(/[‘’′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Ordinal anglais : 1st, 2nd, 3rd, 4th… 11th, 21st.
function enOrdinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Localise un libellé de quartier « Nᵉ arrondissement » selon la langue :
 * en → « 11th arrondissement » ; zh → « 第11区 » ; ar → « الدائرة 11 » ; fr → inchangé.
 */
export function localizeNeighborhood(nb, lang) {
  if (lang === "fr" || !nb) return nb || "";
  const m = /^(\d{1,2})(?:ᵉ|er|e)?\s+arrondissement$/i.exec(String(nb).trim());
  if (!m) return nb; // « Paris » ou autre : inchangé
  const n = Number(m[1]);
  if (lang === "en") return `${enOrdinal(n)} arrondissement`;
  const fmt = ARR_FORMAT[lang] || (UI_DATA[lang] && UI_DATA[lang].arrondissementFormat);
  return fmt ? String(fmt).replace("{n}", n) : nb;
}

/**
 * Fabrique une fonction de traduction d'affichage pour une langue.
 * @param {object|null} dict   dictionnaire vérifié des événements de cette langue (ou null)
 * @param {string} lang        "fr" | "en" | "zh" | "ar"
 * @returns {(name:string, desc?:string) => {name:string, desc:string}}
 */
export function makeEventTranslator(dict, lang) {
  if (lang === "fr") return (name, desc = "") => ({ name, desc: desc || "" });
  const venueDesc = VENUE_DESC[lang] || (UI_DATA[lang] && UI_DATA[lang].venueDesc) || {};
  const map = new Map();
  for (const k of Object.keys(dict || {})) map.set(normKey(k), dict[k]);
  return (name, desc = "") => {
    const hit = map.get(normKey(name));
    const outName = hit ? hit.n || name : name;                       // repli : nom d'origine (FR)
    const outDesc = (hit && hit.d) || venueDesc[desc] || desc || "";  // dico → gabarit lieu → FR
    return { name: outName, desc: outDesc };
  };
}
