"use client";

import { useMutation } from "@tanstack/react-query";
import type { DotSession, RecordedAudio } from "@/features/session";
import { createDot } from "../create-dot";

/**
 * 「今日のDot」を整理する更新系。サーバ処理は TanStack Query に集約する。
 * 録音（音声と録音時間）を受け取る。mockと暫定のPOSTは録音を使わず、正式な契約で送るのはTASK-011。
 */
export const useCreateDot = () => {
  return useMutation<DotSession, Error, RecordedAudio>({ mutationFn: () => createDot() });
};
