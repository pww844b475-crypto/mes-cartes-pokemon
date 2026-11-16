# Mes cartes Pokémon

Application web installable (PWA) pour suivre sa collection de cartes Pokémon en **français**, **chinois simplifié** et **japonais**, avec les données et images de [TCGdex](https://tcgdex.dev).

- Une case « je l'ai » par carte **et par langue** ; recherche par nom/numéro ; filtre possédées / manquantes.
- Compteur « X cartes possédées sur Y » par extension ; quantité par carte (doubles) avec filtre « Doubles ».
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
