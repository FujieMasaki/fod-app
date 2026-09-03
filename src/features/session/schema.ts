import { z } from "zod";

/**
 * 「今日のDot」1 セッションのスキーマ。
 * 外部（API/AI 出力）から受け取るデータは必ず Zod で検証する。
 */
export const dotSessionSchema = z.object({
  id: z.string(),
  date: z.string(), // ISO
  durationSec: z.number(),
  sentence: z.string(), // 今日の一文（明朝で表示）
  reflection: z.array(z.string()), // 振り返り本文（段落配列）
  closing: z.string(),
});

export type DotSession = z.infer<typeof dotSessionSchema>;
