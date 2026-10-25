# Installation sur Mac

Ce guide installe le widget « Le mur des retournements » dans [Übersicht](https://tracesof.net/uebersicht/), l'application gratuite qui affiche des widgets sur le bureau macOS. Ce n'est pas un widget Apple natif : il s'affiche sur le bureau, derrière les fenêtres.

> Les scripts ont été testés sous Linux en simulant macOS (`tests/install.test.sh`, y compris avec bash 3.2). Ils n'ont pas encore été essayés sur un vrai Mac : merci de signaler tout écart.

## 1. Prérequis

| Élément | Détail |
|---|---|
| macOS | **12 (Monterey) ou plus récent** pour la version actuelle d'Übersicht (1.6.82, indiquée « macOS 12+ » sur tracesof.net ; la formule Homebrew exige aussi macOS 12). Sur macOS 10.12 à 11, une ancienne version d'Übersicht déjà installée peut fonctionner, sans garantie. En dessous de 10.12, Übersicht ne fonctionne pas et l'installateur s'arrête. |
| Übersicht | Pas besoin de l'installer avant : `installer.command` le détecte et propose de l'installer (Homebrew, sinon téléchargement officiel). |
| Internet | Pour télécharger le projet, Übersicht, puis pour la synchronisation des histoires (le widget garde une copie locale hors ligne). |
| Compte | Un compte administrateur est préférable pour écrire dans `/Applications` (sinon Übersicht va dans `~/Applications`). |

Python, Git et les outils de développement Apple ne sont **pas** nécessaires.

## 2. Installation pas à pas

1. Ouvrez <https://github.com/aaxxeell09/Success>, bouton vert **Code** puis **Download ZIP**.
2. Ouvrez le fichier téléchargé `Success-main.zip` (Safari le décompresse souvent tout seul) : vous obtenez le dossier `Success-main` dans Téléchargements.
3. Dans ce dossier, **double-cliquez sur `installer.command`**. Une fenêtre Terminal s'ouvre et vous guide.
4. Répondez aux questions (Entrée = réponse proposée en majuscule) :
   - installer Übersicht s'il manque ;
   - lancer Übersicht à chaque ouverture de session ;
   - ouvrir le panneau Accessibilité.
5. Réglez le raccourci d'interaction (voir section 3) pour pouvoir cliquer sur les flèches.

### Si macOS bloque le double-clic (Gatekeeper)

Le fichier vient d'Internet et n'est pas signé par un développeur identifié, macOS peut refuser de l'ouvrir. Trois solutions, au choix :

- **macOS 14 et antérieurs** : clic droit (ou Contrôle + clic) sur `installer.command` puis **Ouvrir**, puis à nouveau **Ouvrir** dans la fenêtre d'avertissement.
- **macOS 15 et plus récents** (le clic droit ne suffit plus) : après le premier refus, ouvrez **Réglages Système > Confidentialité et sécurité**, descendez jusqu'au message concernant `installer.command`, cliquez **Ouvrir quand même**, confirmez avec votre mot de passe, puis relancez le fichier.
- **Par le Terminal, dans tous les cas** (Applications > Utilitaires > Terminal) :

  ```sh
  cd ~/Downloads/Success-main
  xattr -dr com.apple.quarantine .   # retire la quarantaine de tout le dossier
  bash installer.command             # fonctionne même sans bit exécutable
  ```

  Astuce : tapez `bash ` (avec l'espace) puis glissez `installer.command` depuis le Finder dans la fenêtre Terminal.

### Si le fichier « n'a pas les droits d'exécution »

Le ZIP produit par GitHub conserve le droit d'exécution des fichiers `.command` (vérifié : ils y sont enregistrés en `-rwxr-xr-x`), et l'utilitaire d'archive de macOS le respecte. Un autre outil de décompression peut toutefois le perdre. Dans ce cas, soit lancez `bash installer.command` comme ci-dessus, soit :

```sh
chmod +x ~/Downloads/Success-main/*.command
```

### Ce que fait `installer.command`

1. Vérifie que le système est macOS et sa version (`sw_vers`).
2. Cherche Übersicht dans `/Applications`, `~/Applications`, puis via Spotlight (identifiant `tracesOf.Uebersicht`). S'il manque : propose `brew install --cask ubersicht` si Homebrew est présent, sinon télécharge le ZIP officiel (lien lu sur <https://tracesof.net/uebersicht/>, par exemple `https://tracesof.net/uebersicht/releases/Uebersicht-1.6.82.app.zip`) et le place dans `/Applications` après confirmation, sinon ouvre la page de téléchargement.
3. Détermine le dossier des widgets : celui choisi dans les préférences d'Übersicht (préférence `widgetDirectory`), sinon `~/Library/Application Support/Übersicht/widgets`.
4. Vérifie `stories.json` (JSON lisible, au moins une histoire complète), avec python3 s'il est réellement installé, sinon node, sinon le JavaScript intégré à macOS (`osascript -l JavaScript`). Si le fichier est invalide, rien n'est modifié.
5. Copie le dossier **entier** `widget/mur-des-retournements.widget/` (code, `lib/`, `stories.json`, `photos/`) sans les `.DS_Store`, d'abord dans un dossier temporaire, contrôle chaque fichier, puis remplace l'ancienne version d'un seul coup. Une installation précédente n'est jamais laissée à moitié copiée. Les fichiers retirés du projet disparaissent aussi de la copie installée.
6. Retire l'attribut de quarantaine du widget installé.
7. Ajoute Übersicht aux éléments de connexion (si absent et si vous acceptez).
8. Lance Übersicht ou, s'il tourne déjà, rafraîchit les widgets.
9. Rappelle les autorisations nécessaires aux clics.

Relancer `installer.command` est sans risque : il réinstalle la même version à l'identique.

## 3. Autorisations : pouvoir cliquer sur le widget

Übersicht place les widgets au niveau du bureau : par défaut, les clics passent « à travers ». Sans les deux réglages suivants, les flèches ‹ › et le bouton pause **ne fonctionnent pas** (la rotation automatique et la synchronisation, elles, fonctionnent).

1. **Raccourci d'interaction** : cliquez sur l'icône Übersicht dans la barre des menus > **Preferences...** > **Interaction Shortcut**, et choisissez une touche (par exemple ⌘ ou ⌥). Ensuite, **maintenez cette touche enfoncée** pendant que vous cliquez sur le widget.
2. **Accessibilité** : **Réglages Système > Confidentialité et sécurité > Accessibilité**, activez **Übersicht** (bouton « + » s'il n'apparaît pas). L'installateur peut ouvrir ce panneau directement ; à la main, dans le Terminal :

   ```sh
   open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
   ```

   Après avoir coché la case, quittez et relancez Übersicht si les clics ne passent toujours pas.
3. **Automatisation** (facultatif) : lors de l'ajout aux éléments de connexion ou du rafraîchissement, macOS peut demander si « Terminal » peut contrôler « System Events » ou « Übersicht ». Acceptez. En cas de refus antérieur : **Réglages Système > Confidentialité et sécurité > Automatisation > Terminal**, cochez System Events et Übersicht.

## 4. Démarrage automatique

L'installateur propose d'ajouter Übersicht aux éléments de connexion (équivalent de `tell application "System Events" to make login item ... hidden:false`). macOS affiche alors une notification « élément de connexion ajouté ». Si l'autorisation Automatisation est refusée, deux voies manuelles :

- **Réglages Système > Général > Ouverture** (éléments de connexion) > **+** > choisir Übersicht dans Applications ;
- ou dans Übersicht : icône de la barre des menus > **Preferences...** > cocher **Launch Übersicht when I login**.

Le widget lui-même n'a rien à configurer : Übersicht charge automatiquement tout ce qui se trouve dans son dossier de widgets.

## 5. Mise à jour

- **Les histoires se mettent à jour toutes seules** : le widget relit `stories.json` sur GitHub toutes les 5 minutes. Aucun script n'est nécessaire pour voir une nouvelle personnalité.
- **Le code du widget** (affichage, photos embarquées, corrections) se met à jour avec **`mettre-a-jour.command`** (double-clic, mêmes règles Gatekeeper que ci-dessus) :
  - si le dossier est un clone Git, il exécute `git pull --ff-only` puis réinstalle ; en cas de modifications locales ou d'historique divergent, il s'arrête sans rien réinstaller ;
  - sinon, il télécharge `https://codeload.github.com/aaxxeell09/Success/zip/refs/heads/main` dans un dossier temporaire, le décompresse et lance son `installer.command --mise-a-jour`. Le dossier `Success-main` d'origine n'est pas modifié.
  - En mode mise à jour, l'élément de connexion déjà présent n'est pas recréé et les explications d'autorisations ne sont pas répétées.

## 6. Désinstallation

Double-cliquez sur **`desinstaller.command`**. Après confirmation, il supprime **uniquement** le dossier `mur-des-retournements.widget` du dossier des widgets. Übersicht et vos autres widgets restent en place. Il propose ensuite, en option, de retirer Übersicht des éléments de connexion (réponse par défaut : non). Pour supprimer Übersicht lui-même, glissez `Übersicht.app` à la Corbeille.

## 7. Dépannage

| Symptôme | Solution |
|---|---|
| « installer.command ne peut pas être ouvert » | Voir « Si macOS bloque le double-clic » : clic droit > Ouvrir, « Ouvrir quand même », ou `bash installer.command`. |
| « Permission refusée » / le fichier s'ouvre dans un éditeur | `chmod +x ~/Downloads/Success-main/*.command`, ou `bash installer.command`. |
| « Fichiers du widget introuvables » | Lancez le script depuis le dossier complet `Success-main` décompressé, pas depuis une copie isolée du fichier. |
| Une fenêtre propose d'installer les « outils de ligne de commande » | Vous pouvez refuser : les scripts n'en ont pas besoin et passent à une autre méthode. |
| Le widget n'apparaît pas | Vérifiez qu'Übersicht est lancé (icône dans la barre des menus), puis menu Übersicht > **Refresh All Widgets**. Vérifiez le dossier choisi dans Preferences > Widgets Folder : l'installateur l'utilise, mais s'il a changé depuis, relancez l'installateur. |
| Les boutons ne réagissent pas | Raccourci d'interaction maintenu enfoncé pendant le clic, et Übersicht coché dans Accessibilité (section 3). Relancez Übersicht après avoir coché. |
| Übersicht ne démarre pas avec la session | Section 4 (voie manuelle). |
| « Lecture des éléments de connexion refusée » ou erreur -1743 | Autorisation Automatisation refusée : section 3, point 3, ou voie manuelle de la section 4. |
| Le téléchargement d'Übersicht échoue | Téléchargez-le depuis <https://tracesof.net/uebersicht/>, glissez `Übersicht.app` dans Applications, relancez l'installateur. Avec Homebrew : `brew install --cask ubersicht`. |
| Pas de nouvelles histoires | Attendez 5 minutes, Mac en ligne et Übersicht lancé. Les histoires installées restent affichées hors ligne. |
| « stories.json invalide » | Le fichier téléchargé est abîmé ou a été modifié à la main : retéléchargez le ZIP. Rien n'a été modifié dans votre installation. |

## 8. Pour les développeurs : variables d'environnement

| Variable | Scripts | Effet |
|---|---|---|
| `SUCCESS_NONINTERACTIVE=1` | tous | Aucune question (`read`), aucun `open`, aucun `osascript`, pas de pause finale. |
| `SUCCESS_ASSUME_YES=1` | tous | Répond « oui » aux confirmations (nécessaire pour désinstaller en mode non interactif). |
| `SUCCESS_SKIP_OS_CHECK=1` | installer, mise à jour | Ne vérifie pas que le système est macOS. |
| `SUCCESS_WIDGETS_DIR=...` | tous | Dossier des widgets à utiliser. |
| `SUCCESS_UBERSICHT_APP=...` | installer, mise à jour | Chemin de `Übersicht.app` (remplace la détection). |
| `SUCCESS_ZIP_URL=...` | mise à jour | Adresse du ZIP du projet (accepte `file://`). |
| `SUCCESS_REMOVE_LOGIN_ITEM=1` | désinstaller | Retire aussi Übersicht des éléments de connexion (équivaut à `--retirer-ouverture`). |

Tests : `bash tests/install.test.sh` (et `BASH_BIN=/chemin/bash-3.2 bash tests/install.test.sh` pour le bash de macOS).
