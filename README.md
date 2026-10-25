# Mur des retournements — Widget Übersicht pour macOS

Un véritable widget de bureau avec **portrait photographique**, **nom complet**, **le point le plus bas** et **le retournement** de personnalités inspirantes.

## Fonctions

- Flèches **‹ / ›** : parcourir les personnalités manuellement.
- **S / M / L** : régler la largeur de la carte (340 / 440 / 560 px). Le choix est conservé localement.
- **Ⅱ / ▶** : interrompre/reprendre la rotation automatique, toutes les **20 minutes**.
- Synchronisation toutes les **5 minutes** depuis [`stories.json`](./stories.json) sur la branche `main` de `aaxxeell09/Success`.
- Si GitHub est inaccessible, les histoires déjà installées restent disponibles.
- Portraits publics de Wikipédia récupérés via l'API `pageimages`. Un portrait manquant est remplacé par des initiales, **jamais** par une image générée.
- Les clics dans Übersicht nécessitent le **raccourci d'interaction** configuré dans l'application et les autorisations **Accessibilité** correspondantes (macOS).

## Installer sur Mac

1. Installer [Übersicht](https://tracesof.net/uebersicht/) et le lancer.
2. Télécharger le dépôt (Code → Download ZIP), le décompresser.
3. Double-cliquer sur **`installer.command`** (clic droit → Ouvrir si macOS le bloque).
4. Dans le menu Übersicht, régler un **Interaction Shortcut** et autoriser Übersicht dans **Réglages Système → Confidentialité et sécurité → Accessibilité**.
5. Activer le raccourci d'interaction pour cliquer sur les flèches et les boutons de taille.

> Ce widget n'est pas un widget Apple natif : Übersicht l'affiche **sur le bureau**, derrière les fenêtres. Le rendu n'a pas encore été testé sur un Mac réel.

## Ajouter une personne depuis GitHub

Ouvrir [`stories.json`](./stories.json) dans GitHub, cliquer sur le crayon et ajouter une entrée :

```json
{
  "id": "nouveau-nom",
  "name": "Prénom Nom",
  "category": "Domaine · Pays",
  "lowest": "Épreuve précise et vérifiable.",
  "comeback": "Résultat final précis et vérifiable.",
  "wikipedia": "Titre exact de la page Wikipédia en anglais",
  "lesson": "Une phrase à retenir."
}
```

Pour afficher une photo précise, ajoutez `"image_url"` avec une URL de photographie vérifiée et, si nécessaire, `"image_credit"` / `"image_source"` pour l’attribution. Une vraie photographie CC BY de Valdas Dambrauskas par Biser Todorov est déjà liée dans le projet ([source](https://commons.wikimedia.org/wiki/File:Valdas_Dambrauskas.jpg)).

**Attention** aux virgules entre entrées JSON ; ne pas dupliquer les `id`. Si la personne n'a pas de photo Wikipédia, on peut ajouter une URL photographique vérifiée avec le champ facultatif `image_url`.

Après le commit sur `main`, le widget rechargera les données en **5 minutes maximum environ** si le Mac est en ligne, Übersicht est lancé et GitHub accessible. Les nouveaux portraits Wikipédia peuvent prendre quelques secondes supplémentaires.

Les dimensions et la dernière carte sélectionnée sont mémorisées sur le Mac au moyen du stockage local de la vue Übersicht ; un changement de version d'Übersicht ou une réinitialisation de ses données peut les réinitialiser.

## Publier sur le dépôt GitHub existant

Double-cliquer sur **`publier-sur-github.command`**. Le script prépare trois commits atomiques (données, widget, installation) avant publication. Le script utilise [GitHub CLI](https://cli.github.com/) et peut demander une connexion GitHub interactive. Il pousse vers le dépôt **déjà créé** `aaxxeell09/Success` sur `main`. Si `main` existe déjà sur GitHub, il s’arrête sans écraser l’historique : confier la synchronisation à Claude Code. Il ne doit pas être lancé à l'intérieur d'un dépôt sans lien avec ce projet.

Pour les commits suivants, utiliser GitHub web ou `git add stories.json && git commit -m "data: ajouter une histoire" && git push` depuis le répertoire du dépôt.

## Organisation

- `stories.json` : source de vérité éditable.
- `widget/mur-des-retournements.widget/` : widget autonome à installer.
- `installer.command` : copie les fichiers dans le dossier des widgets Übersicht.
- `preview/index.html` : aperçu interactif du design, utilisable dans un navigateur.
- `publier-sur-github.command` : création et publication du dépôt via `gh`.
- `tests/validate_stories.py` : vérification de la structure et des IDs.

## Sécurité et droits des photographies

Les photos proviennent des pages Wikipédia publiques mais leurs **licences restent celles indiquées sur Commons**. Les droits doivent être vérifiés avant toute redistribution ; le widget se contente d'afficher des images liées aux pages. Aucun identifiant GitHub n'est demandé par le widget : la synchronisation est une lecture publique en HTTPS.
