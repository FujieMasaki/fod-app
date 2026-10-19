"use client";

import { useMutation } from "@tanstack/react-query";
import type { DotSession } from "@/features/session";
import { createDot } from "../create-dot";

/**
 * 「今日のDot」を整理する更新系。サーバ処理は TanStack Query に集約する。
 * mockと暫定のPOSTは録音を使わない（正式な契約で送るのはTASK-011）。録音はmutationの入力（`variables`）にしない。
 * mutation cacheは、画面を離れても通信が終わるまで（pending）・終わった後も`gcTime`の間、入力を持ち続け、
 * Session Providerを消しても消えないため（journaling.md §2）。
 */
export const useCreateDot = () => {
  return useMutation<DotSession, Error, void>({ mutationFn: () => createDot() });
};
