# Directives Claude Code : Success

## Destination unique
- Dépôt : `https://github.com/aaxxeell09/Success.git`, branche `main`.
- Ne JAMAIS publier dans `spicyx9`, ni créer un nouveau dépôt.
- Ce projet utilise **Übersicht**, pas un fond d'écran statique ni un widget natif Apple.

## Objectif produit
Widget permanent sur le bureau macOS, une personnalité à la fois : vraie photo, nom, épreuve (« Au plus bas »), retournement. Flèches précédent/suivant, tailles S/M/L, rotation 20 minutes, pause, préférences mémorisées. `stories.json` sur `main` est la source de vérité : lecture depuis GitHub toutes les 5 minutes, cache local et copie embarquée en repli hors connexion.

## Architecture (détails : docs/ARCHITECTURE.md)
- `widget/mur-des-retournements.widget/mur-des-retournements.jsx` : point d'entrée Übersicht (UI, bloc CONFIG personnalisable).
- `widget/.../lib/state.js` : réducteur pur, préférences, ordre des photos. `lib/sync.js` : synchronisation GitHub, validation, cache. Modules ES purs testables sous Node (Übersicht ignore les dossiers `lib/` comme widgets et les assemble avec browserify + babel).
- `widget/.../stories.json` : copie embarquée, strictement identique à `stories.json`.
- `widget/.../photos/<id>.jpg` : photos authentiques (Wikimedia Commons), attributions dans `CREDITS.md`.
- `installer.command`, `mettre-a-jour.command`, `desinstaller.command` : scripts Mac (bash 3.2). Guide : `docs/INSTALLATION.md`.
- `docs/SYNCHRONISATION.md`, `schema/stories.schema.json`.
- Tests : `tests/` (node:test, Python, shell, rendu Playwright via `tests/harness/`), CI `.github/workflows/tests.yml`.

## Exigences
1. Vérifier `git remote -v` avant tout push : origin doit viser `aaxxeell09/Success`.
2. Préserver l'historique. Aucune commande destructrice, pas de force push.
3. URL des données : `https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json` (dans `lib/sync.js`).
4. **Photographies authentiques** correctement attribuées (auteur, licence, source), jamais de portrait IA.
5. Les clics sur le bureau requièrent le raccourci d'interaction d'Übersicht et l'autorisation Accessibilité. Ne pas présenter les boutons comme utilisables sans cela.
6. Installation via `installer.command`, sans supposer qu'Übersicht est installé. Übersicht 1.6.82 exige macOS 12+.
7. Chaque modification logique = un commit atomique ; `npm test` avant push.
8. Aucun tiret cadratin ni demi-cadratin dans les textes (le validateur le refuse).
9. Signaler explicitement tout test macOS impossible dans l'environnement.

## Validation
```sh
npm install && npm test
```
(`node --test 'tests/*.test.*js'`, `python3 tests/validate_stories.py`, `tests/static_checks.sh`, `tests/install.test.sh`). Le test de rendu est sauté si esbuild, React ou Playwright manquent.

## Ajouter une histoire
Modifier `stories.json` ET la copie du widget (identiques), photo dans `widget/.../photos/<id>.jpg` avec crédit et licence, puis `npm test`. Une histoire ajoutée seulement dans `stories.json` sur GitHub apparaît quand même sur les Mac installés (photo via `image_url` ou le chemin `photo` lu sur GitHub).

## Suites
- Tester affichage et clics sur un vrai Mac avec Übersicht.
- Tester l'ajout d'une personne depuis GitHub et sa présence après synchronisation (CDN raw : jusqu'à environ 10 minutes).
