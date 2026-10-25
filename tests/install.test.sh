#!/bin/bash
# Tests des scripts d'installation, exécutables sous Linux en simulant macOS.
# Ils ne remplacent PAS un essai sur un vrai Mac avec Übersicht.
#
#   bash tests/install.test.sh
#   BASH_BIN=/chemin/vers/bash-3.2 bash tests/install.test.sh   (bash de macOS)
set -euo pipefail

ICI="$(cd "$(dirname "$0")/.." && pwd)"
BASH_BIN="${BASH_BIN:-bash}"
T="$(mktemp -d "${TMPDIR:-/tmp}/success-install-test.XXXXXX")"
trap 'rm -rf "$T"' EXIT

REUSSIS=0
ECHECS=0
reussi() { REUSSIS=$((REUSSIS + 1)); printf '  ✓ %s\n' "$*"; }
echec()  { ECHECS=$((ECHECS + 1)); printf '  ✗ %s\n' "$*"; }
verifier() { # verifier "description" commande...
  local d="$1"; shift
  if "$@"; then reussi "$d"; else echec "$d"; fi
}
contient() { grep -qF -- "$2" "$1"; }
absent()   { ! grep -qF -- "$2" "$1"; }

# shellcheck disable=SC2016
printf 'Interpréteur testé : %s\n' "$("$BASH_BIN" -c 'echo "$BASH_VERSION"')"

# ------------------------------------------------------------ syntaxe
printf '\n== Syntaxe (bash -n)\n'
for f in "$ICI"/*.command; do
  verifier "bash -n $(basename "$f")" "$BASH_BIN" -n "$f"
done
for f in installer.command mettre-a-jour.command desinstaller.command; do
  verifier "$f est exécutable dans git" test "$(git -C "$ICI" ls-files -s "$f" | cut -c1-6)" = "100755"
done

# ------------------------------------------------------------ préparation
# Faux dépôt : copie des scripts + widget de démonstration complet.
REPO="$T/Success-main"
W="$REPO/widget/mur-des-retournements.widget"
mkdir -p "$W/lib" "$W/photos"
cp "$ICI/installer.command" "$ICI/mettre-a-jour.command" "$ICI/desinstaller.command" "$REPO/"
printf 'export const x = 1;\n' > "$W/mur-des-retournements.jsx"
cat > "$W/stories.json" <<'JSON'
[{"id":"a","name":"A B","lowest":"bas","comeback":"haut"},{"id":"b","name":"C D","lowest":"bas","comeback":"haut"}]
JSON
printf 'export const s = 1;\n' > "$W/lib/state.js"
printf 'export const y = 2;\n' > "$W/lib/sync.js"
printf '\377\330\377fausse photo' > "$W/photos/a.jpg"
printf 'finder' > "$W/.DS_Store"
printf 'finder' > "$W/photos/.DS_Store"
mkdir -p "$W/dossier avec espace"
printf 'ok' > "$W/dossier avec espace/fichier.txt"

# Faux binaires macOS : ils journalisent chaque appel.
STUBS="$T/stubs"
JOURNAL="$T/appels.log"
mkdir -p "$STUBS"
: > "$JOURNAL"
for b in open osascript xattr mdfind defaults brew; do
  cat > "$STUBS/$b" <<EOF
#!/bin/sh
echo "$b \$*" >> "$JOURNAL"
exit 0
EOF
  chmod +x "$STUBS/$b"
done
cat > "$STUBS/sw_vers" <<'EOF'
#!/bin/sh
echo "${FAKE_MACOS_VERSION:-14.5}"
EOF
chmod +x "$STUBS/sw_vers"
mkdir -p "$T/stub-darwin"
cat > "$T/stub-darwin/uname" <<'EOF'
#!/bin/sh
echo Darwin
EOF
chmod +x "$T/stub-darwin/uname"

FAUX_HOME="$T/home"
mkdir -p "$FAUX_HOME"
WIDGETS="$T/widgets"
mkdir -p "$WIDGETS"
printf 'autre widget\n' > "$WIDGETS/GettingStarted.jsx"
DEST="$WIDGETS/mur-des-retournements.widget"

lancer() { # lancer sortie script [args...] (variables d'environnement préfixées par l'appelant)
  local sortie="$1"; shift
  env HOME="$FAUX_HOME" PATH="$STUBS:$PATH" SUCCESS_NONINTERACTIVE=1 "$@" > "$sortie" 2>&1
}

arbre() { (cd "$1" && find . -type f | LC_ALL=C sort | while IFS= read -r f; do cksum "$f"; done); }

# ------------------------------------------------------------ installation
printf '\n== Installation non interactive\n'
code=0
lancer "$T/i1.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS" "$BASH_BIN" "$REPO/installer.command" || code=$?
verifier "code de sortie 0" test "$code" -eq 0
verifier "jsx copié" test -f "$DEST/mur-des-retournements.jsx"
verifier "stories.json copié" test -f "$DEST/stories.json"
verifier "lib/state.js et lib/sync.js copiés" test -f "$DEST/lib/state.js" -a -f "$DEST/lib/sync.js"
verifier "photos copiées" cmp -s "$W/photos/a.jpg" "$DEST/photos/a.jpg"
verifier "fichier dans un dossier avec espace copié" test -f "$DEST/dossier avec espace/fichier.txt"
verifier ".DS_Store exclus" test -z "$(find "$DEST" -name .DS_Store)"
verifier "autre widget intact" test -f "$WIDGETS/GettingStarted.jsx"
verifier "aucun dossier temporaire laissé" test -z "$(find "$T" -maxdepth 2 -name '.success-installation.*')"
verifier "message de validation stories.json" contient "$T/i1.out" "2 histoire(s) valide(s) sur 2"
verifier "quarantaine retirée (xattr appelé)" contient "$JOURNAL" "xattr -dr com.apple.quarantine $DEST"
verifier "aucun appel à open" absent "$JOURNAL" "open "
verifier "aucun appel à osascript" absent "$JOURNAL" "osascript"
verifier "pas de pause finale" absent "$T/i1.out" "Appuyez sur Entrée"
verifier "Übersicht signalé absent" contient "$T/i1.out" "Übersicht n'est pas installé"
ARBRE1="$(arbre "$DEST")"

printf '\n== Réinstallation idempotente\n'
printf 'ancien\n' > "$DEST/fichier-obsolete.js"
code=0
lancer "$T/i2.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS" "$BASH_BIN" "$REPO/installer.command" || code=$?
verifier "code de sortie 0" test "$code" -eq 0
verifier "fichier obsolète supprimé" test ! -e "$DEST/fichier-obsolete.js"
verifier "contenu identique à la première installation" test "$(arbre "$DEST")" = "$ARBRE1"
verifier "message « mis à jour »" contient "$T/i2.out" "Widget mis à jour"

printf '\n== Détection d Übersicht et dossier par défaut\n'
mkdir -p "$FAUX_HOME/Applications/Übersicht.app"
code=0
lancer "$T/i3.out" SUCCESS_SKIP_OS_CHECK=1 "$BASH_BIN" "$REPO/installer.command" || code=$?
DEFAUT="$FAUX_HOME/Library/Application Support/Übersicht/widgets/mur-des-retournements.widget"
verifier "code de sortie 0" test "$code" -eq 0
verifier "app trouvée dans ~/Applications" contient "$T/i3.out" "Übersicht trouvé : $FAUX_HOME/Applications/Übersicht.app"
verifier "dossier par défaut ~/Library/Application Support/Übersicht/widgets" test -f "$DEFAUT/stories.json"
verifier "Übersicht non lancé en mode non interactif" contient "$T/i3.out" "ni lancé ni rafraîchi"
code=0
lancer "$T/i3b.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS" SUCCESS_UBERSICHT_APP="$T/inexistant.app" "$BASH_BIN" "$REPO/installer.command" || code=$?
verifier "SUCCESS_UBERSICHT_APP inexistant : signalé absent" contient "$T/i3b.out" "Übersicht n'est pas installé"

printf '\n== Vérification de macOS (uname et sw_vers simulés)\n'
code=0
lancer "$T/o1.out" SUCCESS_WIDGETS_DIR="$WIDGETS" PATH="$T/stub-darwin:$STUBS:$PATH" FAKE_MACOS_VERSION=14.5 "$BASH_BIN" "$REPO/installer.command" || code=$?
verifier "macOS 14.5 accepté" test "$code" -eq 0
verifier "version affichée" contient "$T/o1.out" "✓ macOS 14.5"
code=0
lancer "$T/o2.out" SUCCESS_WIDGETS_DIR="$WIDGETS" PATH="$T/stub-darwin:$STUBS:$PATH" FAKE_MACOS_VERSION=10.15.7 "$BASH_BIN" "$REPO/installer.command" || code=$?
verifier "macOS 10.15 : avertissement mais installation" test "$code" -eq 0
verifier "avertissement macOS 12" contient "$T/o2.out" "demande macOS 12"
code=0
lancer "$T/o3.out" SUCCESS_WIDGETS_DIR="$WIDGETS" PATH="$T/stub-darwin:$STUBS:$PATH" FAKE_MACOS_VERSION=10.11.6 "$BASH_BIN" "$REPO/installer.command" || code=$?
verifier "macOS 10.11 refusé (code 3)" test "$code" -eq 3
verifier "message 10.12" contient "$T/o3.out" "au minimum macOS 10.12"
code=0
lancer "$T/o4.out" SUCCESS_WIDGETS_DIR="$WIDGETS" "$BASH_BIN" "$REPO/installer.command" || code=$?
if [ "$(uname -s)" != "Darwin" ]; then
  verifier "système non macOS refusé sans SUCCESS_SKIP_OS_CHECK" test "$code" -eq 1
fi

printf '\n== stories.json invalide : installation existante conservée\n'
ARBRE_AVANT="$(arbre "$DEST")"
cp "$W/stories.json" "$T/stories.ok"
printf '[{"id": "a",' > "$W/stories.json"
code=0
lancer "$T/v1.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS" "$BASH_BIN" "$REPO/installer.command" || code=$?
verifier "code de sortie non nul" test "$code" -ne 0
verifier "message d'erreur" contient "$T/v1.out" "stories.json invalide"
verifier "widget installé inchangé" test "$(arbre "$DEST")" = "$ARBRE_AVANT"
printf '[]' > "$W/stories.json"
code=0
lancer "$T/v2.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS" "$BASH_BIN" "$REPO/installer.command" || code=$?
verifier "liste vide refusée" test "$code" -ne 0
cp "$T/stories.ok" "$W/stories.json"

printf '\n== Source incomplète\n'
mv "$W/mur-des-retournements.jsx" "$T/jsx.bak"
code=0
lancer "$T/s1.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS" "$BASH_BIN" "$REPO/installer.command" || code=$?
verifier "jsx manquant : arrêt" test "$code" -ne 0
verifier "widget installé toujours présent" test -f "$DEST/mur-des-retournements.jsx"
mv "$T/jsx.bak" "$W/mur-des-retournements.jsx"

printf '\n== Installation du vrai widget du dépôt\n'
WIDGETS2="$T/widgets-reel"
code=0
lancer "$T/r1.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS2" "$BASH_BIN" "$ICI/installer.command" || code=$?
verifier "code de sortie 0" test "$code" -eq 0
verifier "copie conforme au dossier du dépôt (hors .DS_Store)" \
  test "$(cd "$ICI/widget/mur-des-retournements.widget" && find . -type f ! -name .DS_Store | LC_ALL=C sort | while IFS= read -r f; do cksum "$f"; done)" = "$(arbre "$WIDGETS2/mur-des-retournements.widget")"

# ------------------------------------------------------------ mise à jour
printf '\n== Mise à jour par ZIP (dossier non git)\n'
(cd "$T" && zip -qr "$T/main.zip" "Success-main" -x '*.DS_Store')
printf 'export const x = 2;\n' > "$T/nouveau.jsx"
mkdir -p "$T/zip2/Success-main"
cp -R "$REPO/." "$T/zip2/Success-main/"
cp "$T/nouveau.jsx" "$T/zip2/Success-main/widget/mur-des-retournements.widget/mur-des-retournements.jsx"
chmod -x "$T/zip2/Success-main/installer.command"
(cd "$T/zip2" && zip -qr "$T/main2.zip" "Success-main")
code=0
lancer "$T/m1.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS" SUCCESS_ZIP_URL="file://$T/main2.zip" "$BASH_BIN" "$REPO/mettre-a-jour.command" || code=$?
verifier "code de sortie 0" test "$code" -eq 0
verifier "nouveau code installé (même sans bit exécutable)" cmp -s "$T/nouveau.jsx" "$DEST/mur-des-retournements.jsx"
verifier "mode mise à jour annoncé" contient "$T/m1.out" "mise à jour du widget"
verifier "rappel : histoires synchronisées seules" contient "$T/m1.out" "les histoires se mettent à jour seules"
verifier "aucun dossier temporaire laissé" test -z "$(find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'success-mise-a-jour.*' -newer "$T/main2.zip" 2>/dev/null)"
code=0
lancer "$T/m2.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS" SUCCESS_ZIP_URL="file://$T/absent.zip" "$BASH_BIN" "$REPO/mettre-a-jour.command" || code=$?
verifier "ZIP introuvable : échec propre" test "$code" -ne 0
verifier "widget conservé après échec" cmp -s "$T/nouveau.jsx" "$DEST/mur-des-retournements.jsx"

printf '\n== Mise à jour par git pull --ff-only\n'
if command -v git >/dev/null 2>&1; then
  ORIGINE="$T/origine"
  mkdir -p "$ORIGINE"
  cp -R "$REPO/." "$ORIGINE/"
  rm -f "$ORIGINE/widget/mur-des-retournements.widget/.DS_Store" "$ORIGINE/widget/mur-des-retournements.widget/photos/.DS_Store"
  g() { git -c user.name=test -c user.email=test@example.invalid -c init.defaultBranch=main "$@"; }
  g -C "$ORIGINE" init -q
  g -C "$ORIGINE" add -A
  g -C "$ORIGINE" commit -qm initial
  g clone -q "$ORIGINE" "$T/clone"
  printf 'export const x = 3;\n' > "$ORIGINE/widget/mur-des-retournements.widget/mur-des-retournements.jsx"
  g -C "$ORIGINE" commit -qam v3
  code=0
  lancer "$T/g1.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS" SUCCESS_ZIP_URL="file://$T/absent.zip" "$BASH_BIN" "$T/clone/mettre-a-jour.command" || code=$?
  verifier "code de sortie 0" test "$code" -eq 0
  verifier "clone mis à jour" contient "$T/g1.out" "Mis à jour :"
  verifier "widget v3 installé" cmp -s "$ORIGINE/widget/mur-des-retournements.widget/mur-des-retournements.jsx" "$DEST/mur-des-retournements.jsx"
  printf 'local\n' > "$T/clone/widget/mur-des-retournements.widget/mur-des-retournements.jsx"
  g -C "$T/clone" commit -qam local
  printf 'export const x = 4;\n' > "$ORIGINE/widget/mur-des-retournements.widget/mur-des-retournements.jsx"
  g -C "$ORIGINE" commit -qam v4
  code=0
  lancer "$T/g2.out" SUCCESS_SKIP_OS_CHECK=1 SUCCESS_WIDGETS_DIR="$WIDGETS" "$BASH_BIN" "$T/clone/mettre-a-jour.command" || code=$?
  verifier "historique divergent : arrêt sans réinstaller" test "$code" -ne 0
  verifier "widget non remplacé par la version locale" test "$(cat "$DEST/mur-des-retournements.jsx")" = "export const x = 3;"
else
  printf '  - git absent : test ignoré\n'
fi

# ------------------------------------------------------------ désinstallation
printf '\n== Désinstallation\n'
: > "$JOURNAL"
code=0
lancer "$T/d1.out" SUCCESS_WIDGETS_DIR="$WIDGETS" "$BASH_BIN" "$REPO/desinstaller.command" || code=$?
verifier "sans SUCCESS_ASSUME_YES : rien supprimé" test -d "$DEST"
verifier "message d'annulation" contient "$T/d1.out" "Suppression annulée"
code=0
lancer "$T/d2.out" SUCCESS_WIDGETS_DIR="$WIDGETS" SUCCESS_ASSUME_YES=1 SUCCESS_REMOVE_LOGIN_ITEM=1 "$BASH_BIN" "$REPO/desinstaller.command" || code=$?
verifier "code de sortie 0" test "$code" -eq 0
verifier "widget supprimé" test ! -e "$DEST"
verifier "autre widget intact" test -f "$WIDGETS/GettingStarted.jsx"
verifier "dossier des widgets conservé" test -d "$WIDGETS"
verifier "aucun appel osascript/open" test ! -s "$JOURNAL"
code=0
lancer "$T/d3.out" SUCCESS_WIDGETS_DIR="$WIDGETS" SUCCESS_ASSUME_YES=1 "$BASH_BIN" "$REPO/desinstaller.command" || code=$?
verifier "deuxième désinstallation : rien à faire, code 0" test "$code" -eq 0
verifier "message « rien à supprimer »" contient "$T/d3.out" "rien à supprimer"

# ------------------------------------------------------------ textes
printf '\n== Typographie\n'
verifier "aucun tiret cadratin ni demi-cadratin" \
  test -z "$(grep -l "$(printf '\342\200\224')\|$(printf '\342\200\223')" "$ICI/installer.command" "$ICI/mettre-a-jour.command" "$ICI/desinstaller.command" "$ICI/docs/INSTALLATION.md" "$ICI/tests/install.test.sh" 2>/dev/null || true)"

printf '\nRésultat : %d réussi(s), %d échec(s)\n' "$REUSSIS" "$ECHECS"
printf 'Rappel : tests sous simulation ; aucun essai sur un vrai Mac avec Übersicht.\n'
if [ "$ECHECS" -ne 0 ]; then
  printf '\nSorties conservées pour diagnostic :\n'
  for f in "$T"/*.out; do printf -- '--- %s\n' "$(basename "$f")"; cat "$f"; done
  exit 1
fi
