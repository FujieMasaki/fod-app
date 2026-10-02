#!/bin/sh
# Entry point that launchd runs every morning (see scripts/install-task-scheduler.sh).
# launchd pipes this file from origin/main, so it and the Node script always run
# the latest merged version, whatever branch the main checkout is on.
# Usage: scripts/task-scheduler.sh <repository root>
set -eu

for dir in "$HOME/.nodebrew/current/bin" "$HOME/.rbenv/shims" "$HOME/.local/bin" /opt/homebrew/bin /usr/local/bin; do
  [ -d "$dir" ] && PATH="$dir:$PATH"
done
export PATH

# A silent failure would look the same as a morning with nothing to start.
notify_failure() {
  status=$?
  # 0 is success; 3 means scripts/task-scheduler.mjs already notified.
  case $status in 0 | 3) return ;; esac
  osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "Focus on Dot タスク"' -e 'end run' \
    "定期実行を開始できませんでした（終了コード${status}）。~/Library/Logs/focus-on-dot/launchd.log を参照" || true
}
trap notify_failure EXIT

# Give up on a stalled fetch instead of hanging until the next morning.
export GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=60

root=$1
scheduler="$root/.claude/worktrees/scheduler"

git -C "$root" fetch -q origin main
git -C "$root" worktree prune
# Check for .git, not the directory: git run in a leftover directory would
# climb up to the main checkout and detach it.
if [ -e "$scheduler/.git" ]; then
  git -C "$scheduler" checkout -q --detach origin/main
else
  rm -rf "$scheduler"
  git -C "$root" worktree add -q --detach "$scheduler" origin/main
fi

node "$scheduler/scripts/task-scheduler.mjs" run --root "$root"
