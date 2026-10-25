# Architecture et contrats entre modules

Widget Übersicht (macOS) « Le mur des retournements ». Langue des textes et commentaires visibles : français. Jamais de tiret cadratin (—) ni demi-cadratin (–) dans les textes produits : utiliser virgule, deux-points, parenthèses.

## Arborescence et propriétaires

```
stories.json                                   # source de vérité (lue depuis GitHub par le widget)
CREDITS.md                                     # attributions photos (auteur, licence, source)
schema/stories.schema.json                     # JSON Schema des histoires
widget/mur-des-retournements.widget/
  mur-des-retournements.jsx                    # point d'entrée Übersicht (UI)
  lib/state.js                                 # réducteur pur, préférences, photos (UI)
  lib/sync.js                                  # synchronisation GitHub, validation, cache
  stories.json                                 # copie embarquée, identique à ./stories.json
  photos/<id>.jpg                              # portraits authentiques embarqués
installer.command / mettre-a-jour.command / desinstaller.command
docs/INSTALLATION.md
tests/ , package.json , .github/workflows/tests.yml , README.md
```

Les modules `lib/*.js` sont des **modules ES purs** (pas de JSX, pas d'import de `uebersicht`, pas d'accès global implicite : `fetch`, `localStorage`, `Date.now` sont injectables) afin d'être testés sous Node 22 (`node --test`). `package.json` racine contient `"type": "module"`.

## Schéma d'une histoire

| Champ | Requis | Description |
|---|---|---|
| `id` | oui | `^[a-z0-9-]+$`, unique |
| `name` | oui | Prénom Nom |
| `lowest` | oui | L'épreuve (au plus bas), ≤ 400 caractères |
| `comeback` | oui | Le retournement (TURNAROUND), en anglais, ≤ 400 caractères |
| `category` | non | « Domaine · Pays » |
| `headline` | non | Accroche affichée sous le nom, ≤ 120 caractères |
| `at25` | non | Section « AT 25 », en anglais, factuelle, ≤ 400 caractères (masquée si absente) |
| `at25_sources` | non | URL justifiant `at25` |
| `lesson` | non | Conservé dans les données, non affiché |
| `wikipedia` | non | Titre exact de la page Wikipédia anglaise (repli photo) |
| `photo` | non | Chemin relatif au dossier du widget, ex. `photos/mandela.jpg` |
| `image_url` | non | URL https d'une vraie photographie (repli distant) |
| `image_credit` | non | « Auteur, Licence » |
| `image_license` | non | ex. `CC BY-SA 4.0`, `Domaine public` |
| `image_source` | non | Page de fichier Wikimedia Commons |
| `sources` | non | Tableau d'URL justifiant les faits |

Le widget n'exige que `id`, `name`, `lowest`, `comeback` (chaînes non vides). Les entrées invalides sont ignorées individuellement, jamais toute la liste.

## Ordre de résolution d'une photo (`photoCandidates`)

1. `mur-des-retournements.widget/<photo>` (fichier local servi par Übersicht)
2. `https://raw.githubusercontent.com/aaxxeell09/Success/main/widget/mur-des-retournements.widget/<photo>` (photo ajoutée sur GitHub après installation)
3. `image_url`
4. vignette Wikipédia (`pageimages`) trouvée pour `wikipedia`
5. initiales (jamais d'image générée)

## `lib/sync.js` (synchronisation)

```js
export const DATA_URL = 'https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json';
export const SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const CACHE_KEY = 'mur-des-retournements-stories-cache-v2';
export function validateStories(data) // -> { stories: Story[], rejected: [{ index, id, reason }] }
export function readCache(storage)    // -> { stories, savedAt } | null (ne lève jamais)
export function writeCache(storage, stories, now) // ne lève jamais
export async function fetchRemoteStories({ fetchImpl, url, timeoutMs }) // -> Story[] ; lève si HTTP/réseau/JSON/liste vide
export function createSyncer({ dispatch, storage, fetchImpl, url, now }) // -> { syncNow(): Promise<void>, loadCached(): boolean }
```

Événements émis par le syncer :
- `{ type: 'DATA', stories, source: 'remote' | 'cache', at }` quand le contenu change (empreinte différente) ;
- `{ type: 'SYNC_OK', at }` quand le contenu distant est identique ;
- `{ type: 'SYNC_FAIL', error, at }` en cas d'échec (les histoires affichées restent inchangées).

Une seule requête en vol à la fois, délai d'expiration, URL anti-cache (`?t=`), `cache: 'no-store'`.

## `lib/state.js` (état de l'interface)

```js
export const CARD_WIDTH = 350;  // largeur fixe, réduite si l'écran est plus étroit
export const CARD_HEIGHT = 490; // hauteur fixe, seul le texte défile
export const ROTATION_MS = 20 * 60 * 1000;
export const PREFS_KEY = 'mur-des-retournements-settings-v3';
export function createInitialState(localStories, now)
export function reducer(state, event)
export function loadPrefs(storage)        // -> { currentId, size, paused } validés, ne lève jamais
export function savePrefs(storage, state) // ne lève jamais
export function photoCandidates(story, wikiPhotos) // -> string[] (voir ordre ci-dessus)
```

État : `{ stories, currentId, paused, lastAdvanceAt, photos, lastSync, syncError, source }`.
Événements : `RESTORE {prefs, now}`, `NEXT {now}`, `PREV {now}`, `TICK {now}` (avance si non en pause et `now - lastAdvanceAt >= ROTATION_MS`), `TOGGLE_PAUSE {now}`, `DATA`, `SYNC_OK`, `SYNC_FAIL`, `PHOTOS {photos}`.
La personne courante est mémorisée par `id` (pas par index) : l'ajout d'une histoire ne déplace pas l'affichage. Si l'`id` disparaît, on revient à la première histoire. Navigation circulaire.

## Interaction Übersicht

Les clics nécessitent le raccourci d'interaction d'Übersicht (Préférences → Interaction Shortcut) et l'autorisation Accessibilité. Le widget expose `refreshFrequency = SYNC_INTERVAL_MS`, `command(dispatch)` (appelle `syncNow`), `init(dispatch)` (cache, préférences, minuterie de rotation vérifiée chaque minute), `updateState`, `render`.

## Version 2 (simplification)

- `stories.json` est une **liste blanche** de 12 cartes (valdas, elon, mandela, chesky, collison, pope, jose, thatcher, jensen, rdj, disney, ford ; Trump retiré en v3) ; les autres histoires sont archivées dans `archive/stories-retirees.json`.
- Plus de tailles S/M/L : `CARD_WIDTH = 420`, événement `SIZE` ignoré, préférences v3 `{ currentId, paused }` (migration depuis v2/v1, anciennes clés supprimées).
- Cache v2 : l'ancien cache v1 (20 personnes) n'est plus relu.
- Carte : pas de titre ni de crédit photo ; sections « AU PLUS BAS », « LE RETOURNEMENT », « À 25 ANS » (`data-role` low, high, at25) ; accroche `data-role="headline"` sur la photo ; 3 boutons.

## Version 3 (compacte, en anglais)

- Interface et données en anglais : libellés « LOWEST POINT », « TURNAROUND », « AT 25 », boutons « Previous person », « Next person », « Pause automatic rotation » / « Resume automatic rotation (every 20 minutes) », indicateur « offline ».
- Taille fixe `CARD_WIDTH` × `CARD_HEIGHT` = 350 × 490 : `<article>` en colonne flex ; photo 172 px (`flex: none`), zone `[data-role="content"]` (`flex: 1 1 auto`, `overflowY: auto`, remise en haut à chaque personne via `key`), `<nav>` fixe en bas.
