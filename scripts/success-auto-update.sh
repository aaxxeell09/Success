#!/bin/bash
# Success: opt-in hourly code updates from the user's GitHub repository.
set -euo pipefail
SUPPORT="$HOME/Library/Application Support/Success"
STATE="$SUPPORT/last-auto-update.sha"
WIDGETS="$HOME/Library/Application Support/Übersicht/widgets"
if [ -s "$SUPPORT/widgets-dir.txt" ]; then
  WIDGETS="$(cat "$SUPPORT/widgets-dir.txt")"
fi
UPDATER="$SUPPORT/mettre-a-jour.command"
CARD="$WIDGETS/mur-des-retournements.widget/mur-des-retournements.jsx"
[ -f "$UPDATER" ] && [ -f "$CARD" ] || exit 0
command -v curl >/dev/null 2>&1 || exit 0
JSON="$(curl -fsSL --max-time 20 --retry 1 \
  -H 'Accept: application/vnd.github+json' \
  -H 'User-Agent: Success-Widget-AutoUpdater' \
  'https://api.github.com/repos/aaxxeell09/Success/commits/main')" || exit 0
SHA="$(printf '%s\n' "$JSON" | awk -F '"' '/"sha":/ { print $4; exit }')"
printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{40}$' || exit 0
if [ -f "$STATE" ] && [ "$(cat "$STATE")" = "$SHA" ]; then exit 0; fi
POSITION="$(grep -m1 -E '^[[:space:]]*position:[[:space:]]*\{[[:space:]]*top:' "$CARD" || true)"
if SUCCESS_NONINTERACTIVE=1 SUCCESS_WIDGETS_DIR="$WIDGETS" bash "$UPDATER"; then
  if [ -n "$POSITION" ] && [ -f "$CARD" ] && command -v perl >/dev/null 2>&1; then
    SUCCESS_SAVED_POSITION="$POSITION" perl -0pi -e \
      's/^[ \t]*position:[ \t]*\{[^\n]*\},/$ENV{SUCCESS_SAVED_POSITION}/m' "$CARD"
  fi
  printf '%s\n' "$SHA" > "$STATE"
  /usr/bin/osascript -e 'tell application id "tracesOf.Uebersicht" to refresh' >/dev/null 2>&1 || true
fi
