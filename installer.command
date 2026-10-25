#!/bin/bash
# Installation du widget Übersicht « Le mur des retournements ».
#
# Double-cliquez sur ce fichier dans le Finder, ou lancez dans le Terminal :
#   bash installer.command
#
# Compatible avec le bash 3.2 fourni par macOS. Documentation : docs/INSTALLATION.md
#
# Variables d'environnement (surtout pour les tests) :
#   SUCCESS_NONINTERACTIVE=1  aucune question, aucun « open », aucun « osascript »
#   SUCCESS_ASSUME_YES=1      répondre « oui » à toutes les confirmations
#   SUCCESS_SKIP_OS_CHECK=1   ne pas vérifier que le système est macOS
#   SUCCESS_WIDGETS_DIR=...   dossier des widgets Übersicht à utiliser
#   SUCCESS_UBERSICHT_APP=... chemin de Übersicht.app (remplace la détection)
#
# Options :
#   --mise-a-jour   mode mise à jour (utilisé par mettre-a-jour.command)
#   --aide          affiche l'aide
set -euo pipefail

WIDGET_NAME="mur-des-retournements.widget"
APP_NAME="Übersicht"
BUNDLE_ID="tracesOf.Uebersicht"
DOWNLOAD_PAGE="https://tracesof.net/uebersicht/"
# Lien direct publié sur tracesof.net (vérifié le 25/10/2026). Le script lit
# d'abord la page officielle pour trouver la version la plus récente.
FALLBACK_ZIP_URL="https://tracesof.net/uebersicht/releases/Uebersicht-1.6.82.app.zip"
ACCESSIBILITY_URL="x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"

NONINTERACTIVE="${SUCCESS_NONINTERACTIVE:-0}"
ASSUME_YES="${SUCCESS_ASSUME_YES:-0}"
SKIP_OS_CHECK="${SUCCESS_SKIP_OS_CHECK:-0}"

ROOT="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$ROOT/widget/$WIDGET_NAME"
MODE="installation"
TMP_ROOT=""
APP_PATH=""
FIN_NORMALE=0

usage() {
  cat <<'AIDE'
Usage : installer.command [--mise-a-jour] [--aide]

Installe (ou réinstalle) le widget « mur-des-retournements.widget » dans le
dossier des widgets Übersicht, puis lance Übersicht.
Voir docs/INSTALLATION.md pour le détail.
AIDE
}

for arg in "$@"; do
  case "$arg" in
    --mise-a-jour|--update) MODE="mise-a-jour" ;;
    -h|--help|--aide) usage; exit 0 ;;
    *) printf 'Option inconnue : %s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- affichage
titre() { printf '\n== %s\n' "$*"; }
ok()    { printf '  ✓ %s\n' "$*"; }
ko()    { printf '  ✗ %s\n' "$*" >&2; }
warn()  { printf '  ! %s\n' "$*"; }
info()  { printf '    %s\n' "$*"; }

interactif() { [ "$NONINTERACTIVE" != "1" ]; }

# confirmer "Question" o|n  (o = oui par défaut)
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
  if interactif && [ "$MODE" = "installation" ]; then
    printf '\nAppuyez sur Entrée pour terminer...'
    read -r _ || true
    printf '\n'
  fi
}

tmp_root() {
  if [ -z "$TMP_ROOT" ]; then
    TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/success-installation.XXXXXX")"
  fi
  printf '%s\n' "$TMP_ROOT"
}

a_la_sortie() {
  local code=$?
  if [ -n "$TMP_ROOT" ] && [ -d "$TMP_ROOT" ]; then rm -rf "$TMP_ROOT"; fi
  if [ "$code" -ne 0 ] && [ "$FIN_NORMALE" != "1" ]; then
    ko "L'installation s'est arrêtée (code $code). Le widget déjà installé, s'il existe, n'a pas été modifié."
    info "Aide : docs/INSTALLATION.md, rubrique « Dépannage »."
    pause_finale
  fi
}
trap a_la_sortie EXIT

# python3 est absent des macOS récents sans les outils de ligne de commande :
# /usr/bin/python3 n'est alors qu'un raccourci qui ouvre une fenêtre
# d'installation. On ne l'utilise que s'il est réellement disponible.
python_disponible() {
  local p
  p="$(command -v python3 2>/dev/null || true)"
  [ -n "$p" ] || return 1
  if [ "$p" = "/usr/bin/python3" ] && [ "$(uname -s 2>/dev/null || true)" = "Darwin" ]; then
    xcode-select -p >/dev/null 2>&1 || return 1
  fi
  return 0
}

# ---------------------------------------------------------------- système
verifier_macos() {
  titre "Vérification du système"
  if [ "$SKIP_OS_CHECK" = "1" ]; then
    warn "Vérification de macOS ignorée (SUCCESS_SKIP_OS_CHECK=1)."
    return 0
  fi
  local os version majeur reste mineur
  os="$(uname -s 2>/dev/null || echo inconnu)"
  if [ "$os" != "Darwin" ]; then
    ko "Ce programme s'adresse à macOS (système détecté : $os)."
    exit 1
  fi
  version="$(sw_vers -productVersion 2>/dev/null || echo 0)"
  majeur="${version%%.*}"
  reste="${version#*.}"
  if [ "$reste" = "$version" ]; then reste=0; fi
  mineur="${reste%%.*}"
  case "$majeur" in ''|*[!0-9]*) majeur=0 ;; esac
  case "$mineur" in ''|*[!0-9]*) mineur=0 ;; esac

  if [ "$majeur" -lt 10 ] || { [ "$majeur" -eq 10 ] && [ "$mineur" -lt 12 ]; }; then
    ko "macOS $version détecté : Übersicht exige au minimum macOS 10.12 (Sierra)."
    info "Le widget ne pourra pas s'afficher sur ce Mac."
    if ! confirmer "Continuer quand même ?" n; then exit 3; fi
  elif [ "$majeur" -lt 12 ]; then
    warn "macOS $version détecté : la version actuelle d'Übersicht demande macOS 12 (Monterey) ou plus récent."
    info "Une ancienne version d'Übersicht déjà installée peut fonctionner, mais son installation automatique risque d'échouer."
  else
    ok "macOS $version"
  fi
}

# ---------------------------------------------------------------- Übersicht
trouver_app() {
  local c
  if [ -n "${SUCCESS_UBERSICHT_APP:-}" ]; then
    if [ -d "$SUCCESS_UBERSICHT_APP" ]; then printf '%s\n' "$SUCCESS_UBERSICHT_APP"; return 0; fi
    return 1
  fi
  for c in "/Applications/$APP_NAME.app" "$HOME/Applications/$APP_NAME.app"; do
    if [ -d "$c" ]; then printf '%s\n' "$c"; return 0; fi
  done
  if command -v mdfind >/dev/null 2>&1; then
    c="$(mdfind "kMDItemCFBundleIdentifier == '$BUNDLE_ID'" 2>/dev/null | head -n 1 || true)"
    if [ -n "$c" ] && [ -d "$c" ]; then printf '%s\n' "$c"; return 0; fi
  fi
  return 1
}

telecharger_ubersicht() {
  local page url dossier app cible
  page="$(curl -fsSL --max-time 30 "$DOWNLOAD_PAGE" 2>/dev/null || true)"
  url="$(printf '%s' "$page" | grep -Eo 'https://tracesof\.net/uebersicht/releases/Uebersicht-[0-9.]+\.app\.zip' | head -n 1 || true)"
  if [ -z "$url" ]; then url="$FALLBACK_ZIP_URL"; fi
  dossier="$(tmp_root)/app"
  mkdir -p "$dossier/x"
  info "Téléchargement : $url"
  if ! curl -fL --retry 2 --max-time 900 -o "$dossier/uebersicht.zip" "$url"; then
    ko "Téléchargement impossible (connexion ou adresse indisponible)."
    return 1
  fi
  if command -v ditto >/dev/null 2>&1; then
    ditto -x -k "$dossier/uebersicht.zip" "$dossier/x" || { ko "Archive illisible."; return 1; }
  else
    unzip -q "$dossier/uebersicht.zip" -d "$dossier/x" || { ko "Archive illisible."; return 1; }
  fi
  app="$(find "$dossier/x" -maxdepth 2 -type d -name '*.app' | head -n 1 || true)"
  if [ -z "$app" ]; then ko "Aucune application trouvée dans l'archive."; return 1; fi
  cible="/Applications"
  if [ ! -w "$cible" ]; then
    cible="$HOME/Applications"
    mkdir -p "$cible"
    warn "/Applications n'est pas modifiable : installation dans $cible"
  fi
  if ! mv "$app" "$cible/"; then ko "Impossible de copier l'application dans $cible."; return 1; fi
  ok "Übersicht installé dans $cible"
}

installer_ubersicht() {
  warn "Übersicht n'est pas installé (ni dans /Applications, ni dans ~/Applications)."
  if ! interactif; then
    info "Mode non interactif : installation de l'application ignorée."
    info "Téléchargez Übersicht depuis $DOWNLOAD_PAGE"
    return 1
  fi
  if command -v brew >/dev/null 2>&1; then
    if confirmer "Installer Übersicht avec Homebrew (brew install --cask ubersicht) ?" o; then
      if brew install --cask ubersicht; then return 0; fi
      ko "Homebrew n'a pas pu installer Übersicht."
    fi
  fi
  if command -v curl >/dev/null 2>&1; then
    if confirmer "Télécharger Übersicht depuis tracesof.net et l'installer dans /Applications ?" o; then
      if telecharger_ubersicht; then return 0; fi
    fi
  fi
  warn "Installation manuelle d'Übersicht :"
  info "1. Sur $DOWNLOAD_PAGE cliquez sur « Download »."
  info "2. Décompressez le fichier, glissez Übersicht.app dans le dossier Applications."
  info "3. Relancez ce programme."
  open "$DOWNLOAD_PAGE" >/dev/null 2>&1 || true
  return 1
}

verifier_ubersicht() {
  titre "Application Übersicht"
  if APP_PATH="$(trouver_app)"; then
    ok "Übersicht trouvé : $APP_PATH"
    return 0
  fi
  APP_PATH=""
  if installer_ubersicht && APP_PATH="$(trouver_app)"; then
    ok "Übersicht trouvé : $APP_PATH"
    return 0
  fi
  APP_PATH=""
  warn "Le widget sera tout de même copié : il s'affichera dès qu'Übersicht sera installé et lancé."
}

# ---------------------------------------------------------------- dossier des widgets
# Übersicht enregistre son dossier dans la préférence « widgetDirectory » sous
# forme d'URL archivée (NSKeyedArchiver), pas en texte brut : on la décode.
dossier_widgets() {
  local d=""
  if [ -n "${SUCCESS_WIDGETS_DIR:-}" ]; then
    printf '%s\n' "${SUCCESS_WIDGETS_DIR%/}"
    return 0
  fi
  if interactif && command -v osascript >/dev/null 2>&1; then
    d="$(osascript -l JavaScript 2>/dev/null <<'JXA' || true
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
r;
JXA
)"
  fi
  # shellcheck disable=SC2016  # code Python, pas de développement shell voulu
  if [ -z "$d" ] && command -v defaults >/dev/null 2>&1 && python_disponible; then
    d="$(defaults export "$BUNDLE_ID" - 2>/dev/null | python3 -I -c '
import plistlib, sys
from urllib.parse import unquote, urlparse
try:
    prefs = plistlib.loads(sys.stdin.buffer.read())
    archive = plistlib.loads(prefs["widgetDirectory"])
    for o in archive.get("$objects", []):
        if isinstance(o, str) and o.startswith("file://"):
            print(unquote(urlparse(o).path))
            break
except Exception:
    pass
' 2>/dev/null || true)"
  fi
  if [ -z "$d" ]; then d="$HOME/Library/Application Support/$APP_NAME/widgets"; fi
  printf '%s\n' "${d%/}"
}

# ---------------------------------------------------------------- validation
# Affiche un résumé ; code 0 = valide, 1 = invalide, 2 = aucun outil disponible.
valider_stories() {
  local fichier="$1"
  if python_disponible; then
    python3 -I - "$fichier" <<'PY'
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
except Exception as e:
    print("JSON illisible : %s" % e)
    sys.exit(1)
if not isinstance(data, list) or not data:
    print("la liste des histoires est vide ou absente")
    sys.exit(1)
n = 0
for item in data:
    if isinstance(item, dict) and all(isinstance(item.get(k), str) and item[k].strip() for k in ("id", "name", "lowest", "comeback")):
        n += 1
if n == 0:
    print("aucune histoire complète (id, name, lowest, comeback)")
    sys.exit(1)
print("%d histoire(s) valide(s) sur %d" % (n, len(data)))
PY
    return $?
  fi
  local js='
function verifier(texte) {
  var data;
  try { data = JSON.parse(texte); } catch (e) { return { ok: false, msg: "JSON illisible : " + e.message }; }
  if (!Array.isArray(data) || data.length === 0) return { ok: false, msg: "la liste des histoires est vide ou absente" };
  var n = 0;
  data.forEach(function (it) {
    if (it && typeof it === "object" && ["id", "name", "lowest", "comeback"].every(function (k) {
      return typeof it[k] === "string" && it[k].trim() !== "";
    })) n++;
  });
  if (n === 0) return { ok: false, msg: "aucune histoire complète (id, name, lowest, comeback)" };
  return { ok: true, msg: n + " histoire(s) valide(s) sur " + data.length };
}'
  if command -v node >/dev/null 2>&1; then
    node -e "$js
var r = verifier(require('fs').readFileSync(process.argv[1], 'utf8'));
console.log(r.msg); process.exit(r.ok ? 0 : 1);" "$fichier"
    return $?
  fi
  if interactif && command -v osascript >/dev/null 2>&1; then
    local sortie
    sortie="$(osascript -l JavaScript - "$fichier" 2>&1 <<JXA
ObjC.import("Foundation");
$js
function run(argv) {
  var s = \$.NSString.stringWithContentsOfFileEncodingError(argv[0], \$.NSUTF8StringEncoding, null);
  var r = verifier(ObjC.unwrap(s) || "");
  return (r.ok ? "OK " : "KO ") + r.msg;
}
JXA
)" || true
    case "$sortie" in
      "OK "*) printf '%s\n' "${sortie#OK }"; return 0 ;;
      "KO "*) printf '%s\n' "${sortie#KO }"; return 1 ;;
    esac
  fi
  printf 'aucun outil de validation disponible (python3, node ou osascript)\n'
  return 2
}

# ---------------------------------------------------------------- copie
verifier_copie() {
  local src="$1" dst="$2" f manquants=0
  while IFS= read -r f; do
    if ! cmp -s "$src/$f" "$dst/$f"; then
      ko "Fichier absent ou différent après copie : $f"
      manquants=$((manquants + 1))
    fi
  done <<EOF
$(cd "$src" && find . -type f ! -name '.DS_Store' | sed 's|^\./||')
EOF
  if [ -n "$(find "$dst" -name '.DS_Store' 2>/dev/null)" ]; then
    ko "Des fichiers .DS_Store ont été copiés."
    manquants=$((manquants + 1))
  fi
  [ "$manquants" -eq 0 ]
}

installer_widget() {
  local widgets="$1" dest attente copie ancien nb_fichiers
  dest="$widgets/$WIDGET_NAME"
  titre "Installation du widget"

  if [ ! -f "$SOURCE/mur-des-retournements.jsx" ] || [ ! -f "$SOURCE/stories.json" ]; then
    ko "Fichiers du widget introuvables dans : $SOURCE"
    info "Lancez ce programme depuis le dossier complet téléchargé (Success-main)."
    exit 1
  fi
  if [ ! -d "$SOURCE/photos" ]; then
    warn "Pas de dossier photos/ : les portraits seront chargés depuis Internet."
  fi

  local resume rc
  resume="$(valider_stories "$SOURCE/stories.json")" && rc=0 || rc=$?
  case "$rc" in
    0) ok "stories.json valide : $resume" ;;
    2) warn "stories.json non vérifié : $resume" ;;
    *) ko "stories.json invalide : $resume"
       info "Rien n'a été modifié. Retéléchargez le projet puis recommencez."
       exit 1 ;;
  esac

  mkdir -p "$widgets"
  # Dossier temporaire hors du dossier surveillé par Übersicht, sur le même
  # volume, pour que le remplacement final soit un simple renommage.
  attente="$(mktemp -d "$(dirname "$widgets")/.success-installation.XXXXXX" 2>/dev/null || true)"
  if [ -z "$attente" ]; then attente="$(mktemp -d "$widgets/.success-installation.XXXXXX")"; fi
  copie="$attente/$WIDGET_NAME"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude '.DS_Store' "$SOURCE/" "$copie/"
  else
    cp -R "$SOURCE" "$copie"
    find "$copie" -name '.DS_Store' -type f -exec rm -f {} +
  fi

  if ! verifier_copie "$SOURCE" "$copie"; then
    rm -rf "$attente"
    ko "La copie est incomplète : l'installation précédente est conservée."
    exit 1
  fi

  ancien=""
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    ancien="$attente/ancien"
    mv "$dest" "$ancien"
  fi
  if ! mv "$copie" "$dest"; then
    if [ -n "$ancien" ]; then mv "$ancien" "$dest"; fi
    rm -rf "$attente"
    ko "Impossible de placer le widget dans $widgets"
    exit 1
  fi
  rm -rf "$attente"

  if [ ! -f "$dest/mur-des-retournements.jsx" ] || [ ! -f "$dest/stories.json" ]; then
    ko "Fichiers clés absents après installation dans $dest"
    exit 1
  fi
  nb_fichiers="$(find "$dest" -type f | wc -l | tr -d ' ')"
  if [ -n "$ancien" ]; then
    ok "Widget mis à jour ($nb_fichiers fichiers) : $dest"
  else
    ok "Widget installé ($nb_fichiers fichiers) : $dest"
  fi

  if command -v xattr >/dev/null 2>&1; then
    if xattr -dr com.apple.quarantine "$dest" 2>/dev/null; then
      ok "Attribut de quarantaine retiré"
    else
      warn "Impossible de retirer la quarantaine (sans gravité si le widget s'affiche)."
    fi
  fi
}

# ---------------------------------------------------------------- démarrage automatique
expliquer_ouverture_manuelle() {
  info "Pour l'ajouter à la main :"
  info "  Réglages Système > Général > Ouverture > « + » > choisir Übersicht."
  info "Ou dans Übersicht : icône de la barre des menus > Preferences..."
  info "  > cocher « Launch Übersicht when I login »."
}

element_connexion() {
  titre "Démarrage automatique à l'ouverture de session"
  if [ -z "$APP_PATH" ]; then
    warn "Übersicht absent : démarrage automatique non configuré."
    expliquer_ouverture_manuelle
    return 0
  fi
  if ! interactif; then
    warn "Mode non interactif : élément de connexion non modifié."
    return 0
  fi
  if ! command -v osascript >/dev/null 2>&1; then
    warn "osascript indisponible : élément de connexion non modifié."
    expliquer_ouverture_manuelle
    return 0
  fi
  local liste rc
  liste="$(osascript -e 'tell application "System Events" to get the path of every login item' 2>&1)" && rc=0 || rc=$?
  if [ "$rc" -ne 0 ]; then
    warn "Lecture des éléments de connexion refusée : $liste"
    info "Autorisez le Terminal à piloter « System Events » :"
    info "  Réglages Système > Confidentialité et sécurité > Automatisation > Terminal."
    expliquer_ouverture_manuelle
    return 0
  fi
  # « bersicht » correspond aux deux formes Unicode possibles du « Ü ».
  case "$liste" in
    *bersicht.app*)
      ok "Übersicht est déjà dans les éléments de connexion"
      return 0 ;;
  esac
  local defaut="o"
  if [ "$MODE" = "mise-a-jour" ]; then defaut="n"; fi
  if ! confirmer "Lancer Übersicht automatiquement à chaque ouverture de session ?" "$defaut"; then
    info "Démarrage automatique non modifié."
    expliquer_ouverture_manuelle
    return 0
  fi
  local sortie
  sortie="$(osascript - "$APP_PATH" 2>&1 <<'AS'
on run argv
  tell application "System Events" to make login item at end with properties {path:(item 1 of argv), hidden:false}
end run
AS
)" && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    ok "Übersicht ajouté aux éléments de connexion"
  else
    ko "Ajout refusé par macOS : $sortie"
    case "$sortie" in
      *-1743*|*"not allowed"*|*"autoris"*)
        info "L'autorisation Automatisation a été refusée. Pour la donner :"
        info "  Réglages Système > Confidentialité et sécurité > Automatisation > Terminal > System Events." ;;
    esac
    expliquer_ouverture_manuelle
  fi
}

# ---------------------------------------------------------------- lancement
lancer_ubersicht() {
  titre "Lancement d'Übersicht"
  if [ -z "$APP_PATH" ]; then
    warn "Übersicht absent : rien à lancer."
    return 0
  fi
  if ! interactif; then
    warn "Mode non interactif : Übersicht n'est ni lancé ni rafraîchi."
    return 0
  fi
  local actif i
  actif="$(osascript -e "application id \"$BUNDLE_ID\" is running" 2>/dev/null || echo false)"
  if [ "$actif" != "true" ]; then
    if ! open -a "$APP_PATH"; then
      ko "Impossible de lancer Übersicht. Ouvrez-le depuis le dossier Applications."
      return 0
    fi
    i=0
    while [ "$i" -lt 20 ]; do
      actif="$(osascript -e "application id \"$BUNDLE_ID\" is running" 2>/dev/null || echo false)"
      if [ "$actif" = "true" ]; then break; fi
      sleep 1
      i=$((i + 1))
    done
    ok "Übersicht lancé"
    sleep 2
  else
    ok "Übersicht est déjà ouvert"
  fi
  if osascript -e "tell application id \"$BUNDLE_ID\" to refresh" >/dev/null 2>&1; then
    ok "Widgets rafraîchis"
  else
    info "Übersicht recharge seul le dossier des widgets ; sinon, menu Übersicht > Refresh All Widgets."
  fi
}

# ---------------------------------------------------------------- autorisations
expliquer_autorisations() {
  titre "Autorisations pour cliquer sur le widget"
  if [ "$MODE" = "mise-a-jour" ]; then
    info "Les réglages existants (raccourci d'interaction, Accessibilité) sont conservés."
    return 0
  fi
  info "Übersicht affiche le widget sur le bureau, derrière les fenêtres. Sans réglage,"
  info "les flèches et boutons ne réagissent pas aux clics. Il faut :"
  info "1. Raccourci d'interaction : icône Übersicht de la barre des menus > Preferences..."
  info "   > « Interaction Shortcut » : choisir une touche (par exemple ⌘ ou ⌥)."
  info "   Maintenez cette touche enfoncée pour cliquer sur le widget."
  info "2. Accessibilité : Réglages Système > Confidentialité et sécurité > Accessibilité"
  info "   > activer Übersicht (bouton « + » s'il n'est pas dans la liste)."
  info "3. Automatisation (facultatif) : seulement pour l'ajout automatique aux"
  info "   éléments de connexion depuis le Terminal."
  if interactif && confirmer "Ouvrir maintenant le panneau Accessibilité ?" o; then
    if open "$ACCESSIBILITY_URL" >/dev/null 2>&1; then
      ok "Panneau Accessibilité ouvert"
    else
      warn "Ouvrez-le à la main : Réglages Système > Confidentialité et sécurité > Accessibilité."
    fi
  fi
}

# ---------------------------------------------------------------- programme principal
if [ "$MODE" = "mise-a-jour" ]; then
  printf 'Le mur des retournements : mise à jour du widget\n'
else
  printf 'Le mur des retournements : installation du widget Übersicht\n'
fi

verifier_macos
verifier_ubersicht
WIDGETS_DIR="$(dossier_widgets)"
titre "Dossier des widgets"
ok "$WIDGETS_DIR"
installer_widget "$WIDGETS_DIR"
element_connexion
lancer_ubersicht
expliquer_autorisations

titre "Terminé"
ok "Le widget est en place : $WIDGETS_DIR/$WIDGET_NAME"
info "Les histoires se mettent à jour seules depuis GitHub toutes les 5 minutes."
info "Pour mettre à jour le code du widget : mettre-a-jour.command"
FIN_NORMALE=1
pause_finale
