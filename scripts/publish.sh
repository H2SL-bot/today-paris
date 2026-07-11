#!/bin/zsh
# scripts/publish.sh
# Un tour complet de la boucle pour le SITE EN LIGNE :
#   1. rafraîchit les lieux (OpenStreetMap)
#   2-4 + 7. contrôle fraîcheur + rapport (loop/run.js)
#   reconstruit le site statique (docs/)
#   8. republie sur GitHub UNIQUEMENT si les données ont changé (→ GitHub Pages redéploie)
# Lancé automatiquement par l'agent launchd paris.today.loop.

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
cd "$HOME/today-paris" || exit 1

echo "===== boucle publish : $(date) ====="

npm run fetch:venues || echo "[publish] fetch:venues indisponible — on garde l'instantané précédent"
node loop/run.js --once || echo "[publish] loop KO (ignoré)"
CUSTOM_DOMAIN=today.paris npm run build:web || { echo "[publish] build KO — abandon"; exit 1; }

# On ne met en index QUE les données et le site construit (jamais de fichier workflow).
git add domains/today.paris/venues.json docs
if git diff --cached --quiet; then
  echo "[publish] aucun changement de données — rien à republier."
else
  git commit -m "boucle: rafraîchissement automatique des lieux (OpenStreetMap)"
  if git push origin main; then
    echo "[publish] site republié ✅"
  else
    echo "[publish] push KO ❌ (le commit local est prêt, sera repoussé au prochain tour)"
  fi
fi
