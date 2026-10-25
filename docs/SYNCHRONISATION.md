# Synchronisation avec GitHub

Le widget affiche les histoires du fichier `stories.json` de la branche `main` du dépôt GitHub `aaxxeell09/Success`. Il le relit automatiquement : **aucune réinstallation n'est nécessaire** après une modification sur GitHub.

Adresse lue par le widget :

```
https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json
```

Le code se trouve dans `widget/mur-des-retournements.widget/lib/sync.js`, le format dans `schema/stories.schema.json`.

## Fonctionnement

1. **Au démarrage** du widget, la dernière liste téléchargée avec succès (cache local) est affichée immédiatement. Sans cache, c'est la copie embarquée `widget/mur-des-retournements.widget/stories.json` qui sert.
2. Le widget **télécharge ensuite** `stories.json` depuis GitHub, puis recommence **toutes les 5 minutes** (`SYNC_INTERVAL_MS`).
3. Le fichier reçu est **vérifié histoire par histoire**. Une histoire mal écrite est ignorée seule : les autres restent affichées.
4. Si le contenu a changé, l'affichage est mis à jour et la personne actuellement affichée reste la même (elle est retenue par son `id`). Si rien n'a changé, rien ne bouge à l'écran.
5. La liste valide est **enregistrée dans le cache** local (clé `mur-des-retournements-stories-cache-v2`), réutilisé au prochain démarrage ou hors connexion. L'ancien cache `mur-des-retournements-stories-cache-v1` (l'ancienne liste à 20 personnes) n'est **plus relu** : il est ignoré puis supprimé, pour qu'aucune personne retirée ne réapparaisse.
6. **En cas d'échec** (pas de réseau, GitHub indisponible, fichier cassé), le widget garde les histoires déjà affichées, signale l'échec, puis réessaie rapidement : après 30 secondes, puis après 60 secondes, puis au cycle normal de 5 minutes.

## stories.json est la liste blanche

`stories.json` sur GitHub décide **seul** de qui s'affiche :

- seules les personnes présentes dans le fichier s'affichent, dans l'ordre du fichier ;
- la liste téléchargée **remplace entièrement** la liste affichée (rien n'est ajouté ni conservé d'une ancienne version) ;
- une personne **retirée** de `stories.json` sur GitHub **disparaît** du widget à la synchronisation réussie suivante (et du cache, qui est réécrit) ;
- l'ancien cache v1 étant ignoré, une personne retirée ne revient pas non plus au démarrage hors connexion.

Détails techniques :

- une seule requête à la fois (les demandes simultanées partagent la même requête) ;
- délai d'expiration de 15 secondes par requête ;
- paramètre anti-cache `?t=<horodatage>` et option `cache: 'no-store'` pour que la WebView d'Übersicht ne réutilise pas une ancienne copie.

## Délai avant de voir une modification

Comptez **jusqu'à 10 minutes** environ entre l'enregistrement sur GitHub et l'affichage sur le bureau :

| Étape | Délai maximal |
|---|---|
| Cache du CDN de `raw.githubusercontent.com` | environ 5 minutes |
| Prochaine synchronisation du widget | 5 minutes |
| **Total réaliste** | **environ 10 minutes** |

Pourquoi le CDN : les fichiers « raw » sont servis par un cache (Fastly) qui envoie l'en-tête `cache-control: max-age=300`, soit 300 secondes. Vérifié le 25 octobre 2026 :

```sh
curl -sI https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json | grep -iE 'cache-control|x-cache|source-age'
# cache-control: max-age=300
# x-cache: HIT
# source-age: 11
```

Constat lors de ce même test : le paramètre `?t=` ne contourne **pas** ce cache CDN (une adresse avec un `t` jamais utilisé renvoie `x-cache: HIT` avec le même `source-age`). Il empêche seulement le cache du navigateur de la WebView. GitHub ne documente pas officiellement ce délai ; la valeur ci-dessus provient de l'en-tête réellement renvoyé et peut évoluer.

Pour forcer une mise à jour sans attendre le cycle de 5 minutes : rafraîchir le widget depuis le menu d'Übersicht (« Refresh All Widgets ») ou cliquer sur le widget s'il propose un bouton d'actualisation. Le délai du CDN, lui, ne peut pas être raccourci.

## Ajouter une personne depuis le site GitHub

Aucun outil à installer : tout se fait dans le navigateur.

1. Ouvrir https://github.com/aaxxeell09/Success/blob/main/stories.json (connecté au compte qui a les droits d'écriture).
2. Cliquer sur l'icône crayon (« Edit this file »).
3. Aller à la fin de la liste. Après l'accolade `}` de la dernière histoire, ajouter **une virgule**, puis la nouvelle histoire :

   ```json
     },
     {
       "id": "nouvelle-personne",
       "name": "Prénom Nom",
       "category": "Domaine · Pays",
       "lowest": "Ce qu'elle a traversé au plus bas.",
       "comeback": "Comment elle s'est relevée.",
       "lesson": "Une phrase à retenir.",
       "wikipedia": "Exact English Wikipedia title"
     }
   ]
   ```

4. Vérifier que le fichier se termine bien par `]`.
5. Cliquer sur « Commit changes... », écrire un message (ex. « Ajouter Prénom Nom »), choisir « Commit directly to the main branch », valider.
6. Attendre jusqu'à 10 minutes : la personne apparaît dans la rotation du widget.

Règles à respecter :

- `id`, `name`, `lowest`, `comeback` sont **obligatoires** et non vides ;
- `id` : uniquement minuscules sans accent, chiffres et tirets (`marie-curie`, pas `Marie Curie`), **unique**, et à ne plus modifier ensuite ;
- `lowest` et `comeback` : 400 caractères au plus conseillés (au delà de 2000, le widget coupe le texte) ;
- photo : utiliser une **vraie photographie** sous licence libre (Wikimedia Commons), jamais une image générée. Champs `image_url` (adresse `https://` obligatoire), `image_credit`, `image_license`, `image_source`. Sans photo, le widget cherche la vignette de la page Wikipédia indiquée dans `wikipedia`, sinon affiche les initiales ;
- facultatif : `photo` (chemin relatif dans le dossier du widget, ex. `photos/marie-curie.jpg`) et `sources` (liste d'adresses) ;
- facultatif : `headline`, accroche courte affichée sous le nom (120 caractères au plus conseillés, ex. « 8 ans de galère ») ;
- facultatif : `at25`, ce que faisait la personne à 25 ans (texte factuel en français, 20 à 40 mots environ, 400 caractères au plus conseillés, ex. « En 1996, ... »), et `at25_sources`, la liste des adresses qui le justifient. Sans `at25`, la section « À 25 ans » n'est pas affichée. Les recherches et sources sont consignées dans `docs/A-25-ANS.md` et `data/at25.json`.

Pour modifier une histoire : même démarche, en changeant le texte entre guillemets. Pour en retirer une : supprimer le bloc `{ ... }` et la virgule qui le sépare du voisin.

Astuce : l'onglet « Preview » de l'éditeur GitHub ne valide pas le JSON. Avant de valider, on peut coller le contenu dans un validateur JSON (par exemple https://jsonlint.com) pour repérer une erreur de syntaxe.

## Erreurs JSON fréquentes

| Erreur | Exemple fautif | Correction |
|---|---|---|
| Virgule manquante entre deux histoires | `} {` | `}, {` |
| Virgule en trop après le dernier élément | `"lesson": "..." ,}` ou `}, ]` | retirer la dernière virgule |
| Guillemets typographiques | `“name”: “Ada”` | guillemets droits `"name": "Ada"` |
| Apostrophes simples comme délimiteurs | `'name': 'Ada'` | `"name": "Ada"` |
| Guillemet droit non échappé dans un texte | `"lesson": "Il dit "jamais""` | `\"jamais\"` ou guillemets français « jamais » |
| Crochet final supprimé | fichier qui se termine par `}` | terminer par `]` |
| Retour à la ligne dans un texte | texte coupé sur deux lignes | tout sur une ligne |
| Id avec majuscule, espace ou accent | `"id": "Marie Curie"` | `"id": "marie-curie"` |
| Id déjà utilisé | deux fois `"id": "mandela"` | choisir un autre id |
| Champ obligatoire vide | `"comeback": ""` | écrire le texte |

Conséquences :

- **erreur de syntaxe** (virgule, guillemet, crochet) : tout le fichier est illisible. Le widget **conserve** les histoires déjà affichées et signale l'échec de synchronisation, jusqu'à correction sur GitHub ;
- **histoire invalide** (id non conforme, doublon, champ obligatoire manquant) : seule cette histoire est ignorée ;
- **champ facultatif invalide** (ex. `image_url` en `http://`, `lesson` qui n'est pas du texte) : seul ce champ est ignoré, l'histoire s'affiche.

## Diagnostic

**1. GitHub sert-il bien le fichier ?** Ouvrir l'adresse dans Safari ou lancer dans le Terminal :

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json
```

- `200` : le fichier est accessible ;
- `404` : nom de fichier, branche ou dépôt incorrect, ou dépôt **privé** (le widget ne peut lire qu'un dépôt public) ;
- pas de réponse : problème de connexion.

**2. Le JSON est-il valide ?**

```sh
curl -sS https://raw.githubusercontent.com/aaxxeell09/Success/main/stories.json | python3 -m json.tool > /dev/null && echo "JSON valide"
```

Le message d'erreur indique la ligne et la colonne fautives (`Expecting ',' delimiter: line 42 column 5`).

**3. Les histoires sont-elles conformes ?** Dans une copie locale du dépôt :

```sh
python3 tests/validate_stories.py
node -e "import('./widget/mur-des-retournements.widget/lib/sync.js').then(m => { const r = m.validateStories(JSON.parse(require('fs').readFileSync('stories.json', 'utf8'))); console.log(r.stories.length + ' valides', r.rejected, r.warnings); })"
```

`rejected` liste les histoires ignorées (index, id, raison), `warnings` les champs retirés ou textes tronqués.

**4. La modification est récente ?** Attendre 10 minutes (voir plus haut), puis rafraîchir les widgets depuis le menu d'Übersicht.

**5. Toujours rien ?** Ouvrir la console de débogage d'Übersicht (menu Übersicht, « Open Debug Console ») et chercher les erreurs réseau. Le message d'échec de synchronisation commence par `Réseau indisponible`, `Réponse HTTP`, `Délai dépassé`, `stories.json n'est pas un JSON valide` ou `Aucune histoire valide`.

**Vider le cache local** (rarement utile : le cache est remplacé à chaque synchronisation réussie) : dans la console de débogage, `localStorage.removeItem('mur-des-retournements-stories-cache-v2')`, puis rafraîchir.

## Choix de validation

- Un texte de plus de 2000 caractères est **tronqué** (terminé par « … ») plutôt que rejeté : mieux vaut afficher la personne avec un texte coupé que la faire disparaître. Un avertissement est produit.
- Un `id` de plus de 100 caractères est **rejeté** : le couper changerait l'identité de la personne.
- Une adresse de plus de 2000 caractères est retirée.
- Les champs inconnus sont ignorés (non transmis à l'affichage).
- `at25` suit les mêmes règles que les autres textes facultatifs (texte attendu, sinon retiré ; tronqué au delà de 2000 caractères) ; `at25_sources` suit celles de `sources` (adresses `http(s)://` valides, sans doublon, 20 au plus ; un tableau sans adresse valide est retiré).
- En cas de doublon d'`id`, la **première** histoire est gardée, les suivantes sont rejetées.
- Le cache n'est relu que s'il contient au moins une histoire valide ; un cache abîmé est simplement ignoré.

## Tests

```sh
node --test tests/*.test.mjs              # tests hors ligne
SYNC_LIVE=1 node --test tests/sync.test.mjs  # ajoute un appel réel à GitHub
```
