#!/usr/bin/env bash
# 画面のスナップショット比較（VRT）を、公式のPlaywrightコンテナで実行する（docs/development/frontend.md「4. テスト」）。
# macOSとLinuxでは文字の描画が違うため、ローカルもCIもこのコンテナで基準画像を作り・比べる。
#
#   pnpm vrt                 比べる（差分があれば失敗し、apps/web/vrt/report に期待・実際・差分の画像を出す）
#   pnpm vrt:update          基準画像（apps/web/vrt/__screenshots__/）を作り直す
#   pnpm vrt --grep day      Playwrightの引数をそのまま渡す（`--`を挟むと渡らない）
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# イメージはdigestで固定する（同じタグが作り直されても、手元とCIで同じ中身を使うため。TASK-020 Plan Q6）。
# @playwright/testを上げたら、pinned_versionとdigestを
# `docker buildx imagetools inspect mcr.microsoft.com/playwright:v<版>-noble` のDigest（multi-archのindex）に更新する。
pinned_version="1.64.1"
digest="sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f"

version="$(node -p 'require("./apps/web/package.json").devDependencies["@playwright/test"]')"
if [[ "$version" != "$pinned_version" ]]; then
  echo "apps/web/package.json の @playwright/test（$version）と scripts/vrt.sh のイメージ（$pinned_version）が違います。" >&2
  echo "scripts/vrt.sh の pinned_version と digest を更新してください（ずれるとブラウザが合わず起動しません）。" >&2
  exit 1
fi
image="mcr.microsoft.com/playwright:v${pinned_version}-noble@${digest}"

if ! docker info >/dev/null 2>&1; then
  echo "Dockerが起動していません。Docker Desktopなどを起動してから実行してください。" >&2
  exit 1
fi

# Playwright 1.64のイメージのNodeはcorepackを同梱しないため、packageManagerの版のpnpmをnpmで直接入れる。
pnpm_version="$(node -p 'require("./package.json").packageManager.split("@")[1].split("+")[0]')"

# node_modulesはLinux用に入れ直す必要があるため、手元のものを使わずcheckoutごとのvolumeに置く
# （worktreeを並べて実行しても混ざらないよう、pathから名前を作る）。install scriptは実行しない
# （lefthookのpostinstallが、mountした手元の.git/hooksをコンテナの中から書き換えないようにするため）。
# native moduleはCPUの種類ごとに違うため、名前にCPUの種類も含める。
key="$(printf '%s' "$root" | shasum | cut -c1-12)-$(uname -m)"

tty_flag=()
if [[ -t 1 ]]; then tty_flag=(-t); fi

docker run --rm --init --ipc=host ${tty_flag[@]+"${tty_flag[@]}"} \
  -e FOD_VRT_CONTAINER=1 \
  -e CI \
  -e FOD_PNPM_VERSION="$pnpm_version" \
  -v "$root:/work" \
  -v "fod-vrt-${key}-root-modules:/work/node_modules" \
  -v "fod-vrt-${key}-web-modules:/work/apps/web/node_modules" \
  -v "fod-vrt-pnpm-store:/pnpm-store" \
  -w /work \
  "$image" \
  bash -c 'npm install -g --silent "pnpm@$FOD_PNPM_VERSION" && pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm-store --reporter=silent && cd apps/web && pnpm exec playwright test "$@"' \
  vrt "$@"
