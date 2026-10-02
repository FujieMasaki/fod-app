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

root=$1
scheduler="$root/.claude/worktrees/scheduler"

git -C "$root" fetch -q origin main
if [ -d "$scheduler" ]; then
  git -C "$scheduler" checkout -q --detach origin/main
else
  git -C "$root" worktree add -q --detach "$scheduler" origin/main
fi

exec node "$scheduler/scripts/task-scheduler.mjs" run --root "$root"
