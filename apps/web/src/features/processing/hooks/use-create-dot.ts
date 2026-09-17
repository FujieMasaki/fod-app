"use client";

import { useMutation } from "@tanstack/react-query";
import { createDot } from "../create-dot";

/** 「今日のDot」を整理する更新系。サーバ処理は TanStack Query に集約する。 */
export function useCreateDot() {
  return useMutation({ mutationFn: createDot });
}
