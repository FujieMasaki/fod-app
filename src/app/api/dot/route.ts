import { NextResponse } from "next/server";
import { sampleSession } from "@/mocks/sample-session";

/**
 * モック: 音声 Blob を受け取り、整理結果を返す想定のエンドポイント。
 * Phase 1 は sampleSession を 2.5s ディレイで返す（Processing の「間」を体験検証）。
 */
export async function POST() {
  await new Promise((resolve) => setTimeout(resolve, 2500));
  return NextResponse.json(sampleSession);
}
