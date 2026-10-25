# Directives Claude Code : Success

## Destination unique
- Dépôt : `https://github.com/aaxxeell09/Success.git`, branche `main`.
- Ne JAMAIS publier dans `spicyx9`, ni créer un nouveau dépôt.
- Ce projet utilise **Übersicht**, pas un fond d'écran statique ni un widget natif Apple.

## Objectif produit
Widget permanent sur le bureau macOS, une personnalité à la fois : vraie photo, nom, épreuve (« Au plus bas »), retournement. Carte compacte **en anglais** (interface et textes) : pas de titre ni de crédit affiché ; photo (compteur et synchro superposés), catégorie, nom, accroche, sections « LOWEST POINT », « TURNAROUND », « AT 25 ». Taille fixe 350 × 490 px (largeur réduite seulement si écran étroit) : seule la zone de texte défile, photo et 3 boutons (previous, next, pause) fixes. Rotation 20 minutes, personne et pause mémorisées. `stories.json` sur `main` est la source de vérité : lecture depuis GitHub toutes les 5 minutes, cache local et copie embarquée en repli hors connexion.

## Liste blanche
`stories.json` = 9 cartes choisies par l'utilisateur (valdas, elon, mandela, trump, chesky, collison, pope, jose, thatcher), vérifiées par `WHITELIST` dans `tests/validate_stories.py`. N'ajouter AUCUNE personne de sa propre initiative ; les histoires retirées sont dans `archive/stories-retirees.json`. Textes de 7 cartes fournis par l'utilisateur puis traduits fidèlement en anglais : ne pas en changer le sens. Catégorie de Thatcher : exactement « Politics · United Kingdom ». Tout nouveau texte doit être en anglais. Champ `at25` : factuel et sourcé (`at25_sources`, détails dans `docs/A-25-ANS.md`), jamais inventé.

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
Seulement à la demande explicite de l'utilisateur (puis ajouter l'id à `WHITELIST`). Modifier `stories.json` ET la copie du widget (identiques), photo dans `widget/.../photos/<id>.jpg` avec crédit et licence, puis `npm test`. Une histoire ajoutée seulement dans `stories.json` sur GitHub apparaît quand même sur les Mac installés (photo via `image_url` ou le chemin `photo` lu sur GitHub).

## Suites
- Tester affichage et clics sur un vrai Mac avec Übersicht.
- Tester l'ajout d'une personne depuis GitHub et sa présence après synchronisation (CDN raw : jusqu'à environ 10 minutes).
