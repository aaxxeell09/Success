#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$ROOT/widget/mur-des-retournements.widget"
DEST="$HOME/Library/Application Support/Übersicht/widgets/mur-des-retournements.widget"
if [[ ! -f "$SOURCE/mur-des-retournements.jsx" ]]; then
  echo "Fichiers du widget introuvables : $SOURCE"; exit 1
fi
mkdir -p "$DEST"
cp "$SOURCE/mur-des-retournements.jsx" "$DEST/mur-des-retournements.jsx"
cp "$SOURCE/stories.json" "$DEST/stories.json"
echo "Widget installé : $DEST"
if open -a 'Übersicht' 2>/dev/null; then
  echo "Übersicht est lancé. Configurez son raccourci d'interaction pour cliquer sur les boutons."
else
  echo "Installez Übersicht depuis https://tracesof.net/uebersicht/ puis lancez-le."
fi
printf '
Appuyez sur Entrée pour terminer...'; read -r _ || true
