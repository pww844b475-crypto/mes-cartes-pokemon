# Génération d'images et de vidéos avec Hugging Face (gratuit)

Note écrite le 21/11/2026. Elle résume ce qui a été constaté en pratique avec le connecteur Hugging Face de Claude (compte gratuit « Pijako », non PRO).

## Ce qui marche

- **Images** : outil `gr1_z_image_turbo_generate` (Space `mcp-tools/Z-Image-Turbo`).
  - Réglages utilisés : `1280x720 ( 16:9 )`, `steps` = 9.
  - Les meilleurs résultats réalistes viennent d'un **seul sujet bien décrit** (pas de scène chargée avec beaucoup d'animaux), avec un style « photo animalière » (objectif télé, lumière naturelle, photo non retouchée).
  - Gros plans de visages de félins : très bons résultats (léopard de l'Amour, léopard des neiges, tigre de Sibérie, chat de Pallas, jaguar, panthère nébuleuse, lynx, guépard).

## Quota quotidien

- La documentation de Hugging Face indique **5 minutes de GPU par jour** pour un compte gratuit (les Spaces « ZeroGPU »).
- Constat sur deux jours (19 et 20/11/2026) : environ **8 images en 1280×720 par jour**, puis l'erreur « ZeroGPU quota exceeded… 60s requested vs. 0s left ».
- Le quota se remet à zéro, mais l'heure exacte n'est pas connue. Le 21/11/2026, il était **encore épuisé** environ 24 h après la dernière série d'images.
- Le compte PRO (payant) donne plus de quota. Le prix n'a pas été vérifié.

## Vidéo

- Des Spaces vidéo sont disponibles via le connecteur, par exemple `zerogpu-aoti/wan2-2-fp8da-aoti-faster` (Wan 2.2, image + texte → courte vidéo) et `mcp-tools/wan-2-2-first-last-frame`.
- Le Space demande **l'adresse web d'une image** de départ.
- Premier essai (21/11/2026) : erreur « Error! » sans détail, probablement due au quota épuisé (non confirmé). **Le coût en quota d'une vidéo est inconnu**, sans doute bien supérieur à celui d'une image.

## Ce qui ne marche pas (ou plus)

- **API Google (clé AI Studio)** : testée puis supprimée. Le compte de facturation a été clôturé. Pas de modèle Veo visible avec cette clé.
- **OpenArt** : modèles vidéo disponibles (Veo 3.1, Gemini Omni Flash, etc.) mais le compte n'avait que 5 crédits, insuffisants pour une vidéo.

## Pratique

- Les images générées sont stockées temporairement. Pour les garder, il faut les enregistrer ailleurs : les liens Hugging Face expirent.
- Pour la vidéo, Google Flow (avec l'abonnement Gemini) reste la voie principale.
