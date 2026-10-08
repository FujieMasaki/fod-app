import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  anonymousSession,
  authenticatedSession,
  dayList,
  pastDayDetail,
  todayWithDots,
  todayWithoutDots,
  todaysDots,
} from "./fixtures";
import { preparePage, waitForFonts, type ApiFixtures } from "./support";

/**
 * 主要な画面の見た目を基準画像と比べる（TASK-020）。幅はplaywright.config.tsのprojects（390px・1280px）。
 * readyは、データを読み込み終えた状態を示す要素。読み込み中の表示を基準画像にしないために待つ。
 */
type Screen = {
  name: string;
  path: string;
  api: ApiFixtures;
  ready: (page: Page) => Locator;
  /** 比べない部分。CPUの種類（手元のApple SiliconとCIのamd64）で描画が変わる要素だけに使う */
  mask?: (page: Page) => Locator[];
};

const signedIn = { "/api/v1/session": authenticatedSession };

const screens: Screen[] = [
  {
    name: "home",
    path: "/",
    api: { "/api/v1/session": anonymousSession },
    ready: (page) => page.getByText("話し始めるには、ログインしてください。"),
  },
  {
    name: "login",
    path: "/login",
    api: { "/api/v1/session": anonymousSession },
    ready: (page) => page.getByRole("heading", { name: "ログイン" }),
  },
  {
    // マイクの許可を待っている状態（support.tsのgetUserMediaは応答しない）。経過時間は00:00のまま。
    name: "record",
    path: "/record",
    api: signedIn,
    ready: (page) => page.getByRole("heading", { name: "話しています…" }),
    // 波形の棒は小数の拡縮（scaleY）で描くため、端の描画がCPUの種類で1px単位に変わる（threshold 0で検出される）。
    mask: (page) => [page.locator('[role="status"] + [aria-hidden="true"]')],
  },
  {
    name: "day",
    path: "/day",
    api: { ...signedIn, "/api/v1/days/today": todayWithDots },
    ready: (page) => page.getByText(todaysDots[0].sentence),
  },
  {
    name: "day-empty",
    path: "/day",
    api: { ...signedIn, "/api/v1/days/today": todayWithoutDots },
    ready: (page) => page.getByText("まだ今日のDotはありません。"),
  },
  {
    name: "day-list",
    path: "/dots",
    api: { ...signedIn, "/api/v1/days": dayList },
    ready: (page) => page.getByRole("list").getByRole("listitem").nth(dayList.items.length - 1),
  },
  {
    name: "day-detail",
    path: `/dots/${pastDayDetail.date}`,
    api: { ...signedIn, [`/api/v1/days/${pastDayDetail.date}`]: pastDayDetail },
    ready: (page) => page.getByText(pastDayDetail.dots[0].sentence),
  },
  {
    name: "settings",
    path: "/settings",
    api: signedIn,
    ready: (page) => page.getByText("vrt@example.com"),
  },
];

for (const screen of screens) {
  test(screen.name, async ({ page }) => {
    const unexpected = await preparePage(page, screen.api);
    await page.goto(screen.path);
    await expect(screen.ready(page)).toBeVisible();
    expect(await waitForFonts(page), "書体を読み込めなかった").toEqual([]);
    // 基準画像の更新（--update-snapshots）でも、撮影の前までに想定外の要求があった画面は基準にしない
    // （撮影の後の確認で失敗したときは、書かれた基準画像をコミットしない）。
    expect(unexpected, "想定外の要求があった").toEqual([]);

    // maskは何にも当たらなくても失敗しないため、画面の構造が変わって外れていないことを確かめる。
    const mask = screen.mask?.(page) ?? [];
    for (const locator of mask) await expect(locator).toHaveCount(1);

    await expect(page).toHaveScreenshot(`${screen.name}.png`, { fullPage: true, mask });
    expect(unexpected, "想定外の要求があった").toEqual([]);
  });
}
