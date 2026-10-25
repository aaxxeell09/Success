#!/bin/bash
# Mise à jour du CODE du widget Übersicht « Le mur des retournements ».
#
# Inutile pour les histoires : le widget relit stories.json sur GitHub toutes
# les 5 minutes, sans ce programme. Il ne sert qu'à récupérer une nouvelle
# version du widget (affichage, photos embarquées, corrections).
#
# Fonctionnement :
#   - si ce dossier est un clone git : « git pull --ff-only » puis réinstallation ;
#   - sinon : téléchargement du ZIP de la branche main dans un dossier temporaire,
#     puis installer.command --mise-a-jour depuis ce ZIP.
#
# Variables d'environnement :
#   SUCCESS_NONINTERACTIVE, SUCCESS_ASSUME_YES, SUCCESS_SKIP_OS_CHECK,
#   SUCCESS_WIDGETS_DIR, SUCCESS_UBERSICHT_APP : transmises à installer.command
#   SUCCESS_ZIP_URL=...  adresse du ZIP (tests ; par défaut la branche main)
set -euo pipefail

ZIP_URL="${SUCCESS_ZIP_URL:-https://codeload.github.com/aaxxeell09/Success/zip/refs/heads/main}"
NONINTERACTIVE="${SUCCESS_NONINTERACTIVE:-0}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
TMP_ROOT=""

titre() { printf '\n== %s\n' "$*"; }
ok()    { printf '  ✓ %s\n' "$*"; }
ko()    { printf '  ✗ %s\n' "$*" >&2; }
warn()  { printf '  ! %s\n' "$*"; }
info()  { printf '    %s\n' "$*"; }
interactif() { [ "$NONINTERACTIVE" != "1" ]; }

pause_finale() {
  if interactif; then
    printf '\nAppuyez sur Entrée pour terminer...'
    read -r _ || true
    printf '\n'
  fi
}

a_la_sortie() {
  local code=$?
  if [ -n "$TMP_ROOT" ] && [ -d "$TMP_ROOT" ]; then rm -rf "$TMP_ROOT"; fi
  if [ "$code" -ne 0 ]; then
    ko "Mise à jour interrompue (code $code). Le widget installé n'a pas été modifié."
    pause_finale
  fi
}
trap a_la_sortie EXIT

# Sur macOS, /usr/bin/git sans les outils de ligne de commande n'est qu'un
# raccourci qui propose leur installation : on ne l'utilise pas dans ce cas.
git_disponible() {
  local g
  g="$(command -v git 2>/dev/null || true)"
  [ -n "$g" ] || return 1
  if [ "$g" = "/usr/bin/git" ] && [ "$(uname -s 2>/dev/null || true)" = "Darwin" ]; then
    xcode-select -p >/dev/null 2>&1 || return 1
  fi
  return 0
}

printf 'Le mur des retournements : mise à jour du code du widget\n'
info "Rappel : les histoires se mettent à jour seules (toutes les 5 minutes)."
info "Ce programme ne sert qu'aux nouvelles versions du widget lui-même."

INSTALLEUR=""
if git_disponible && [ "$(git -C "$ROOT" rev-parse --is-inside-work-tree 2>/dev/null || true)" = "true" ] \
   && [ "$(cd "$(git -C "$ROOT" rev-parse --show-toplevel)" && pwd)" = "$ROOT" ]; then
  titre "Mise à jour du clone git"
  avant="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo '?')"
  if ! git -C "$ROOT" pull --ff-only; then
    ko "« git pull --ff-only » a échoué (modifications locales ou historique divergent)."
    info "Rien n'a été réinstallé. Vérifiez « git status » dans $ROOT."
    exit 1
  fi
  apres="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo '?')"
  if [ "$avant" = "$apres" ]; then ok "Déjà à jour ($apres)"; else ok "Mis à jour : $avant > $apres"; fi
  INSTALLEUR="$ROOT/installer.command"
else
  titre "Téléchargement de la dernière version"
  if ! command -v curl >/dev/null 2>&1; then ko "curl est introuvable."; exit 1; fi
  TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/success-mise-a-jour.XXXXXX")"
  info "Source : $ZIP_URL"
  if ! curl -fsSL --retry 2 --max-time 300 -o "$TMP_ROOT/success.zip" "$ZIP_URL"; then
    ko "Téléchargement impossible. Vérifiez la connexion Internet."
    exit 1
  fi
  mkdir -p "$TMP_ROOT/x"
  if command -v ditto >/dev/null 2>&1; then
    ditto -x -k "$TMP_ROOT/success.zip" "$TMP_ROOT/x"
  elif command -v unzip >/dev/null 2>&1; then
    unzip -q "$TMP_ROOT/success.zip" -d "$TMP_ROOT/x"
  else
    ko "Ni ditto ni unzip disponibles pour décompresser l'archive."
    exit 1
  fi
  INSTALLEUR="$(find "$TMP_ROOT/x" -maxdepth 2 -type f -name installer.command | head -n 1 || true)"
  if [ -z "$INSTALLEUR" ]; then ko "installer.command absent de l'archive téléchargée."; exit 1; fi
  ok "Archive téléchargée et décompressée"
fi

titre "Réinstallation du widget"
if [ ! -f "$INSTALLEUR" ]; then ko "Introuvable : $INSTALLEUR"; exit 1; fi
# bash explicite : le bit exécutable peut manquer après décompression.
bash "$INSTALLEUR" --mise-a-jour

if [ -n "$TMP_ROOT" ]; then
  info "Ce dossier ($ROOT) n'a pas été modifié : seule la copie installée dans Übersicht est à jour."
fi
trap - EXIT
if [ -n "$TMP_ROOT" ] && [ -d "$TMP_ROOT" ]; then rm -rf "$TMP_ROOT"; fi
ok "Mise à jour terminée"
pause_finale
