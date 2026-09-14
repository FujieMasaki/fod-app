import { dotSessionSchema, type DotSession } from "@/features/session";
import { sampleSession } from "@/mocks/sample-session";

/**
 * 整理結果を取得する（Repository 相当）。
 * 外部から受け取るデータは必ず Zod で検証してから返す。
 */
export async function createDot(): Promise<DotSession> {
  const dotApiUrl = import.meta.env.VITE_DOT_API_URL;
  // API 未設定時は体験検証用のモックを使う。本番では Hono などの外部 API を指定する。
  if (!dotApiUrl) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return dotSessionSchema.parse(sampleSession);
  }

  const res = await fetch(`${dotApiUrl}/dot`, { method: "POST" });
  if (!res.ok) {
    throw new Error("dot_creation_failed");
  }
  const json = await res.json();
  return dotSessionSchema.parse(json);
}
