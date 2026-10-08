#!/usr/bin/env bash
# 画面のスナップショット比較（VRT）を、公式のPlaywrightコンテナで実行する（docs/development/frontend.md「4. テスト」）。
# macOSとLinuxでは文字の描画が違うため、ローカルもCIもこのコンテナで基準画像を作り・比べる。
#
#   pnpm vrt                 比べる（差分があれば失敗し、apps/web/vrt/report に期待・実際・差分の画像を出す）
#   pnpm vrt:update          基準画像（apps/web/vrt/__screenshots__/）を作り直す
#   pnpm vrt -- --grep day   Playwrightの引数をそのまま渡す
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# イメージのタグは@playwright/testと同じ番号にする（ずれるとブラウザが合わず起動しない）。
version="$(node -p 'require("./apps/web/package.json").devDependencies["@playwright/test"]')"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "apps/web/package.json の @playwright/test は固定のバージョン（例: 1.63.0）にしてください: $version" >&2
  exit 1
fi
image="mcr.microsoft.com/playwright:v${version}-noble"

if ! docker info >/dev/null 2>&1; then
  echo "Dockerが起動していません。Docker Desktopなどを起動してから実行してください。" >&2
  exit 1
fi

# node_modulesはLinux用に入れ直す必要があるため、手元のものを使わずcheckoutごとのvolumeに置く
# （worktreeを並べて実行しても混ざらないよう、pathから名前を作る）。
key="$(printf '%s' "$root" | shasum | cut -c1-12)"

tty_flag=()
if [[ -t 1 ]]; then tty_flag=(-t); fi

docker run --rm --init --ipc=host ${tty_flag[@]+"${tty_flag[@]}"} \
  -e FOD_VRT_CONTAINER=1 \
  -e CI \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e LEFTHOOK=0 \
  -v "$root:/work" \
  -v "fod-vrt-${key}-root-modules:/work/node_modules" \
  -v "fod-vrt-${key}-web-modules:/work/apps/web/node_modules" \
  -v "fod-vrt-pnpm-store:/pnpm-store" \
  -w /work \
  "$image" \
  bash -c 'corepack enable && pnpm install --frozen-lockfile --store-dir /pnpm-store --reporter=silent && cd apps/web && pnpm exec playwright test "$@"' \
  vrt "$@"
