#!/bin/sh
# Runs a Claude Code hook script with the project's runtimes. Hooks inherit the
# app's PATH, which may lack Node 22 (or resolve to an old Node) and rbenv.
# Usage: scripts/claude-hook.sh <script.mjs> [args...]
set -eu

for dir in "$HOME/.nodebrew/current/bin" "$HOME/.rbenv/shims" /opt/homebrew/bin /usr/local/bin; do
  [ -d "$dir" ] && PATH="$dir:$PATH"
done
export PATH

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
script=$1
shift
exec node "$script_dir/$script" "$@"
