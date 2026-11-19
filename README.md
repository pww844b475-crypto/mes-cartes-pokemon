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

## Valeur de la collection, sélection et ajout groupé limité

- Accueil : icône ⊞/⊟ (tout déplier / replier), raccourci « Mes cartes possédées » (détail par rareté, cases à cocher pour additionner certaines raretés, › pour voir les cartes d’une rareté) et encart « Valeur estimée ».
- Prix : demandés à TCGdex (`pricing.cardmarket`, en euros, tendance ; prix « holo » pour les versions Reverse/Holo) uniquement pour les cartes possédées, mémorisés dans `cartes.prices` ; ⟳ les redemande. Ce sont les prix Cardmarket de la fiche produit, **tous vendeurs et toutes langues** : TCGdex ne fournit pas de prix « vendeur français ».
- Extension : bouton ☑︎ (mode sélection : toucher une photo sélectionne la carte) et, dans « Ajout groupé », option « Seulement les N premières » (dans l’ordre affiché, par ex. 50 cartes d’une rareté).
- À chaque lancement de l’application (une fois par session), une question propose d’actualiser les prix (« Mettre à jour » / « Plus tard »), avec la date du dernier relevé ; seuls les prix manquants sont relevés sans demander.
- Ajout groupé › « Choisir les cartes d’une rareté… » : on choisit une rareté, on coche soi-même les cartes (ex. 25 « Illustration spéciale rare »), puis on indique version, action et quantité ; seules les cartes cochées sont modifiées.
- La valeur de la collection estime **toutes les raretés** par défaut. L'option « Estimer seulement les cartes de valeur » (palier « secrète » : Illustration rare, Illustration spéciale rare, Hyper rare…), dans « Mes cartes possédées », limite les requêtes à ces cartes ; les autres sont alors « non estimées ».
- Prix sur chaque carte de valeur dans la grille (« ≈ 12,50 € », relevé en arrière-plan) et, dans l'agrandissement de n'importe quelle carte, prix Cardmarket normal / reverse-holo + liens « Ventes terminées sur eBay.fr » (recherche pré-remplie, ouverte par l'utilisateur dans son navigateur) et Cardmarket. L'application ne lit pas eBay elle-même.
- Lien eBay.fr simplifié : nom + numéro de la carte, filtres « vendues » et « terminées ». Dans l'agrandissement, un champ pour noter la dernière vente réussie (relevée à la main) : elle est combinée à celle de Cardmarket pour le prix affiché et pour la valeur de la collection ; mémorisées dans `cartes.ebay` et ajoutées à la sauvegarde (champ facultatif `ebay`).

## Scan d'une carte (📷 dans la recherche)

Bouton « 📷 Scanner » de la page de recherche : on prend la carte en photo, le nom et le numéro imprimé sont lus **dans l'appareil** (Tesseract.js, dossier `vendor/tesseract/`, chargé à la première utilisation ; la photo n'est envoyée nulle part), puis les cartes correspondantes de `data/names.json` s'affichent avec leur prix. Ordre : nom + numéro + total de l'extension d'abord, sinon toutes les éditions du nom, de l'extension la plus récente à la plus ancienne. Si plusieurs cartes ressortent, on choisit à l'image. La fiabilité dépend de la photo (de face, bien éclairée, texte net) : le numéro imprimé, petit, est le plus difficile à lire.
- Liens eBay.fr et Cardmarket : filtres « vendeur en France » (`LH_PrefLoc=1`) et, pour Cardmarket, vendeur France / français / Near Mint (`sellerCountry=12&language=2&minCondition=2`) ; ouverts par l'utilisateur, pas par l'application.
- Lien Cardmarket : fiche exacte de la carte, `…/fr/Pokemon/Products/Singles/<Extension-en-anglais>/<Nom-en-anglais>-<ABRÉVIATION><numéro>?language=2&sellerCountry=12&minCondition=2` (ex. `30th-Celebration/Pikachu-30C034`). Nom anglais demandé à TCGdex (`/en/cards/<id>`), abréviation depuis `data/sets-meta.json`, adresse mémorisée dans `cartes.cmslug3` ; repli sur la recherche par nom si elle ne peut pas être construite. Règles déduites d'adresses réelles fournies par l'utilisateur :
  - cartes du même nom dans l'extension : `-V1`, `-V2`… ; les cartes « H » passent avant les cartes numérotées (`Aquapolis/Umbreon-V1-AQH29`, la carte numérotée du même nom est `-V2`) ; série e-Card : numéro imprimé sans zéro (`Ampharos-V1-AQH1`, pas `AQH01`) ;
  - Zarbi : `EX-Unseen-Forces/Unown-A-UFA-28` (extension principale, nom-lettre-ABRÉVIATION+lettre-total) ; les extensions de la série EX sont préfixées « EX » ; les Zarbi `?` et `!` n'ont pas d'adresse connue (recherche).
  Cloudflare bloque la vérification automatique : les autres cas particuliers ne sont pas vérifiés.

## Accueil en tuiles et fiche d'extension

- Accueil : menu de tuiles (Mes cartes, Scanner, Statistiques, Rechercher, Amis, Sauvegarde, Réglages), encart de valeur, titre « Collection » avec l'icône déplier/replier et la bascule Liste / Grille des extensions (mémorisée).
- Statistiques : cartes possédées / total, exemplaires, doubles, extensions complètes, valeur estimée, avancement par bloc.
- Fiche d'extension : en-tête (logo, date de sortie, abréviation, avancement) avec le détail par rareté (touchez une rareté pour filtrer), et onglets Cartes (grandes images) / Liste (une ligne par carte) / Grille (par défaut), mémorisés.
- Pas encore repris de la maquette de référence : barre de navigation du bas, Pokédex, Illustrateurs, Produits, cartes gradées, tri, favoris.
- Scan depuis la première page : la tuile « Scanner » ouvre directement l'appareil photo ; la photo est analysée à l'ouverture de la recherche. Résultat : le prix de chaque carte candidate s'affiche tout seul (une requête par candidate, 40 au plus) ; si une seule carte est reconnue, elle s'ouvre directement avec son prix et ses liens.
- Dans l'agrandissement de toute carte (donc après un scan) : bouton « ➕ Ajouter à ma collection » (un exemplaire ; première version si la carte en a plusieurs, ajustable juste dessous), remplacé par « ✓ Dans ma collection : N exemplaires » une fois ajoutée.
- Logo de l'accueil : `icons/logo-banner.webp` (bandeau « Pijakollection » fourni par l'utilisateur, 1000 px, 24 Ko) à la place du titre en texte ; le texte reste présent pour les lecteurs d'écran.

## Prix par version, numéros par groupe (H01/H32, TG07/TG30…)

- Prix Cardmarket (TCGdex) : « tendance » = tirage normal de la carte (y compris une carte **Holo**) ; « tendance holo » = tirage **Reverse**. Une version Reverse est donc valorisée au prix reverse, toute autre version (Normal, Holo…) au prix normal. (Avant, les versions Holo étaient à tort valorisées au prix reverse.)
- Numérotation par groupe : une carte « H01 » fait partie des « H » (affichée `#H01/H32`), pas des 147 cartes numérotées d'Aquapolis ; idem TG, GG, SV… Le scan lit « H01/H32 » et ne le confond plus avec « 01/147 » ; les « V1 / V2 » des adresses Cardmarket ne comptent que les cartes du même groupe de numéros.
- Zarbi d'EX Forces Cachées (set TCGdex « Collection Zarbi », `exu`, 28 cartes `!`, `?`, `A` à `Z`) : rattachés à EX Forces Cachées comme partie à part (comme la Collection Classique des 30 ans) ; numéros affichés `A/28`, `?/28` (le « %3F » de TCGdex est décodé) ; le scan lit « A/28 » / « ?/28 ». Les anciennes cartes cochées restent enregistrées sous `exu`.

## Adresses Cardmarket : sûres, déduites, à vérifier

- `data/cm-links.json` : adresses calculées des 27 cartes de la Collection Classique des 30 ans (`30th-Celebration/Mew-VMAX-30CFST-114` : code `30C` + abréviation de l'extension d'origine + numéro d'origine, retrouvés grâce au numéro imprimé dans `data/scans.json`). 3 cartes sans correspondance unique n'ont pas d'adresse (recherche).
- Extensions confirmées par des liens réels (`CM_VERIFIED` dans `app.js`) : 30th, Aquapolis, EX Forces Cachées (+ Zarbi). Pour les autres cas sensibles (partie d'une autre extension, promos, numéros à lettres, série EX, signe dans le nom), l'adresse est construite mais marquée « Adresse déduite, non vérifiée » dans l'agrandissement.
- `docs/liens-cardmarket-a-verifier.md` : liste des 87 extensions concernées, avec une carte d'exemple et l'adresse construite, pour vérification par clic.
- Quand un lien est confirmé : ajouter l'identifiant de l'extension à `CM_VERIFIED`.

## Scan : améliorations

Lecture supplémentaire de la bande du haut (nom) à deux hauteurs, agrandie, et tolérance aux petites erreurs de lecture (une ou deux lettres) quand aucun nom exact n'est trouvé. Sur 24 scans du dépôt : carte retrouvée parmi les candidats 19 fois sur 24 (17 avant), plus aucune photo « non reconnue » (3 avant).
- Coffres Étincelants rattachés à leur extension (comme les Galeries de Dresseurs et la Collection Classique) : « Destinées Occultes Coffre Étincelant » (`sma`) → Destinées Occultes (`sm115`), « Destinées Radieuses Coffre Étincelant » (`swsh4.5sv`) → Destinées Radieuses (`swsh4.5`) ; PokéCardex regroupe aussi `sma` avec `sm115`. La liste compte 178 extensions. Les cartes cochées restent enregistrées sous l'ancien identifiant, les anciens liens redirigent. Cartes « RC » de Générations : déjà dans l'extension `g1` (117 cartes dont RC1–RC32) ; la « Collection Radieuse » de Trésors Légendaires (`rc`, 25 cartes) n'existe pas en français chez TCGdex.
- Cartes à lettres (RC de Générations, TG, SV, H…) : ordre naturel RC1, RC2 … RC10 au lieu de l'ordre de TCGdex (RC1, RC10, RC11…) ; les cartes à numéro simple et l'ordre des groupes ne changent pas. Les RC sont dans l'extension Générations (`g1`, 117 cartes dont RC1–RC32).

## Écran de chargement animé et extension vide masquée

- Vidéo de chargement fournie par l'utilisateur (Lépidonille en vol, « Chargement… ») : `images/loading.mp4` (520×386, 350 Ko, muette, en boucle, lecture intégrée) + image de départ `images/loading-poster.webp`. Elle s'affiche **seulement si l'attente dépasse ~0,45 s** (liste des extensions, cartes d'une extension, préparation de la recherche, analyse d'une photo, **mise à jour des prix**), reste au moins 1 s, avec le détail sous l'animation (ex. « Mise à jour des prix · 3/8 ») et un bouton « Continuer sans attendre ». Elle est téléchargée en arrière-plan 2,5 s après le démarrage ; `prefers-reduced-motion` : image fixe. La vidéo n'est pas gérée par le service worker (requêtes « Range » d'iOS) : elle demande une connexion au premier affichage.
- Règle : une extension sans aucune carte en français n'est pas affichée (`HIDDEN_SETS`) : « Radiant Collection » (`rc`, 25 cartes annoncées ; les cartes RC1–RC32 sont dans Générations), « W Promotional » (`wp`, 7) et « Cartes Jumbo » (`jumbo`, 160). Liste à tenir à jour : une extension de TCGdex absente de `data/cards/` et dont `/fr/sets/<id>` renvoie `cards: []`.

## Recherche universelle de l'accueil

- La barre de recherche de l'accueil est à côté du logo (sous le logo sur un petit écran) : « Extension, Pokémon, carte, numéro… ». Elle filtre les extensions **et** propose les cartes qui existent en français (nom ou numéro, plusieurs mots possibles : « pikachu 25 »), les 8 premières avec leur numéro et leur extension, et un bouton vers la page de recherche complète (`#chercher/q/<texte>`) avec images, prix et ajout. L'index des cartes (`data/names.json`) n'est chargé qu'à la première frappe.
- Animation de chargement : la vidéo est réencodée avec un fond blanc pur (qualité x264 plus élevée) et un léger `filter: brightness(1.04)` à l'affichage, pour supprimer les traînées grises très pâles sous le texte « Chargement » qui venaient de la compression.

## Carrousels des cartes les plus chères et graphique de la valeur

- **Accueil** : carrousel « Mes cartes les plus chères » (**20 cartes** possédées, de la plus chère à la moins chère, prix Cardmarket estimé dans une pastille bleue) qui **défile tout seul en boucle** (animation CSS d'environ 50 px/s ; la bande contient les cartes deux fois et glisse de la moitié de sa largeur ; pause quand on pose un doigt ou la souris ; immobile avec le réglage « réduire les animations » ; au moins 5 cartes pour défiler) + « Voir tout » (`#chercher/top` : mes cartes triées par prix). Toucher une carte ouvre son extension. Le prix d'une carte est celui de la version possédée la plus chère (prix eBay saisi combiné s'il existe).
- **Recherche et « Mes cartes possédées »** : le même carrousel (« Les plus chères » / « Mes cartes les plus chères ») s'affiche au-dessus des résultats, avec les prix connus ; les prix manquants des cartes de valeur (ou de toutes les cartes possédées / du scan) sont relevés en arrière-plan. Bouton « ↓ Prix » pour trier les résultats par prix décroissant.
- **Statistiques** : panneau « VALEUR TOTALE » (montant, variation sur la période, périodes 1S · 1M · 3M · 1A · Max, courbe avec graduations en €). Historique : un relevé par jour (`cartes.valuehist`), enregistré à la fin de chaque calcul de prix complet ; la courbe se construit au fil des jours (pas d'historique avant la mise en service). Pas d'onglets « Cartes / Objets » : l'application ne gère que des cartes.

## Carrousel en éventail (cartes possédées) et écrans larges / iPhone pliable

- **Cartes possédées** (tuile « Mes cartes » › « Voir toutes mes cartes », « Voir tout » du carrousel de l'accueil, filtre « Possédées » de la recherche) : carrousel en éventail — la carte du centre est grande, la précédente et la suivante se devinent de chaque côté (inclinées, plus sombres, plus petites) ; défilement tactile avec accroche sur chaque carte, toucher une carte voisine la ramène au centre, toucher celle du centre ouvre l'agrandissement (navigation entre les 80 premières), flèches du clavier ; légende (nom, numéro, extension) et compteur « 5 / 12 », prix estimé sur chaque carte. Les recherches générales gardent la bande plate de 10 cartes.
- **iPhone pliable (« iPhone Duo », 5,4″ extérieur / 7,6″ intérieur)** : WebKit annonce pour Safari 27.1 des fenêtres de 382 à 951 px de large (extérieur portrait 382×580, extérieur paysage 594×368, intérieur portrait 669×867, intérieur paysage 951×585, deux fenêtres côte à côte 385×571). Toutes les pages (accueil, extension, 30 ans, mes cartes, recherche, amis) sont testées à ces tailles : aucun débordement, en-tête et contenu pleine largeur ; accueil à 7 tuiles sur une ligne en paysage. Les marges système (barre d'état, caméra, colonne de commandes) sont gérées **côté par côté** (`--safe-t/r/b/l`, variables reprises partout : en-tête, contenu, fenêtres, agrandissement, chargement) et le fond de la page est peint jusque sous ces zones. Une éventuelle bande noire imposée par le système à une application installée sur l'écran d'accueil (mode de compatibilité) ne dépend pas du code de la page.

## Écrans courts (écran extérieur de l'iPhone pliable) et autres téléphones

L'application ne cherche pas à reconnaître le modèle d'iPhone (une page web ne peut pas le savoir de façon fiable) : elle s'adapte en continu à la **taille réelle de la fenêtre** et aux zones système (`env(safe-area-inset-*)`, traitées côté par côté).

- `max-height: 620px` (écran extérieur du Duo, iPhone SE en paysage…) : en-tête compact qui se retire quand on descend et revient quand on remonte, éventail et carrousel réduits.
- `max-height: 460px` en paysage (extérieur du Duo tourné, 594×368) : fiche carte en deux colonnes, titre et recherche sur une ligne.
- Test : `e2e31` balaie 11 fenêtres (iPhone SE → Pro Max, iPad mini, Duo extérieur/intérieur, portrait et paysage) sur 4 pages : pas de débordement horizontal, en-tête ≤ 60 % de la hauteur, aucun « null/undefined/NaN » affiché.
- Ces vérifications sont faites en fenêtres simulées, pas sur un vrai appareil pliable.

## Mes cartes direct, éventail partout, ouverture de booster

- La tuile **Mes cartes** ouvre directement toutes les cartes possédées (`#chercher/own`). L'ancienne fenêtre « par rareté » et l'option « estimer seulement les cartes de valeur » restent accessibles depuis **Statistiques › Mes cartes par rareté et estimation**.
- Toute liste de cartes de la page de recherche s'affiche en **éventail** (80 premières). La carte du centre est parfaitement droite (zone morte de l'inclinaison) ; la toucher l'agrandit, **retoucher l'image referme** l'agrandissement. Le carrousel de l'accueil est inchangé.
- **Statistiques › Ouverture de booster** : choix de l'extension, nombre de boosters, hits par rareté (raretés de l'extension). Le pull rate (hits ÷ boosters, en % et « 1 tous les X boosters ») se cumule par extension ; chaque ouverture est listée et supprimable. Données dans `cartes.boosters` (appareil seulement, pas encore incluses dans la sauvegarde/export).
- Page « Mes cartes » : **boutons de rareté** directement sous la recherche (Toutes + une par rareté possédée, avec pictogramme ● ◆ ★, étoiles dorées pour les illustrations, nombre de cartes). Un toucher n'affiche que cette rareté, retoucher revient à toutes. Le bouton « Filtres » est masqué sur cette page.
- **Pictogrammes de rareté** en SVG (`rarityIcon` / `rarityKind`) d'après la planche fournie : ● commune, ◆ peu commune, ★ rare, ☆ holo, étoile dorée (illustration rare), petite étoile dorée (« Rare secrète » : rares secrètes/rainbow, nommées « Magnifique rare » par TCGdex), logo « M » officiel fourni, `images/rarity/amazing.webp` (les 9 vraies Magnifiques rares d'Épée et Bouclier, rareté TCGdex « Magnifique »), étoile dorée creuse (shiny rare), 2 étoiles dorées creuses (chromatique ultra rare), 2 étoiles dorées (illustration spéciale), 3 étoiles dorées (hyper rare), 2 étoiles noires (double rare), 2 argentées (ultra rare), étoile arc-en-ciel (Futuristic Rare), 2 étoiles rose et verte (Mega Attack Rare), trois ronds RVB (RGB Rare), « PROMO », trait (sans rareté). Le rattachement nom → symbole est à ajuster dans `rarityKind`.
- **Logos d'extension manquants** dans TCGdex (Règne Delta, Set de Base, EV Énergie, Méga Énergie, 30 ans…) : copies locales réduites dans `images/set-logos/` (source : pokecardex.com), liste `LOCAL_LOGOS`.
- La tuile « Rechercher » est retirée de l'accueil : la barre du haut cherche partout (menu : 6 tuiles).

## Prix corrigés (Règne Delta)
TCGdex rattache toutes les versions d'un même Pokémon de **Règne Delta (me06)** à un seul produit Cardmarket (celui de la première version) : une Illustration spéciale rare héritait du prix de la Double rare (ex. Méga‑Rayquaza‑ex : 3,32 € au lieu de ~295 €). `tools/fetch-cm-prices.py` lit les fichiers publics de Cardmarket (liste des produits + guide des prix, toutes langues), associe le N‑ième produit à la N‑ième carte (noms contrôlés) et écrit `data/price-fix.json`. L'application utilise ce fichier à la place de l'API pour ces cartes, et remplace tout de suite les anciens prix erronés déjà mémorisés. **Relevé du jour de la génération** : à relancer (`python3 tools/fetch-cm-prices.py`) pour rafraîchir ; d'autres extensions peuvent être ajoutées dans `FIX` si elles présentent le même défaut (contrôle fait sur me01‑me05 et sv05‑sv10 : seule me06 est touchée).

## Liens Cardmarket : règles tirées des liens réels (Épée et Bouclier)
- 13 liens fournis par l'utilisateur sont enregistrés tels quels dans `data/cm-links.json` (Rebel Clash, Shining Fates, Chilling Reign, Evolving Skies, Celebrations).
- Règles déduites (extension de la série `swsh` seulement) : carte au **nom unique** dans l'extension → `…/Dhelmise-VMAX` (sans numéro, confirmé : `…/Eternatus-VMAX` s'ouvre) ; **dernière de 3 versions ou plus** → `…-V3` sans numéro ; autres versions → `…-V1-CHR097`. Un test réel a montré que `…/Galarian-Moltres-V-V1` (sans numéro) et `…/Galarian-Perrserker-V2` ne s'ouvrent pas.
- Cas non expliqués : `Flareon-VMAX-V1-EVS018` (carte unique chez TCGdex mais V1 chez Cardmarket) et `Galarian-Perrserker-RCL205` (même nom que la n° 127 mais autre carte, sans V).
- La fiche d'une carte propose toujours un second lien **« ou recherche Cardmarket »**, valable quand l'adresse directe échoue.
- Cardmarket bloque les robots : aucune vérification automatique des pages n'est possible.
- Test réel (utilisateur) : `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=<n>` ouvre la bonne carte dans la bonne extension, mais parfois **une autre version** (ex. produit 458033 → Galarian Perrserker n° 127 au lieu de la n° 205) ; les formes `Singles?idProduct=` et `…/<Extension>?idProduct=` ne fonctionnent pas. Ce lien sert de **second lien de repli** (« ou page de la carte (choisir la version) ») quand le numéro de produit est connu ; sinon recherche.

## Liens Cardmarket : adresses exactes relevées (data/cm)
- `tools/fetch-cm-slugs.py` lit les **redirections publiques de pokemontcg.io** (`prices.pokemontcg.io/cardmarket/<id>` → 302 vers la page Cardmarket du produit) : on ne lit que l'en-tête de redirection, aucune requête vers cardmarket.com. Résultat : `data/cm/<extension>.json` (`{ s: extension, n: { numéro: fin d'adresse } }`), chargé à la demande par `ensureCmSlug`. Reprise possible (`CM_RETRY=1` retente les erreurs passagères du service).
- Couverture : **~17 800 cartes sur ~19 400** (extensions des séries Base à Écarlate et Violet). Les liens réels fournis par l'utilisateur (Rebel Clash, Shining Fates, Chilling Reign, Evolving Skies, Celebrations) sont **identiques** à ceux relevés (test e2e34).
- Non couvertes (le service ne les connaît pas) : Méga-Évolution (me01 à me06, MEP), Évolutions Prismatiques (sv08.5), quelques promos ; elles gardent un calcul de secours **signalé « non vérifié »** avec le second lien (« page de la carte »). Précision de ce calcul sur les extensions relevées : ~86 % pour Écarlate et Violet, 32 % pour Épée et Bouclier : les règles de numéro/version varient carte par carte chez Cardmarket, d'où l'intérêt des adresses relevées.
- À relancer de temps en temps pour les nouvelles sorties (`python3 tools/fetch-cm-slugs.py me06`, etc.) si le service les connaît.
- Si Cardmarket répond « Please login to continue » pour **tous** les liens (même sur sa page d'accueil depuis d'autres applications), c'est un blocage de l'adresse IP de l'utilisateur côté Cardmarket (constaté le 18/11/2026), pas un défaut des adresses : changer de réseau ou attendre. Les filtres vendeur France / Near Mint sont conservés.
- 30 ans, trois Mew **R / G / B** : lien réel fourni pour le G : `30th-Celebration/Mew-V2-30CGRGB` (code = `30C` + lettre + `RGB`). R : `Mew-V1-30CRRGB` (lien réel fourni) ; B (V3) déduit dans l'ordre R, G, B, **non confirmé** (adresse marquée « non vérifiée »).
- 30 ans, cartes numérotées du set principal : `…/30th-Celebration/<Nom>-30C<n° sur 3 chiffres>` **sans V1/V2** (liens réels : `Exeggcute-30C001`, `Pikachu-30C040` parmi 30 Pikachu) ; le V n'existe que pour les Mew R/G/B.
- La fiche d'une carte a un bouton **« 📋 Copier »** qui copie l'adresse Cardmarket exacte (à coller dans Safari ou une autre application, utile quand la fenêtre intégrée de l'application n'a pas la connexion Cardmarket).

## Cardmarket mis de côté, éventail sur les extensions, boosters en graphique
- Les **liens Cardmarket** (direct, « Copier », repli) sont retirés de la fiche d'une carte pour l'instant (connexion exigée côté Cardmarket) ; l'estimation de prix, le lien eBay et la saisie du prix eBay restent. Interrupteur caché : `localStorage['cartes.cmLinks'] = '1'` les remet (code et données `data/cm` conservés).
- **Pages d'extension** : vue « Éventail » par défaut (cartes possédées ou non), avec les filtres Toutes / Possédées / Manquantes / Doubles, la rareté et la recherche ; Cartes / Liste / Grille restent en option (clé `cartes.view2`).
- **Ouverture de booster** : compteurs − / + (boosters, hits par rareté, sans Commune ni Peu Commune), chaque ouverture s'ajoute à la même extension ; statistiques cumulées en **graphique à barres par rareté** (pull rate, « 1 tous les X boosters »), indicateurs (boosters, hits, hits/booster) et historique supprimable.

## Scanner : meilleure carte ouverte tout de suite, classement visuel
- Après l'analyse de la photo (nom + numéro imprimé), la **meilleure correspondance s'ouvre immédiatement avec son prix** ; les autres candidats se parcourent avec ‹ › dans la fiche (les prix des 3 premières sont demandés en parallèle).
- **Classement visuel** (`rerankVisual`) : beaucoup de cartes portent le même nom, et le numéro n'est pas toujours lisible. Les candidats (jusqu'à 100) sont donc classés par ressemblance de leur illustration (image TCGdex basse définition) avec la zone centrale de la photo : grille de couleurs 6×6 + histogramme de teintes, 3 cadrages. Les cartes dont le numéro correspond gardent un bonus. Sans réseau ou image illisible, l'ordre du texte est conservé.
- Mesure sur 24 photos de test synthétiques (cartes réelles + bruit, 3 passes d'OCR) : carte en première position **4/24 → 20/24** ; non retrouvées : 3 cartes dont le nom n'est pas lu (Dresseur, Énergie, Méga-Mélodelfe) et 1 cas d'identifiant particulier. Les photos réelles (reflets, perspective) peuvent donner de moins bons résultats : cadrer la carte bien en face, remplissant l'écran.
- **Détection de la carte dans la photo** (`detectCardBox`) : recherche du rectangle 63×88 dont le contour est le plus net (gradient de l'image réduite, d'abord grossier puis affiné ; contrôle sur 41 photos synthétiques sur fond bois : cadre correct dans ~93 % des cas). La carte repérée est lue par bandes (nom en haut ; numéro, total et **extension imprimée** en bas) : lecture bien plus rapide (~1,5 s au lieu de ~7 s) et plus fiable que la photo entière, qui reste le repli quand le résultat n'est pas sûr.
- **Numéro + total + extension** : toute carte dont le numéro ET le total (nombre de cartes de l'extension) correspondent est candidate même si le nom n'est pas lu ; l'abréviation d'extension imprimée (« 30C », « SSP »…) renforce l'extension. Test avec une vraie photo (Marill 067/128, 30 ans) : une seule carte candidate, en première position (e2e36).
- **Lecture du numéro avec chiffres autorisés** : en bas de la carte, le numéro est lu avec une liste fermée (`0123456789/`) à plusieurs échelles jusqu'à obtenir une paire « n/total » plausible (c'est ce qui rend « 067/128 » ou « 055/217 » lisibles) ; le nom en haut avec les bandes en mode bloc de texte. Cadre : détection par contraste du contour avec un extérieur qui ressemble au fond (≈ 1 s) ; quand le résultat n'est pas sûr, on repart de la photo entière (ancienne méthode).
- Tests avec **deux vraies photos** : Marill 067/128 (30 ans, e2e36) et Pikachu 055/217 (Héros Transcendants, e2e37) sur table en bois : 1 à 2 candidats, la bonne carte en tête, ~2–4 s de lecture.

## Scanner v3 : plusieurs critères, plus de calcul, empreintes visuelles précalculées
- **Lecture en tentatives successives** (`ocrPhoto`), arrêt dès qu'un résultat est sûr : (1) carte repérée (détection du rectangle 63×88 avec recherche d'angle, ≈ 1,5 s) et bandes lues telles quelles ; (2) mêmes bandes en niveaux de gris contrastés ; (3) cadre décalé ; (4) bandes de la photo entière sans repérage (chiffres seuls en bas, nom en haut) ; (5) lecture classique de la photo entière. Le texte de toutes les tentatives est cumulé : le nom lu dans l'une et le numéro lu dans l'autre se complètent.
- **Critères combinés** (`matchScan`) : nom (exact, sans suffixe, approché), numéro, total de l'extension, abréviation d'extension imprimée (« 30C », « ASC »…), numéro en bas à gauche ou à droite (la bande couvre toute la largeur) ; une carte retrouvée par le seul couple numéro/total ne passe jamais devant un nom lu.
- **Empreintes visuelles précalculées** : `data/vis.bin` (20 226 cartes × 120 octets = 2,4 Mo, outil `tools/build-vis.py`) = grille de couleurs 6×6 de l'illustration + histogramme de teintes. Au scan, plus aucune image à télécharger (le serveur d'images TCGdex envoie son en-tête CORS en double, ce qui empêche de lire ses images dans le navigateur) : les candidats sont classés par ressemblance instantanément, et, quand la lecture n'est pas sûre, une **recherche visuelle dans toutes les cartes** peut proposer la carte en tête (seuil de ressemblance 0,8).
- Mesures : 3 vraies photos (Marill 067/128 sur bois, Pikachu 055/217 sur bois, Pikachu et Zekrom-GX 33/181 sur tissu à motifs) : 3/3 en première position ; 24 variantes de ces photos (rotations ±3/±6°, sombre, clair, flou, loin, reflet, basse résolution, cisaillement) : 23/24. Les photos très floues (chiffres illisibles) restent difficiles.

## Scanner en direct (appareil photo ouvert)
- La tuile **Scanner** et le bouton « 📷 Scanner » ouvrent l'appareil photo (`getUserMedia`, caméra arrière) avec un **cadre** (proportions 63×88) et un trait qui balaye : on place la carte dans le cadre, des images sont lues en continu (nom, numéro, total, extension) et la fiche s'affiche dès qu'une carte est trouvée. Les lectures des 5 dernières images se cumulent ; le texte lu s'affiche en haut (« Lu : … ») ; « 📁 Photo » reste disponible, et le scan d'une photo existante aussi.
- Une lecture n'est acceptée que si la **même carte ressort sur deux images de suite**, avec numéro ET total qui correspondent (ou total à un chiffre près avec le nom) ; sinon, recherche visuelle (`data/vis.bin`) acceptée seulement si la même carte revient deux fois avec une ressemblance ≥ 0,85.
- Photos : chargées par une balise `<img>` (orientation EXIF respectée), essai à 90° / −90° si rien n'est lu ; traitement du contraste fait pixel par pixel (`enhance`, Safari ne gère pas `ctx.filter`) et appliqué dès la première tentative ; la ligne « Lecture : … » sous la barre de recherche montre ce qui a été lu (utile pour comprendre un échec).
- Réglages : la **version de l'application** s'affiche (si elle n'augmente pas après une mise à jour, fermer complètement l'application et la rouvrir deux fois).
- Tests : 3 vraies photos 3/3, 24 variantes 23/24 (lecture moyenne 4 s) ; scan en direct simulé avec une caméra factice : 1/3 (vidéo de test en basse définition : carte de 448 px de large au lieu de ~850 px sur un vrai iPhone), sans fausse carte acceptée.

## Scanner : reconnaissance par l'illustration d'abord
- **Image avant texte** : l'illustration du cadre (ou de la carte repérée dans une photo) est comparée aux empreintes de `data/vis.bin` (20 226 cartes, y compris les cartes sans image TCGdex grâce aux scans embarqués : Collection Classique des 30 ans, séries DP, SM…, `python3 tools/build-vis.py --fill-local`). Simulation sur 150 cartes : bonne carte en tête 147 fois, bon nom 150 fois ; les 30 cartes de la Collection Classique : 30/30 (le « 30 » fait partie de l'image).
- **Jugement** (`judgeVisual`) : carte identifiée si la ressemblance ≥ 0,70 (0,72 pour une photo) avec une marge ≥ 0,04 sur la suivante (ou ≥ 0,88). Les cartes quasi identiques (même illustration, autres extensions) forment une « famille » : seulement dans ce cas, le numéro est lu (3 lectures au plus) pour choisir l'édition. En direct, la carte doit rester en tête sur 3 images de suite (~1 s).
- **Batterie et mémoire** : ~3 images par seconde ; plus de lecture de texte en continu ; images de 480 px ; canevas libérés après usage ; le lecteur de texte est arrêté 20 s après la dernière lecture ; arrêt automatique après 30 s sans résultat ; **caméra relancée automatiquement** si le flux s'interrompt (écran noir constaté sur iPhone), au retour dans l'application, ou si l'image reste noire ~2 s.
- Test : 24 variantes de 2 vraies photos : 24/24 en tête, ~3 s en moyenne (≈ 1,4 s quand l'illustration suffit) ; scan en direct avec caméra factice : Marill 3,4 s, Pikachu 2,5 s.

## Logos, carrousel, images tronquées, ajout rapide, « Rare Holo »
- **Logos** : `swsh3` (logo TCGdex à fond blanc opaque) et `me05` (introuvable) utilisent une copie locale dans `images/set-logos/` (liste `LOGO_OVERRIDE` dans `app.js`).
- **Carrousel de l'accueil** : il n'est plus reconstruit quand les prix arrivent sans changer (signature des cartes + prix) ; s'il change vraiment, l'animation reprend à la même position, sans saut.
- **Images TCGdex tronquées** (moitié basse noire/blanche, ex. Aquapolis H21 Cizayox, ecard2-132) : TCGdex n'a aucune version complète (ni langue, ni png/jpg). Ces cartes sont ajoutées à `data/scans-remote.json` pour charger le scan PokéCardex, comme les cartes sans image. Détection : voir le script de balayage décrit dans la PR (bas d'image uni).
- **⚡ Ajout rapide** (à côté de ☑︎ et « Ajout groupé ») : une fois activé, un toucher bref sur une carte (Éventail, Cartes, Liste, Grille) en ajoute un exemplaire (1re version si plusieurs) ; un appui long (≥ 450 ms) ouvre la fiche (prix, eBay…).
- **Rare Holo** : TCGdex nomme « Rare » les rares holo et non-holo des séries anciennes ; `loadCardInfo` déduit « Rare Holo » quand toutes les versions sont holo (filtres, avancement, icônes).

## Estimation : prix propre à chaque version
Avant, une carte n'avait qu'un prix (celui de la première fiche Cardmarket) : une 1re Édition ou une « sans ombre » était comptée au prix de l'illimité (ex. Alakazam base1 : 59,64 € au lieu de 341,73 € en 1re Édition). `fetchPrice` lit maintenant `variants_detailed[].pricing.cardmarket` de TCGdex et mémorise un prix par version (5e élément de `priceCache`) ; `cmUnit` l'utilise. Une version sans tampon rattachée par TCGdex au même produit que la 1re Édition garde le prix de base (non fiable autrement). Les anciens relevés sont redemandés une fois.
