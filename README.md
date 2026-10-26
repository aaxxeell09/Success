# Le mur des retournements

Widget de bureau macOS pour [Übersicht](https://tracesof.net/uebersicht/). Il affiche **une personnalité à la fois** : une vraie photographie, son nom, le récit de son **point le plus bas** et celui de son **retournement**. Les histoires sont lues depuis ce dépôt GitHub ([`aaxxeell09/Success`](https://github.com/aaxxeell09/Success)) : ajouter une personne sur GitHub suffit pour la voir apparaître sur le bureau.

> Ce n'est pas un widget Apple natif ni un fond d'écran : Übersicht dessine le widget **sur le bureau**, derrière les fenêtres.

## Aperçu

Ouvrez [`preview/index.html`](./preview/index.html) dans un navigateur pour voir le design et essayer les boutons sans Mac ni Übersicht. L'aperçu reproduit la carte du widget ; seul le vrai widget est synchronisé en continu avec GitHub.

## Fonctionnalités

- **Treize personnalités choisies**, une à la fois : grande photo, nom, accroche, puis « LOWEST POINT », « TURNAROUND », « AT 25 ». **Interface et textes en anglais.** Compteur et indicateur de synchronisation discrets sur la photo. Aucun titre, aucun crédit affiché sur la carte (attributions dans [CREDITS.md](./CREDITS.md)).
- **Liste blanche** : seules les personnes présentes dans `stories.json` s'affichent ; les 11 histoires retirées sont archivées dans `archive/stories-retirees.json`.
- **‹ / ›** : personne précédente ou suivante (navigation circulaire).
- **Taille fixe et compacte de 350 × 490 px**, pensée pour se placer sous les widgets macOS : la hauteur ne change jamais et **tout le texte est visible sans défilement** (photo et boutons fixes). Limites de mots : accroche 7, LOWEST POINT 24, TURNAROUND 24, AT 25 18. La largeur est réduite si l'écran est plus étroit.
- **Pause / reprise** de la rotation automatique, qui change de personne toutes les **20 minutes**.
- **Synchronisation** avec [`stories.json`](./stories.json) sur la branche `main`, toutes les **5 minutes**.
- **Mode hors connexion** : la dernière liste téléchargée reste affichée, un indicateur signale l'absence de connexion.
- **Préférences mémorisées** sur le Mac : personne affichée et pause.
- **Photographies authentiques** et attribuées ; à défaut, des initiales. Jamais de portrait généré.

## Installation sur Mac

1. **Installer Übersicht** depuis [tracesof.net/uebersicht](https://tracesof.net/uebersicht/), le glisser dans Applications et le lancer une première fois.
2. **Télécharger ce dépôt** : sur GitHub, bouton **Code**, puis **Download ZIP**, et décompresser l'archive.
3. **Double-cliquer sur `installer.command`**. Si macOS le bloque, faire clic droit (ou Contrôle-clic), **Ouvrir**, puis confirmer. Le script copie le widget dans le dossier des widgets d'Übersicht et ouvre Übersicht.
4. **Autoriser les clics** (voir ci-dessous) : raccourci d'interaction d'Übersicht et autorisation Accessibilité.
5. **Lancer Übersicht à l'ouverture de session** : menu Übersicht dans la barre des menus, **Preferences**, cocher **Launch Übersicht when I login** (ou l'ajouter dans Réglages Système, Général, Ouverture).

Le détail pas à pas, les messages d'erreur courants et leurs solutions sont dans [docs/INSTALLATION.md](./docs/INSTALLATION.md).

### Autorisations nécessaires pour cliquer

Par défaut, Übersicht laisse passer les clics vers le bureau : **les boutons du widget ne réagissent pas tant que l'interaction n'est pas configurée**.

1. Menu Übersicht, **Preferences**, **Interaction Shortcut** : choisir une touche (par exemple Commande ou Option).
2. Réglages Système, **Confidentialité et sécurité**, **Accessibilité** : activer **Übersicht**. macOS peut le demander au premier usage du raccourci.
3. Pour cliquer sur ‹, › ou pause : **maintenir la touche choisie** pendant le clic.

Sans ces deux réglages, le widget s'affiche et tourne seul toutes les 20 minutes, mais les boutons restent inactifs.

## Ajouter une personne depuis GitHub

1. Ouvrir [`stories.json`](https://github.com/aaxxeell09/Success/blob/main/stories.json) sur GitHub, cliquer sur le crayon (**Edit this file**).
2. Après l'accolade `}` de la dernière histoire, ajouter une **virgule**, puis la nouvelle entrée avant le `]` final :

```json
{
  "id": "marie-curie",
  "name": "Marie Curie",
  "category": "Science · France",
  "lowest": "Precise, verifiable hardship, in English, 400 characters max.",
  "comeback": "Precise, verifiable turnaround, in English, 400 characters max.",
  "headline": "Short hook, 120 characters max",
  "at25": "What the person was doing at 25, factual and sourced.",
  "at25_sources": ["https://fr.wikipedia.org/wiki/Marie_Curie"],
  "wikipedia": "Marie Curie",
  "photo": "photos/marie-curie.jpg",
  "image_url": "https://upload.wikimedia.org/wikipedia/commons/exemple.jpg",
  "image_credit": "Auteur de la photo, Domaine public",
  "image_license": "Domaine public",
  "image_source": "https://commons.wikimedia.org/wiki/File:Exemple.jpg",
  "sources": ["https://fr.wikipedia.org/wiki/Marie_Curie"]
}
```

3. **Commit changes**, directement sur `main`.

Règles du schéma (détail dans [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) et `schema/stories.schema.json`) :

| Champ | Requis | Règle |
|---|---|---|
| `id` | oui | minuscules, chiffres et tirets (`^[a-z0-9-]+$`), unique, à ne plus changer |
| `name` | oui | Prénom Nom |
| `lowest`, `comeback` | oui | texte non vide, 400 caractères au plus |
| `category`, `headline` | non | texte (accroche : 120 caractères au plus) |
| `at25` | non | ce que faisait la personne à 25 ans, 400 caractères au plus ; section masquée si absent |
| `at25_sources` | non | adresses `https://` justifiant `at25` |
| `wikipedia` | non | titre exact de la page Wikipédia anglaise (photo de repli) |
| `photo` | non | chemin dans le dossier du widget, ex. `photos/marie-curie.jpg` ; exige `image_credit` et `image_license` |
| `image_url`, `image_source`, `sources` | non | adresses `https://` |

Une entrée invalide est ignorée seule, les autres restent affichées. Le widget affiche toute personne ajoutée à `stories.json` ; pour garder les tests GitHub Actions au vert, ajoutez aussi son `id` à la constante `WHITELIST` de `tests/validate_stories.py`. Une photo distante `image_url` avec source et licence convient aussi ; le widget la récupère directement sans réinstaller le projet. Pour une photo embarquée, ajoutez aussi le fichier dans `widget/mur-des-retournements.widget/photos/` et son attribution dans [CREDITS.md](./CREDITS.md). Pas de tiret long dans les textes : utiliser virgule, deux-points ou parenthèses.

### Délai de synchronisation

Comptez **jusqu'à 10 minutes environ** entre le commit et l'affichage : le cache de `raw.githubusercontent.com` peut servir l'ancienne version pendant 5 minutes, puis le widget relit les données toutes les 5 minutes. Le Mac doit être en ligne et Übersicht lancé. Le menu Übersicht, **Refresh All Widgets**, force une relecture immédiate (le cache GitHub reste, lui, incompressible). Détails et diagnostic : [docs/SYNCHRONISATION.md](./docs/SYNCHRONISATION.md).

### Mode hors connexion

Si GitHub est inaccessible (pas de réseau, panne, fichier cassé), le widget **garde les histoires déjà affichées**, indique « offline » et réessaie seul. Au démarrage sans réseau, il utilise la dernière liste téléchargée (cache local), sinon la copie embarquée `widget/mur-des-retournements.widget/stories.json`.

## Personnalisation

Ouvrir `mur-des-retournements.jsx` dans le dossier des widgets (menu Übersicht, **Open Widgets Folder**) et modifier uniquement le bloc `CONFIG` en haut du fichier : position sur le bureau, opacité et flou du fond, rayon des coins, taille (350 × 490 px), rotation activée ou non au premier lancement, couleurs du thème. Übersicht recharge le widget dès l'enregistrement. Une mise à jour remplace ce fichier : notez vos réglages.

## Mise à jour et désinstallation

- **Mettre à jour** le code du widget : télécharger la dernière version du dépôt puis double-cliquer sur **`mettre-a-jour.command`**. Les histoires, elles, se mettent à jour seules depuis GitHub.
- **Désinstaller** : double-cliquer sur **`desinstaller.command`**, qui retire le widget du dossier d'Übersicht. Übersicht lui-même reste installé.

## Tests

Prérequis : Node.js 22 et Python 3.

```sh
npm install   # dépendances de développement : esbuild, react, react-dom
npm test
```

`npm test` lance :

- `node --test 'tests/*.test.*js'` : module d'état (`tests/state.test.js`), synchronisation (`tests/sync.test.mjs`), validateur (`tests/validate_stories.test.js`) et widget (`tests/widget.test.js`) ;
- `python3 tests/validate_stories.py` : schéma de `stories.json`, photos et crédits, copie du widget identique, URL des données ;
- `bash tests/static_checks.sh` : syntaxe des scripts `.command`, URL du dépôt ;
- `bash tests/install.test.sh` s'il est présent : scripts d'installation.

Le test de rendu de `tests/widget.test.js` bundle le JSX avec esbuild, le rend avec React 18 dans Chromium via Playwright, en reproduisant le cycle Übersicht (`tests/harness/`) : titre et crédit absents, 13 cartes de la liste blanche, sections LOWEST POINT / TURNAROUND / AT 25, taille fixe 350 × 490 px sur les 13 cartes, aucun défilement et texte entièrement visible, interface sans français, flèches, pause, rotation, hors connexion, ajout d'une histoire sur GitHub. Il est **sauté** si esbuild, React ou Playwright manquent. Playwright n'est pas une dépendance du projet : la CI l'installe (`.github/workflows/tests.yml`) ; en local, `npm install --no-save playwright` puis `npx playwright install chromium`.

## Structure du dépôt

```
stories.json                         source de vérité, lue par le widget depuis GitHub
CREDITS.md                           auteurs et licences des photographies
schema/stories.schema.json           schéma JSON des histoires
widget/mur-des-retournements.widget/
  mur-des-retournements.jsx          point d'entrée Übersicht (interface, bloc CONFIG)
  lib/state.js                       état de l'interface, préférences, photos
  lib/sync.js                        synchronisation GitHub, validation, cache
  stories.json                       copie embarquée, identique à ./stories.json
  photos/                            portraits authentiques embarqués
installer.command                    installation sur Mac
mettre-a-jour.command                mise à jour du widget installé
desinstaller.command                 désinstallation
publier-sur-github.command           publication initiale sur GitHub (via gh)
preview/index.html                   aperçu dans un navigateur
docs/                                INSTALLATION.md, SYNCHRONISATION.md, ARCHITECTURE.md
tests/                               tests Node, validateur Python, harnais Übersicht
.github/workflows/tests.yml          intégration continue (npm test)
```

## Crédits photos

Chaque photographie est une vraie photo, avec auteur, licence et source indiqués dans [CREDITS.md](./CREDITS.md) et dans les champs `image_credit`, `image_license` et `image_source` de `stories.json`. Les vignettes de repli viennent des pages Wikipédia publiques ; leur licence est celle indiquée sur Wikimedia Commons. Aucun portrait n'est généré par IA.

## Limites

- **Non testé sur un Mac réel** dans l'environnement de développement : le rendu et les clics ont été vérifiés dans Chromium avec un harnais qui imite Übersicht, pas dans Übersicht lui-même. À vérifier sur Mac : affichage, raccourci d'interaction, autorisation Accessibilité, lancement à la session.
- Le délai d'apparition d'une modification dépend du cache de GitHub (environ 5 minutes) en plus du cycle du widget.
- Les préférences sont stockées dans la vue web d'Übersicht : une réinitialisation de ses données les efface.
- La synchronisation est une lecture publique en HTTPS : aucun identifiant GitHub n'est demandé ni stocké.
