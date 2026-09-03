"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner, Text } from "@/design-system";
import { ErrorState } from "@/components/error-state/error-state";
import { useSession } from "@/features/session";
import { useCreateDot } from "../../hooks/use-create-dot";
import styles from "./processing-indicator.module.css";

/**
 * 「静かに受け止め、整理している時間」。進捗バーは出さない。
 * 整理完了で Today's Dot へ自動遷移。失敗時は安心感を壊さない再実行導線を出す。
 *
 * ナビゲーションは mutate の per-call コールバックではなく mutation の状態で駆動する。
 * （StrictMode の二重マウント下でも確実に発火させるため）
 */
export function ProcessingIndicator() {
  const router = useRouter();
  const { setDotSession } = useSession();
  const { mutate, status, data } = useCreateDot();

  // アイドル時に一度だけ整理を開始する
  useEffect(() => {
    if (status === "idle") mutate();
  }, [status, mutate]);

  // 整理完了：結果をセッションへ確定し、静かに今日の一文へ委ねる
  useEffect(() => {
    if (status === "success" && data) {
      setDotSession(data);
      router.replace("/dot");
    }
  }, [status, data, setDotSession, router]);

  if (status === "error") {
    return <ErrorState onRetry={() => mutate()} />;
  }

  return (
    <div className={styles.root}>
      <div className={styles.heading} aria-live="polite">
        <Text variant="title" as="h1">
          {"今日のDotを\n整理しています…"}
        </Text>
        <Text variant="small" tone="tertiary">
          もう少しだけお待ちください
        </Text>
      </div>
      <Spinner size={28} label="今日のDotを整理しています" />
    </div>
  );
}
