#!/bin/bash
# Désinstallation du widget Übersicht « Le mur des retournements ».
#
# Supprime uniquement le dossier « mur-des-retournements.widget » installé.
# Übersicht et les autres widgets ne sont jamais touchés.
#
# Variables d'environnement :
#   SUCCESS_NONINTERACTIVE=1     aucune question, aucun « open », aucun « osascript »
#   SUCCESS_ASSUME_YES=1         confirmer la suppression sans question
#   SUCCESS_WIDGETS_DIR=...      dossier des widgets Übersicht à utiliser
#   SUCCESS_REMOVE_LOGIN_ITEM=1  retirer aussi Übersicht des éléments de connexion
#
# Option : --retirer-ouverture  équivaut à SUCCESS_REMOVE_LOGIN_ITEM=1
set -euo pipefail

WIDGET_NAME="mur-des-retournements.widget"
APP_NAME="Übersicht"
BUNDLE_ID="tracesOf.Uebersicht"
NONINTERACTIVE="${SUCCESS_NONINTERACTIVE:-0}"
ASSUME_YES="${SUCCESS_ASSUME_YES:-0}"
RETIRER_OUVERTURE="${SUCCESS_REMOVE_LOGIN_ITEM:-0}"

for arg in "$@"; do
  case "$arg" in
    --retirer-ouverture) RETIRER_OUVERTURE=1 ;;
    -h|--help|--aide)
      printf 'Usage : desinstaller.command [--retirer-ouverture]\n'
      printf 'Supprime le widget mur-des-retournements.widget (Übersicht reste installé).\n'
      exit 0 ;;
    *) printf 'Option inconnue : %s\n' "$arg" >&2; exit 2 ;;
  esac
done

titre() { printf '\n== %s\n' "$*"; }
ok()    { printf '  ✓ %s\n' "$*"; }
ko()    { printf '  ✗ %s\n' "$*" >&2; }
warn()  { printf '  ! %s\n' "$*"; }
info()  { printf '    %s\n' "$*"; }
interactif() { [ "$NONINTERACTIVE" != "1" ]; }

confirmer() {
  local defaut="${2:-n}" reponse invite
  if [ "$ASSUME_YES" = "1" ]; then return 0; fi
  if ! interactif; then [ "$defaut" = "o" ]; return; fi
  if [ "$defaut" = "o" ]; then invite="O/n"; else invite="o/N"; fi
  printf '  ? %s [%s] ' "$1" "$invite"
  reponse=""
  read -r reponse || reponse=""
  if [ -z "$reponse" ]; then reponse="$defaut"; fi
  case "$reponse" in
    o|O|oui|Oui|OUI|y|Y|yes|Yes) return 0 ;;
    *) return 1 ;;
  esac
}

pause_finale() {
  if interactif; then
    printf '\nAppuyez sur Entrée pour terminer...'
    read -r _ || true
    printf '\n'
  fi
}

# Même logique que installer.command (préférence « widgetDirectory »).
dossier_widgets() {
  local d=""
  if [ -n "${SUCCESS_WIDGETS_DIR:-}" ]; then
    printf '%s\n' "${SUCCESS_WIDGETS_DIR%/}"
    return 0
  fi
  if interactif && command -v osascript >/dev/null 2>&1; then
    d="$(osascript -l JavaScript -e '
ObjC.import("Foundation");
var r = "";
try {
  var u = $.NSUserDefaults.alloc.initWithSuiteName("tracesOf.Uebersicht");
  var data = u.dataForKey("widgetDirectory");
  if (data && data.length > 0) {
    var url = $.NSKeyedUnarchiver.unarchiveObjectWithData(data);
    if (url && url.path) { r = ObjC.unwrap(url.path); }
  }
} catch (e) { r = ""; }
r;' 2>/dev/null || true)"
  fi
  if [ -z "$d" ]; then d="$HOME/Library/Application Support/$APP_NAME/widgets"; fi
  printf '%s\n' "${d%/}"
}

printf 'Le mur des retournements : désinstallation du widget\n'
WIDGETS_DIR="$(dossier_widgets)"
CIBLE="$WIDGETS_DIR/$WIDGET_NAME"

titre "Widget"
if [ ! -e "$CIBLE" ] && [ ! -L "$CIBLE" ]; then
  ok "Aucun widget installé dans $WIDGETS_DIR : rien à supprimer."
else
  info "Dossier à supprimer : $CIBLE"
  info "Übersicht et vos autres widgets ne seront pas modifiés."
  if confirmer "Supprimer ce dossier ?" n; then
    case "$(basename "$CIBLE")" in
      "$WIDGET_NAME") rm -rf "$CIBLE" ;;
      *) ko "Chemin inattendu, suppression annulée : $CIBLE"; exit 1 ;;
    esac
    if [ -e "$CIBLE" ]; then
      ko "Le dossier existe encore : $CIBLE"
      exit 1
    fi
    ok "Widget supprimé"
    if interactif && command -v osascript >/dev/null 2>&1; then
      osascript -e "tell application id \"$BUNDLE_ID\" to refresh" >/dev/null 2>&1 || true
    fi
  else
    warn "Suppression annulée : rien n'a été modifié."
    if ! interactif; then info "En mode non interactif, ajoutez SUCCESS_ASSUME_YES=1 pour confirmer."; fi
  fi
fi

titre "Démarrage automatique d'Übersicht"
if ! interactif; then
  if [ "$RETIRER_OUVERTURE" = "1" ]; then
    warn "Mode non interactif : l'élément de connexion n'est pas modifié (osascript désactivé)."
  else
    info "Élément de connexion non modifié."
  fi
elif ! command -v osascript >/dev/null 2>&1; then
  info "Élément de connexion non modifié."
else
  if [ "$RETIRER_OUVERTURE" = "1" ] || confirmer "Retirer aussi Übersicht des éléments de connexion (il ne démarrera plus seul) ?" n; then
    # Le nom peut être stocké avec un « Ü » composé ou décomposé : on compare
    # le chemin, qui se termine toujours par « bersicht.app ».
    if sortie="$(osascript 2>&1 <<'AS'
tell application "System Events"
  set n to 0
  repeat with li in (every login item)
    if (path of li as text) ends with "bersicht.app" then
      delete li
      set n to n + 1
    end if
  end repeat
  return n
end tell
AS
)"; then
      if [ "$sortie" = "0" ]; then ok "Übersicht n'était pas dans les éléments de connexion"; else ok "Élément de connexion retiré"; fi
    else
      ko "Modification refusée : $sortie"
      info "À la main : Réglages Système > Général > Ouverture > sélectionner Übersicht > « - »."
    fi
  else
    info "Élément de connexion conservé (Übersicht continuera de démarrer avec la session)."
  fi
fi

titre "Terminé"
info "Übersicht reste installé. Pour le supprimer : glissez Übersicht.app du dossier Applications à la Corbeille."
pause_finale
