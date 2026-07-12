# today.paris

> **Dites-nous où vous êtes, l'heure, votre budget et votre envie. On vous dit quoi faire, maintenant.**

MVP fonctionnel + **moteur de recommandation réutilisable**. Aucune dépendance externe : ça tourne avec Node seul.

> ✅ **Données RÉELLES** : les recommandations viennent du jeu de données officiel
> **« Que faire à Paris ? »** de l'[Open Data de la Ville de Paris](https://opendata.paris.fr/explore/dataset/que-faire-a-paris-/) (gratuit, sans clé d'API). Rien n'est inventé.
> Un jeu de démonstration reste disponible comme secours hors-ligne. Voir [« Les sources de données »](#les-sources-de-données).

## 🌐 Site en ligne (GitHub Pages)

**En ligne : https://today.paris** (aussi accessible via https://h2sl-bot.github.io/today-paris/)

La version en ligne est **100 % statique** : le navigateur importe le moteur, interroge
directement l'API Open Data de Paris (CORS ouvert) et calcule les recommandations côté client.
Aucun serveur n'est nécessaire pour la mise en ligne.

```bash
npm run build:web    # (re)génère le dossier docs/ servi par GitHub Pages
```

`docs/` est assemblé par `scripts/build-web.mjs` à partir des modules réels (source unique) :
`engine/`, `data/freshness.js`, l'adaptateur Open Data, la config du domaine, et `web/`.
GitHub Pages est configuré sur la branche `main`, dossier `/docs`.

**Boucle autonome (cloud).** `.github/workflows/loop.yml` (GitHub Actions) rafraîchit chaque jour
les lieux (`fetch:venues`), reconstruit le site (`build:web`) et **republie automatiquement si les
données ont changé** — sans aucune machine locale. C'est la boucle « récupère → fraîcheur → classe
→ republie → recommence » du produit, côté données. Les événements, eux, sont déjà en direct à
chaque visite. (Le script `scripts/publish.sh` fait la même chose en local, si besoin.)

> Note : en statique, la **mesure des clics côté serveur** (boucle d'amélioration) ne tourne
> pas en ligne — elle reste un outil local (`npm start` + `npm run loop`).

---

## Démarrer en 30 secondes

```bash
cd today-paris
npm start           # démarre le serveur sur http://localhost:3000
```

Ouvrez http://localhost:3000, remplissez le formulaire, obtenez 3 à 5 idées.
(Le serveur amorce automatiquement les données de démo au premier lancement — pas besoin d'autre commande.)

Autres commandes :

```bash
npm run loop         # un passage de la boucle (fraîcheur + rapport)
npm run loop:watch   # la boucle en continu, toutes les 15 min
```

---

## L'architecture (5 briques séparées et réutilisables)

Le projet est découpé exactement comme demandé, pour pouvoir resservir sur
`visitwine.com`, `lacanau.surf`, `thalassothérapie.fr`, `tourisme.luxe`…

| Brique | Dossier | Rôle | Réutilisable ? |
|---|---|---|---|
| 1. **Moteur de recommandation** | `engine/` | Filtre, score, classe, explique. Ne connaît aucun domaine. | ✅ tel quel |
| 2. **Sources de données** | `data/source.js` + `data/adapters/` | Adaptateurs interchangeables (Open Data Paris + fichier de secours). | ✅ tel quel |
| 3. **Règles de classement** | `domains/<x>/config.js` (`weights`, `moods`) | Poids et affinités par domaine. | 🎯 par domaine |
| 4. **Interface** | `public/` + `server.js` | Formulaire, résultats, mesure des clics. | ✅ tel quel |
| 5. **Config du domaine** | `domains/today.paris/` | Envies, quartiers, catégories, textes, données. | 🎯 par domaine |

**Idée clé :** pour un nouveau site, on ne réécrit **que** le dossier `domains/<site>/`.
Le moteur, la couche données, la boucle et l'interface ne bougent pas.

### Le moteur en une phrase

```
recommend({ context, candidates, config }) → { results, meta }
```

- **context** : où je suis, l'heure, mon budget, avec qui, mon envie, mon temps.
- **candidates** : les offres actives (venant des sources de données).
- **config** : les règles du domaine (poids, affinités, textes).

Il applique d'abord des **filtres durs** (ouvert maintenant, dans le budget, pas trop
loin, tient dans le temps), puis **note** chaque offre sur 7 critères pondérés, puis
**classe** en assurant la **diversité** (pas 5 fois la même chose), et génère les
**« pourquoi »** en français.

---

## La boucle automatisée

`node loop/run.js` enchaîne les 8 étapes demandées :

1. **Récupère** les nouvelles données (via les sources déclarées par le domaine)
2. **Vérifie la fraîcheur** (dates de validité, données obsolètes)
3. **Désactive** les offres expirées / à venir / obsolètes / invalides
4. **Classe** (passage de contrôle du moteur)
5. **Mesure les clics** (agrège impressions + clics réels)
6. **Repère ce qui marche** (top offres, performance par catégorie)
7. **Produit un rapport d'amélioration** (`data-store/<domaine>/reports/`)
8. **Recommence** (`--interval 15` pour boucler toutes les 15 min)

Les données produites (snapshot, clics, impressions, rapports) vont dans `data-store/`
(ignoré par git). Le rapport est lisible en Markdown **et** exploitable en JSON.

> Pour prouver que la fraîcheur fonctionne, le jeu de démo contient **exprès** 3 offres
> « à problème » : une **expirée**, une **à venir**, une **non rafraîchie**. La boucle
> les écarte automatiquement et le signale dans le rapport.

---

## Mesure des clics (le signal qui fait progresser)

- Quand le moteur montre des offres → une **impression** est journalisée.
- Quand l'utilisateur clique « Ça m'intéresse » ou un bouton de réservation → un **clic**.
- La boucle calcule le **taux de clic** par offre et par catégorie, et en tire des pistes.

C'est le carburant honnête de l'amélioration continue : pas de faux chiffres.

---

## Les sources de données

La source active est **RÉELLE** : l'adaptateur `data/adapters/opendata-paris.js`
interroge le jeu `que-faire-a-paris-` de l'Open Data de la Ville de Paris et ne garde
que les **événements du jour** géolocalisés. Il les traduit dans le schéma du moteur
(catégorie, prix, créneaux horaires précis, lien de réservation, dates de validité).

- **Gratuit, sans clé d'API.** Rien à configurer.
- Chaque événement porte `demo: false` ; aucun prix ni disponibilité n'est inventé.
- Un prix inconnu s'affiche « Payant » (jamais « Gratuit » par erreur).

**Lieux (cafés, bars, parcs) — OpenStreetMap.** `npm run fetch:venues` interroge Overpass et écrit
`domains/today.paris/venues.json` en ne gardant QUE les lieux dont les horaires `opening_hours`
sont convertibles **sûrement** (`data/opening-hours.js`, conservateur : en cas de doute, le lieu
est écarté — jamais d'horaire inventé). Le « ouvert maintenant » est recalculé en direct côté
navigateur à partir de ces vrais horaires. Les résultats sont aussi affichés sur une **carte**
(Leaflet, vendu localement dans `web/vendor/`, tuiles OpenStreetMap/CARTO). Attribution : © OpenStreetMap.

Le fichier de **démonstration** `domains/today.paris/offers.demo.json` reste un
**secours hors-ligne** : décommentez sa ligne dans `domains/today.paris/config.js`
(`sources: [...]`) si l'API est indisponible.

Pour ajouter d'autres sources réelles (billetteries, autres open data, Google Places…),
**sans toucher au moteur** : écrire un adaptateur dans `data/adapters/`, l'enregistrer
dans `data/source.js`, puis le déclarer dans `sources`. Google Places et la plupart des
billetteries nécessitent un **compte et une clé d'API** (parfois payants).

> ⏰ **Fraîcheur** : le serveur écarte les événements terminés à chaque requête, et la
> disponibilité (« en ce moment » / « à l'affiche ») est calculée en temps réel.
> Lancez la boucle régulièrement (`npm run loop:watch`, ou une tâche planifiée) pour
> récupérer chaque jour les nouveaux événements.

---

## Ajouter un nouveau domaine

```bash
cp -r domains/_template domains/visitwine.com
# renommer config.example.js -> config.js, adapter, fournir des données
DOMAIN=visitwine.com npm start
```

---

## Structure des fichiers

```
today-paris/
├── engine/        1. Moteur réutilisable (filtres, score, classement, explications)
├── data/          2. Sources de données + fraîcheur + stockage
├── domains/
│   ├── today.paris/   5. Config + données de démo de CE domaine
│   └── _template/     Modèle pour un nouveau domaine
├── loop/          Boucle automatisée (fraîcheur, métriques, rapport)
├── public/        4. Interface (HTML/CSS/JS, sans framework)
├── server.js      4. Serveur HTTP + API (sans dépendance)
└── data-store/    Données runtime (créé automatiquement, ignoré par git)
```
