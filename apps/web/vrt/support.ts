import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { Page } from "@playwright/test";

/**
 * VRTで実行ごとに変わる要素を止める準備（TASK-020 Plan）。
 * - 時刻: Date.now / new Date を固定する（挨拶・期限の表示）。timerは止めない（React Queryの通知が止まるため）
 * - 通信: 自分のdev server以外への要求を止める。APIは fixtures.ts の応答だけを返す
 * - フォント: Google Fontsの代わりに、devDependenciesの同じ書体（@fontsource、OFL）を返す
 * - マイク: getUserMediaを応答しない形に差し替える。実際のマイクには触れず、録音画面は許可を待つ状態で止まる
 */

export const FIXED_TIME = new Date("2026-09-28T10:00:00+09:00");

const require = createRequire(import.meta.url);
const fontHost = "https://fonts.gstatic.com/vrt";

// Google Fontsの`family=Zen+Kaku+Gothic+New:wght@300;400;500`を、@fontsourceのCSSへ置き換える。
// index.htmlの書体・太さを変えて対応するファイルがなければ、別の書体で撮らないよう失敗させる。
const fontCss = async (cssUrl: URL): Promise<string> => {
  const parts: string[] = [];
  for (const family of cssUrl.searchParams.getAll("family")) {
    const [name, axis = ""] = family.split(":");
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const weights = axis.startsWith("wght@") ? axis.slice(5).split(";") : ["400"];
    const dir = path.dirname(require.resolve(`@fontsource/${slug}/package.json`));
    for (const weight of weights) {
      const css = await readFile(path.join(dir, `${weight}.css`), "utf8");
      // woff2だけを使い、置き場所をroute（下のfonts.gstatic.com）へ向ける。
      const replaced = css.replace(
        /src: url\(\.\/files\/([a-z0-9-]+\.woff2)\)[^;]*;/g,
        `src: url(${fontHost}/${slug}/$1) format('woff2');`,
      );
      // @fontsourceのCSSの形が変わって置き換えられなかったら、別の書体で撮らないよう失敗させる。
      if (replaced.includes("./files/")) throw new Error(`@fontsource/${slug}/${weight}.cssの形が想定と違う`);
      parts.push(replaced);
    }
  }
  return parts.join("\n");
};

const fontFile = (fileUrl: URL): string => {
  const match = /^\/vrt\/([a-z0-9-]+)\/([a-z0-9-]+\.woff2)$/.exec(fileUrl.pathname);
  if (!match) throw new Error(`想定外のフォントの要求: ${fileUrl.pathname}`);
  return path.join(path.dirname(require.resolve(`@fontsource/${match[1]}/package.json`)), "files", match[2]);
};

/** `/api/v1/...`のpath（query付き）ごとの応答 */
export type ApiFixtures = Record<string, unknown>;

/**
 * 画面を開く前に呼ぶ。返す配列には、想定外の要求（fixtureのないAPI、止めた外への通信、フォントを返せなかった
 * 要求）が入る。撮影後に空であることを確かめる（失敗しても画面は描画されうるため、ここで見落とさない）。
 */
export const preparePage = async (page: Page, api: ApiFixtures): Promise<string[]> => {
  const unexpected: string[] = [];

  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    if (devices) {
      Object.defineProperty(devices, "getUserMedia", { configurable: true, value: () => new Promise(() => {}) });
    }
  });

  // Playwrightは後に登録したrouteを先に使う。最後の手段として、外への要求をすべて止める。
  await page.route(
    (url) => url.hostname !== "127.0.0.1",
    async (route) => {
      unexpected.push(`blocked ${route.request().url()}`);
      await route.abort("blockedbyclient");
    },
  );
  await page.route("https://fonts.googleapis.com/css2?**", async (route) => {
    try {
      await route.fulfill({ contentType: "text/css", body: await fontCss(new URL(route.request().url())) });
    } catch (error) {
      unexpected.push(`font ${String(error)}`);
      await route.abort();
    }
  });
  await page.route(`${fontHost}/**`, async (route) => {
    try {
      await route.fulfill({ contentType: "font/woff2", body: await readFile(fontFile(new URL(route.request().url()))) });
    } catch (error) {
      unexpected.push(`font ${String(error)}`);
      await route.abort();
    }
  });
  // /auth/はViteのproxyへ流れるため、開いただけで呼ぶ画面がないことを確かめる（Googleのログインの開始など）。
  await page.route(
    (url) => url.pathname.startsWith("/auth/"),
    async (route) => {
      unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      await route.abort();
    },
  );
  await page.route(
    (url) => url.hostname === "127.0.0.1" && url.pathname.startsWith("/api/"),
    async (route) => {
    const url = new URL(route.request().url());
    const key = `${url.pathname}${url.search}`;
    if (route.request().method() !== "GET" || !(key in api)) {
      unexpected.push(`${route.request().method()} ${key}`);
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(api[key]) });
    },
  );

  return unexpected;
};

/** 撮影の直前に、使われている書体の読み込みが終わるまで待つ */
export const waitForFonts = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
};
