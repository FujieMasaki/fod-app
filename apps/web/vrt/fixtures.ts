import {
  dayDetailSchema,
  dayListSchema,
  sessionSchema,
  todaySchema,
  type Dot,
} from "../src/libs/api-contract/schemas";

/**
 * VRTでAPIの代わりに返す応答。すべて架空のテスト用データで、実在の個人データ・音声由来の内容を入れない
 * （privacy.md）。契約から外れた応答で基準画像を作らないよう、契約のschemaで検証してから使う。
 * 日付は support.ts の固定時刻（2026-09-28 10:00 JST）に合わせる。
 */

const dot = (id: string, date: string, startedAt: string, sentence: string, summary: string): Dot => ({
  id,
  date,
  started_at: startedAt,
  duration_seconds: 95,
  sentence,
  summary,
});

export const todaysDots = [
  dot(
    "6f1c2a4e-0b7d-4c1e-9a53-2d8e4b6f1a01",
    "2026-09-28",
    "2026-09-28T00:40:00Z",
    "思っていたより、ちゃんと休めた朝だった。",
    "いつもより少し早く起きて、温かいお茶を飲んだ。急がずに支度ができた。",
  ),
  dot(
    "6f1c2a4e-0b7d-4c1e-9a53-2d8e4b6f1a02",
    "2026-09-28",
    "2026-09-27T23:15:00Z",
    "少し早く起きられた。",
    "",
  ),
];

const pastDots = [
  dot(
    "6f1c2a4e-0b7d-4c1e-9a53-2d8e4b6f1a03",
    "2026-09-26",
    "2026-09-26T12:30:00Z",
    "予定がひとつ流れて、散歩に出た。",
    "午後の予定がなくなったので、近くの川沿いを歩いた。風が涼しかった。",
  ),
  dot(
    "6f1c2a4e-0b7d-4c1e-9a53-2d8e4b6f1a04",
    "2026-09-26",
    "2026-09-26T01:05:00Z",
    "今日は、ひとつずつ片付けたい。",
    "やることが多く見えたので、書き出して順番を決めた。",
  ),
];

export const anonymousSession = sessionSchema.parse({ authenticated: false, csrf_token: "vrt-csrf-token" });

export const authenticatedSession = sessionSchema.parse({
  authenticated: true,
  csrf_token: "vrt-csrf-token",
  expires_at: "2026-10-28T01:00:00Z",
  user: {
    id: "0a6e1c9b-3f2d-4b8a-8c1e-5d7f9e2b4c60",
    email: "vrt@example.com",
    email_confirmed: true,
    sign_in_methods: ["password"],
  },
  account_status: "active",
});

export const todayWithDots = todaySchema.parse({ date: "2026-09-28", dot_count: 2, latest_dot: todaysDots[0] });

export const todayWithoutDots = todaySchema.parse({ date: "2026-09-28", dot_count: 0 });

export const dayList = dayListSchema.parse({
  today: "2026-09-28",
  items: [
    { date: "2026-09-28", dot_count: 2, latest_dot_id: todaysDots[0].id },
    { date: "2026-09-26", dot_count: 2, latest_dot_id: pastDots[0].id },
  ],
  next_cursor: null,
});

export const pastDayDetail = dayDetailSchema.parse({ date: "2026-09-26", dots: pastDots, next_cursor: null });
