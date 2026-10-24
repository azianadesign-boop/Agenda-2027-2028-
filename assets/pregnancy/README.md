# Illustrations de grossesse (semaines 1 à 42 SA)

Ce dossier reçoit les 42 illustrations du module Mama & Baby. **Aucune image n’est encore publiée** : l’app affiche une image neutre tant qu’une semaine n’est pas validée.

## Étapes
1. Générer les 6 pilotes (4, 8, 12, 20, 28, 40 SA) avec `PROMPTS.md`, même style, même référence, même seed.
2. Faire valider par une sage-femme ou un gynécologue (proportions, pas de « mini-bébé » avant 10 SA).
3. Produire les semaines intermédiaires à partir de la pilote la plus proche ; contrôler les 42 côte à côte.
4. Exporter en PNG 2160 × 2160 (`png/week-XX.png`), convertir en WebP 1080 px (`webp/week-XX.webp`).
5. Dans `manifest.json` : `status` → `validé`, `validated_by`, `validated_on`.
6. Dans `index.html` : ajouter le numéro de la semaine à `MB_IMG_READY` (et à `MB_IMG_TWINS` pour les jumeaux).

## Règles
- Pas de texte, chiffres ni logo dans les images : tailles et poids viennent du manifeste.
- Jamais l’image d’une autre semaine en remplacement.
- Aucune variante d’apparence pour le fœtus in utero.
- Illustrations pédagogiques, non diagnostiques.
