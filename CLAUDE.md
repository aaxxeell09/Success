# Directives Claude Code — Success

## Destination unique
- Dépôt : `https://github.com/aaxxeell09/Success.git`.
- Branche principale : `main`.
- Ne JAMAIS publier dans `spicyx9`, ni créer un nouveau dépôt.
- Ce projet utilise **Übersicht**, pas un fond d’écran statique ni un widget natif Apple.

## Objectif produit
Widget permanent sur le bureau macOS, une personnalité à la fois : vraie photo, nom, récit du point le plus bas, récit du retournement. Flèches précédent/suivant, tailles S/M/L, rotation 20 minutes, pause. `stories.json` sur `main` est la source de vérité ; lecture depuis GitHub toutes les 5 minutes avec repli local en cas d’indisponibilité.

## Exigences
1. Vérifier `git remote -v` avant tout push : origin doit viser `aaxxeell09/Success`.
2. Préserver l’historique et tous les fichiers existants. Aucune commande destructrice, pas de force push.
3. Contrôler l’URL des données dans le widget : `https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json`.
4. Utiliser des **photographies authentiques** correctement attribuées, jamais de portrait IA de personnes réelles.
5. Vérifier l’interaction Übersicht : les clics sur le bureau requièrent son raccourci d’interaction et des permissions Accessibilité. Ne pas présenter les boutons comme utilisables sans cela.
6. Lancement à la session et installation via `installer.command`, sans supposer qu'Übersicht est déjà installé.
7. Chaque modification logique = un commit Git atomique ; exécuter les tests avant push.
8. Écrire les corrections réelles, pas seulement une recommandation. Signaler explicitement tout test macOS impossible dans l’environnement.

## Validation minimale
```sh
python3 tests/validate_stories.py
bash -n installer.command publier-sur-github.command
rg 'aaxxeell09/Success' widget/mur-des-retournements.widget/mur-des-retournements.jsx README.md
rg 'spicyx9' . && exit 1 || true
```

## Publication initiale
Si GitHub est réellement vide : cloner ou initialiser le dossier du projet, écrire les fichiers, committer par étape (données, widget, scripts/docs), puis `git push -u origin main`. Si la branche distante contient déjà des commits : la récupérer et réconcilier avant tout push. Ne jamais faire de push --force.

## Suites
- Tester affichage et clics sur un vrai Mac avec Übersicht.
- Tester création d’une personne dans `stories.json` depuis GitHub, puis constater sa présence dans le widget après la synchronisation.
- Corriger toute photo manquante et documenter sa provenance/licence.
