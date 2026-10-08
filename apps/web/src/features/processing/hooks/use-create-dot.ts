"use client";

import { useMutation } from "@tanstack/react-query";
import type { DotSession, RecordedAudio } from "@/features/session";
import { createDot } from "../create-dot";

/**
 * 「今日のDot」を整理する更新系。サーバ処理は TanStack Query に集約する。
 * 録音（音声と録音時間）を受け取る。mockと暫定のPOSTは録音を使わず、正式な契約で送るのはTASK-011。
 * mutationは渡した録音（`variables`）を持つため、整理の画面を離れたらすぐcacheから消す（`gcTime: 0`）。
 * 既定の5分のままだと、整理の成功・利用者の切り替わりの後も音声がmemoryに残る（journaling.md §2）。
 */
export const useCreateDot = () => {
  return useMutation<DotSession, Error, RecordedAudio>({ mutationFn: () => createDot(), gcTime: 0 });
};
