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

if [ "$FAIL" -ne 0 ]; then exit 1; fi
echo "OK: vérifications statiques"
