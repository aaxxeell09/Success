#!/bin/bash
# Disable automatic Success code updates, leaving the widget installed.
set -euo pipefail
PLIST="$HOME/Library/LaunchAgents/com.success.widget.autoupdate.plist"
if [ -f "$PLIST" ]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  rm "$PLIST"
fi
echo "Success automatic code updates disabled. The widget remains installed."
