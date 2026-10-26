#!/bin/bash
# Opt-in: schedule automatic Success widget updates with macOS launchd.
set -euo pipefail
if [ "$(uname -s)" != "Darwin" ]; then
  echo "This setup only works on macOS."; exit 1
fi
ROOT="$(cd "$(dirname "$0")" && pwd)"
SUPPORT="$HOME/Library/Application Support/Success"
AGENTS="$HOME/Library/LaunchAgents"
PLIST="$AGENTS/com.success.widget.autoupdate.plist"
LABEL="com.success.widget.autoupdate"
WIDGETS="$HOME/Library/Application Support/Übersicht/widgets"
if printenv SUCCESS_WIDGETS_DIR >/dev/null 2>&1; then WIDGETS="$SUCCESS_WIDGETS_DIR"; fi
if [ ! -d "$WIDGETS/mur-des-retournements.widget" ]; then
  echo "Success is not installed in: $WIDGETS"
  echo "Run installer.command first, or set SUCCESS_WIDGETS_DIR to your Übersicht widgets folder."
  exit 1
fi
mkdir -p "$SUPPORT" "$AGENTS"
cp "$ROOT/mettre-a-jour.command" "$SUPPORT/mettre-a-jour.command"
cp "$ROOT/scripts/success-auto-update.sh" "$SUPPORT/auto-update.sh"
chmod 700 "$SUPPORT/auto-update.sh"
printf '%s\n' "$WIDGETS" > "$SUPPORT/widgets-dir.txt"
xml_escape() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
RUNNER="$(xml_escape "$SUPPORT/auto-update.sh")"
OUT="$(xml_escape "$SUPPORT/auto-update.log")"
cat > "$PLIST" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>$RUNNER</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>$OUT</string>
  <key>StandardErrorPath</key><string>$OUT</string>
</dict></plist>
XML
/usr/bin/plutil -lint "$PLIST"
USER_DOMAIN="gui/$(id -u)"
launchctl bootout "$USER_DOMAIN" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "$USER_DOMAIN" "$PLIST"
echo "Automatic Success code updates enabled (hourly, while logged in)."
echo "Your locally customized widget position will be preserved."
echo "To stop: bash desactiver-maj-auto.command"
