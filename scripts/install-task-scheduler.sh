#!/bin/sh
# Registers (or with --uninstall, removes) the launchd job that runs
# scripts/task-scheduler.sh from origin/main at 4:00 every day.
# FOD_TASK_MAX_PARALLEL, if set when installing, is passed on to the job.
# Usage: scripts/install-task-scheduler.sh [--uninstall]
set -eu

label=com.focus-on-dot.task-scheduler
plist="$HOME/Library/LaunchAgents/$label.plist"
logs="$HOME/Library/Logs/focus-on-dot"
root=$(git -C "$(dirname -- "$0")" rev-parse --path-format=absolute --git-common-dir)
root=$(dirname -- "$root")
parallel=${FOD_TASK_MAX_PARALLEL:-3}
case $parallel in
  '' | 0 | *[!0-9]*) echo "FOD_TASK_MAX_PARALLEL must be a positive integer" >&2; exit 64 ;;
esac
xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

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
    <string>if git -C "\$0" fetch -q origin main &amp;&amp; script=\$(git -C "\$0" show origin/main:scripts/task-scheduler.sh); then /bin/sh -c "\$script" task-scheduler "\$0"; else osascript -e 'display notification "定期実行のscriptを取得できませんでした。launchd.logを参照" with title "Focus on Dot タスク"'; exit 1; fi</string>
    <string>$(xml_escape "$root")</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer></dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>GIT_HTTP_LOW_SPEED_LIMIT</key><string>1000</string>
    <key>GIT_HTTP_LOW_SPEED_TIME</key><string>60</string>
    <key>FOD_TASK_MAX_PARALLEL</key><string>$parallel</string>
  </dict>
  <key>StandardOutPath</key><string>$(xml_escape "$logs")/launchd.log</string>
  <key>StandardErrorPath</key><string>$(xml_escape "$logs")/launchd.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$plist"
echo "installed $label: runs daily at 4:00 for $root, up to $parallel tasks (logs: $logs)"
