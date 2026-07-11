// engine/rank.js
// Classement final + diversité (éviter 5 fois la même catégorie).

/**
 * @param {Array} scoredList  éléments { offer, score, ... }
 * @param {object} config
 * @returns {Array} liste ordonnée et diversifiée
 */
export function rankAndDiversify(scoredList, config) {
  const count = config.output?.count ?? 4;
  const maxPerCategory = config.output?.maxPerCategory ?? 2;

  const sorted = [...scoredList].sort((a, b) => b.score - a.score);

  const picked = [];
  const perCategory = new Map();

  // 1er passage : respecte le plafond par catégorie pour garantir la variété
  for (const item of sorted) {
    if (picked.length >= count) break;
    const cat = item.offer.category || "_";
    const used = perCategory.get(cat) || 0;
    if (used < maxPerCategory) {
      picked.push(item);
      perCategory.set(cat, used + 1);
    }
  }

  // 2e passage : complète si le plafond nous a laissés en dessous du quota
  if (picked.length < count) {
    for (const item of sorted) {
      if (picked.length >= count) break;
      if (!picked.includes(item)) picked.push(item);
    }
  }

  return picked;
}
