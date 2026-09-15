import type { DotSession } from "@/features/session";

/**
 * Phase 1 のダミーデータ（Phase 1 仕様 §6）。
 * 外部 API 未接続時にクライアントのモックが返す。
 */
export const sampleSession: DotSession = {
  id: "sess_2026_0708",
  date: "2026-07-08T21:40:00+09:00",
  durationSec: 28,
  sentence: "焦っていたのは、完璧にやりたい気持ちがあったから。",
  reflection: [
    "今日も、よく話してくれましたね。",
    "焦りのなかにいたのは、完璧にやりたいという、あなたの真剣さの裏返しでした。",
    "その気持ちは、どこから来たのでしょう。",
    "答えは、急がなくて大丈夫です。",
  ],
  closing: "今日はここまで。ゆっくり休んでください。",
};
