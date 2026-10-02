#!/bin/sh
# Registers (or with --uninstall, removes) the launchd job that runs
# scripts/task-scheduler.sh from origin/main at 4:00 every day.
# Usage: scripts/install-task-scheduler.sh [--uninstall]
set -eu

label=com.focus-on-dot.task-scheduler
plist="$HOME/Library/LaunchAgents/$label.plist"
logs="$HOME/Library/Logs/focus-on-dot"
root=$(git -C "$(dirname -- "$0")" rev-parse --path-format=absolute --git-common-dir)
root=$(dirname -- "$root")

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$plist"
  echo "removed $label"
  exit 0
fi

mkdir -p "$logs" "$(dirname -- "$plist")"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>git -C "\$0" fetch -q origin main &amp;&amp; git -C "\$0" show origin/main:scripts/task-scheduler.sh | /bin/sh -s "\$0"</string>
    <string>$root</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer></dict>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>$logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$logs/launchd.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$plist"
echo "installed $label: runs daily at 4:00 for $root (logs: $logs)"
