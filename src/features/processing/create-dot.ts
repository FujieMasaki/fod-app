import { dotSessionSchema, type DotSession } from "@/features/session";

/**
 * 整理結果を取得する（Repository 相当）。
 * 外部から受け取るデータは必ず Zod で検証してから返す。
 */
export async function createDot(): Promise<DotSession> {
  const res = await fetch("/api/dot", { method: "POST" });
  if (!res.ok) {
    throw new Error("dot_creation_failed");
  }
  const json = await res.json();
  return dotSessionSchema.parse(json);
}
