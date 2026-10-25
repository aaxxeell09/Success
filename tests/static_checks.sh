#!/bin/bash
# Vérifications statiques minimales (reprend la « Validation minimale » de CLAUDE.md).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JSX="$ROOT/widget/mur-des-retournements.widget/mur-des-retournements.jsx"
FAIL=0
fail() { echo "ERREUR : $*" >&2; FAIL=1; }

shopt -s nullglob
for script in "$ROOT"/*.command "$ROOT"/scripts/*.sh; do
  bash -n "$script" || fail "syntaxe bash invalide : ${script#$ROOT/}"
done

grep -q 'aaxxeell09/Success' "$JSX" 2>/dev/null || fail "URL aaxxeell09/Success absente du JSX"
grep -q 'aaxxeell09/Success' "$ROOT/README.md" 2>/dev/null || fail "URL aaxxeell09/Success absente du README"

FORBIDDEN="spicy""x9"
HITS="$(grep -rIl --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=tests --exclude=CLAUDE.md "$FORBIDDEN" "$ROOT" 2>/dev/null || true)"
[ -z "$HITS" ] || fail "référence interdite au dépôt $FORBIDDEN : $HITS"

# Contrat v2 : plus de taille S/M/L dans le widget.
if grep -nE '\bSIZES?\b|Taille (S|M|L|petite|moyenne|grande)|Taille du widget' "$JSX" >/dev/null 2>&1; then
  fail "le JSX mentionne encore les tailles (SIZE/SIZES/« Taille ») : $(grep -nE '\bSIZES?\b|Taille ' "$JSX" | head -3 | tr '\n' ' ')"
fi

# Aperçu navigateur : même interface que le widget (sans titre, S/M/L ni crédit).
PREVIEW="$ROOT/preview/index.html"
if [ -f "$PREVIEW" ]; then
  grep -qi 'mur des retournements' "$PREVIEW" && fail "preview/index.html affiche encore « Mur des retournements »"
  grep -qE 'Photo :' "$PREVIEW" && fail "preview/index.html affiche encore un crédit « Photo : »"
  grep -qE '>\s*[SML]\s*</button>|data-size|Taille' "$PREVIEW" && fail "preview/index.html contient encore des boutons de taille S/M/L"
  NB="$(grep -o '<button' "$PREVIEW" | wc -l | tr -d ' ')"
  [ "$NB" = "3" ] || fail "preview/index.html : 3 boutons attendus, $NB trouvés"
  grep -q '\.\./stories\.json' "$PREVIEW" || fail "preview/index.html doit charger ../stories.json"
  # Contrat v3 : aperçu en anglais, mêmes libellés que le widget, taille fixe 350 x 490.
  for label in 'LOWEST POINT' 'TURNAROUND' 'AT 25' 'Previous person' 'Next person' 'Pause automatic rotation' 'Widget controls'; do
    grep -qF "$label" "$PREVIEW" || fail "preview/index.html : libellé « $label » absent"
  done
  for old in 'AU PLUS BAS' 'LE RETOURNEMENT' 'À 25 ANS' 'Personne' 'hors connexion' 'Portrait de' 'Commandes du widget' 'Reprendre la rotation'; do
    grep -qF "$old" "$PREVIEW" && fail "preview/index.html : ancien libellé français « $old »"
  done
  grep -q '<html lang="en">' "$PREVIEW" || fail "preview/index.html : <html lang=\"en\"> attendu"
  grep -q 'lang="fr"' "$PREVIEW" && fail "preview/index.html : lang=\"fr\" encore présent"
  grep -q 'data-role="content"' "$PREVIEW" || fail "preview/index.html : zone [data-role=content] absente"
  grep -qE -- '--card-width: *350px' "$PREVIEW" || fail "preview/index.html : largeur 350 px attendue"
  grep -qE -- '--card-height: *490px' "$PREVIEW" || fail "preview/index.html : hauteur 490 px attendue"

  grep -q -e '—' -e '–' "$PREVIEW" && fail "preview/index.html : tiret cadratin ou demi-cadratin"
else
  fail "preview/index.html introuvable"
fi

if [ "$FAIL" -ne 0 ]; then exit 1; fi
echo "OK: vérifications statiques"
