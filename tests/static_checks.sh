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
  grep -q 'À 25 ANS' "$PREVIEW" || fail "preview/index.html : section « À 25 ANS » absente"
  grep -q -e '—' -e '–' "$PREVIEW" && fail "preview/index.html : tiret cadratin ou demi-cadratin"
else
  fail "preview/index.html introuvable"
fi

if [ "$FAIL" -ne 0 ]; then exit 1; fi
echo "OK: vérifications statiques"
