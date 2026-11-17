# Pijakollection

Application web installable (PWA) pour suivre sa collection de cartes Pokémon en **français**, **chinois simplifié** et **japonais**, avec les données et images de [TCGdex](https://tcgdex.dev).

- Interface en **français uniquement** (les onglets chinois et japonais ont été retirés ; les cases déjà cochées dans ces langues restent stockées et dans les sauvegardes).
- Les extensions du jeu en ligne (Pokémon Pocket) sont masquées. Les collections classiques (25 ans, 30 ans) et les galeries de dresseurs (swsh9 à swsh12.5) sont regroupées avec leur extension : voir `MERGE_INTO` dans `app.js`.
- Une case « je l'ai » par carte ; recherche par nom/numéro ; filtre possédées / manquantes.
- Extensions regroupées par **bloc** (série TCGdex : Méga-Évolution, Écarlate et Violet, Épée et Bouclier…), du plus récent au plus ancien, blocs repliables ; les promos d'un bloc sont à la fin du bloc ; ce qui n'a pas de bloc (POP, McDonald's, Kits du dresseur, Jumbo) est dans « Promos ».
- Toucher la photo d'une carte l'**agrandit** (haute définition) ; la rareté et une quantité **par version** (Normal, Reverse, Reverse Pokéball/Masterball, Holo, 1re Édition…) s'y règlent.
- Compteur « X/Y | P % » par extension ; quantité par carte (doubles) avec filtre « Doubles ».
- **Amis** : partage de collection par fichier ou texte, import, comparaison (4 listes) par langue et par extension — sans serveur ni compte.
- Les extensions ou cartes que TCGdex ne fournit pas (ou sans image) sont signalées dans l'interface.
- Données enregistrées sur l'appareil (`localStorage`) ; export / import JSON.
- Aucune dépendance, aucun build : fichiers statiques.

## Lancer en local
    python3 -m http.server 8000   # puis http://localhost:8000

## Mettre en ligne (GitHub Pages)
Settings → Pages → *Deploy from a branch* → branche voulue, dossier `/ (root)`.

## Fichiers
- `coverage.json` : instantané (généré le 2026-11-16) du nombre de cartes/images réellement renvoyées par l'API pour chaque extension. Il sert uniquement à afficher les badges dès la liste ; à l'ouverture d'une extension, l'état réel est relu et prime.
- `sw.js` : service worker (fonctionnement hors ligne pour l'application et les données déjà consultées).

## Stockage et formats
- `cartes.v2` : ma collection `{langue: {extension: {idCarte: quantité}}}`. L'ancien format `cartes.v1` (listes d'identifiants) est lu et migré automatiquement ; il n'est jamais supprimé.
- `cartes.friends.v1` : collections d'amis importées (uniquement sur l'appareil).
- Fichier de partage : `{app, type: "partage", version: 1, pseudo, date, owned, meta}` ; `meta` (nom + numéro) n'existe que pour la Collection Classique (`cel25cc`, `30th-c`). Texte équivalent : `PKZ1:` (compressé) ou `PKM1:` + base64.
- Sauvegarde personnelle : `{app, type: "sauvegarde", version: 2, owned}` (les versions 1 sans `type` restent importables).

## Identité visuelle
- `icons/logo-icone.png` (icône carrée pleine) et `icons/logo-transparent.png` (logo à fond transparent) sont les fichiers d'origine, non modifiés. Les icônes d'écran d'accueil (`apple-touch-icon*.png`, `icon-192/512.png`, favicons) en sont de simples réductions de `logo-icone.png`.
- Nom court : « Pijakollection » (manifeste, titre, `apple-mobile-web-app-title`).
- Écran d'ouverture (`#splash`) : au lancement uniquement, désactivable dans ⚙️ Réglages (`localStorage` `cartes.splash` = `off`). Un garde-fou le retire seul si l'application ne démarre pas.

## Données de rareté et de versions
- `data/cards/<extension>.json` : rareté et versions de chaque carte française (instantané TCGdex, ~1 Mo au total), chargés extension par extension. Une carte absente de l'instantané (nouvelle sortie) est demandée en direct à l'agrandissement.
- `data/sets-meta.json` : série et date de sortie de chaque extension (sert au regroupement par bloc et au tri) ; une extension absente est résolue en direct.
- Régénérer après de nouvelles sorties : `python3 -I tools/fetch-sets-meta.py data/sets-meta.json`, puis `python3 -I tools/fetch-card-data.py <brut>` (reprise possible, ~21 000 requêtes à rythme poli) et `python3 -I tools/compact-card-data.py <brut> data/cards`.
- Stockage d'une carte possédée : un nombre (carte à version unique, ou ancienne coche) ou un objet `{ cléDeVersion: quantité }`. La clé `_` = « version non précisée » (ancienne coche sur une carte à plusieurs versions : aucune version n'est inventée).
- Formats : sauvegarde = 3 (accepte 1 et 2), partage = 2 (accepte 1) ; un format plus récent est refusé avec un message clair.

## Scans de remplacement
- TCGdex n'a pas d'image (ou une adresse d'image qui répond 404) pour certaines cartes. Pour la **Collection Classique 30ᵉ Anniversaire** (`30th-c`, 30 cartes) et les trois **Mew R/G/B RGB** du 30ᵉ Anniversaire (`30th-R/G/B`), les scans viennent de [PokéCardex](https://www.pokecardex.com/series/30C) : `images/scans/30th-c/<n°>/high.webp` (scan d'origine, 444×620, copié tel quel) et `low.webp` (245×342, pour la grille).
- `data/scans.json` indique, pour chaque carte, son dossier d'image, son numéro imprimé et son identifiant PokéCardex. Le scan **remplace** l'image TCGdex de ces cartes uniquement ; l'application affiche leur numéro imprimé (« 4/102 », « R/RGB »), mentionne la source dans l'extension concernée, et ne contacte jamais PokéCardex à l'exécution (tout est servi par l'application).
- Les illustrations des cartes restent la propriété de leurs ayants droit (The Pokémon Company / Nintendo / Creatures / GAME FREAK) ; les scans sont celui de PokéCardex.
- `data/order.json` : vrai ordre des cartes (celui de PokéCardex) pour le 30ᵉ Anniversaire : 001 … 158 puis Mew R, G, B ; Collection Classique dans l'ordre de PokéCardex. Les extensions absentes de ce fichier gardent l'ordre de TCGdex.

## Scans embarqués (PokéCardex)
- **2 922 cartes** sans image utilisable dans TCGdex (2 941 sans adresse d'image, 15 dont l'adresse répond 404 ; Diamant & Perle, Soleil et Lune, Kits du dresseur, McDonald's, promos de bloc, galeries…) ont leur scan **dans le dépôt** : `images/scans/cards/<id de carte>.avif` (caractères spéciaux de l'id en `_XX`, ex. `exu-%3F` → `exu-_253F.avif`). `data/scans-embedded.json` liste les identifiants.
- **Compression** : les scans d'origine (WebP, déjà très bruités) pesaient 127 Mo. Ils sont ré-encodés en **AVIF 444×620, qualité 32**, une seule image par carte pour la grille et l'agrandissement : **38 Mo** (12,7 Ko en moyenne), texte des attaques resté net.
- **Appareil sans AVIF** (iOS / iPadOS antérieur à 16) : l'application le détecte et charge alors ces cartes depuis le serveur d'images de PokéCardex, grâce à `data/scans-remote.json` (`idCarte → [série PokéCardex, n° d'image]`, taille `md` en grille, `hd` à l'agrandissement). Sur un appareil récent, aucune requête n'est faite vers PokéCardex.
- Appariement vérifié : séries PokéCardex trouvées par nom + alias, cartes appariées par numéro et nom, règle « position = numéro d'image » contrôlée sur 218 pages (1 exception : Kits Raichu, numérotés 31 à 60), 2 922 adresses testées (200), ~140 cartes contrôlées visuellement ; fidélité des fichiers AVIF contrôlée carte par carte (PSNR).
- Reste sans scan : `2019sm-fr-33b` (une seule carte « Taupiqueur d'Alola » chez PokéCardex pour les n° 33 et 33b).
- Régénération : voir `tools/` (collecte TCGdex des images manquantes, appariement par série) ; le téléchargement des scans et l'encodage AVIF (Pillow) se font avec la table `data/scans-remote.json`.

## Raretés, quantités et ajout groupé

- Page d’accueil : un seul bouton « Tout déplier » / « Tout replier ».
- Dans une extension : filtre par rareté (avec effectifs), bouton 📊 (récapitulatif possédées/total par rareté, une ligne filtre), rareté colorée par palier. Les paliers sont dans `RARITY_TIER` (`app.js`).
- Pastille de version : un appui = +1 exemplaire, bouton « − » pour en retirer ; dans l’agrandissement, la quantité se saisit directement (0 à 99).
- « ➕ Ajout groupé » : ajoute, définit ou retire N exemplaires d’une version pour toutes les cartes affichées (selon recherche et filtres), avec bouton « Annuler ».

## Recherche dans toute la collection

Bouton 🔎 de l’accueil (`#chercher`) : recherche par nom ou numéro dans les 20 226 cartes, et icône « Filtres » (possession : toutes / possédées / manquantes / doubles, extension, rareté, version). Avec une version choisie, possédées/manquantes portent sur cette version. Les noms viennent de `data/names.json`, régénérable avec `python3 -I tools/fetch-card-names.py data/cards data/names.json`.
