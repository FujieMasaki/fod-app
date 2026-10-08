import { defineConfig, devices } from "@playwright/test";

/**
 * 画面のスナップショット比較（VRT）の設定。E2Eの基盤ではない（frontend.md「4. テスト」）。
 * macOSとLinuxでは文字の描画が違うため、基準画像は公式のPlaywrightコンテナでだけ作り・比べる
 * （scripts/vrt.sh）。コンテナの外で実行すると、基準画像と合わない結果になるため止める。
 */
if (process.env.FOD_VRT_CONTAINER !== "1") {
  throw new Error("VRTはコンテナで実行します。`pnpm vrt`（基準画像の更新は`pnpm vrt:update`）を使ってください。");
}

const port = 4173;

export default defineConfig({
  testDir: "./vrt",
  // コンテナでOSを固定するため、基準画像の名前にplatformを付けない。
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  outputDir: "./vrt/test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // 揺れをやり直しで隠さない。揺れたら原因（時刻・animation・fixture）を直す。
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "./vrt/report", open: "never" }]],
  expect: {
    toHaveScreenshot: {
      // 1pxの違いも失敗にする（TASK-020 Plan Q4）。thresholdは色の差の判定で、Playwrightの既定値。
      maxDiffPixelRatio: 0,
      threshold: 0.2,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
