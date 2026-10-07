import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Spinner, Text } from "@/design-system";
import { ErrorState } from "@/components/error-state/error-state";
import { useAuth } from "@/features/auth";
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
export const ProcessingIndicator = () => {
  const navigate = useNavigate();
  const { setDotSession } = useSession();
  const { identityEpoch } = useAuth();
  const { mutate, status, data } = useCreateDot();
  // 整理を始めたときの利用者の世代。途中で利用者が切り替わったら、前の利用者の結果を保存・表示しない。
  const startedEpochRef = useRef(identityEpoch);

  const start = useCallback(() => {
    startedEpochRef.current = identityEpoch;
    mutate();
  }, [identityEpoch, mutate]);

  // アイドル時に一度だけ整理を開始する
  useEffect(() => {
    if (status === "idle") start();
  }, [status, start]);

  // 整理完了：結果をセッションへ確定し、静かに今日の一文へ委ねる
  useEffect(() => {
    if (status !== "success" || !data) return;
    if (startedEpochRef.current !== identityEpoch) {
      navigate({ to: "/", replace: true });
      return;
    }
    setDotSession(data);
    navigate({ to: "/dot", replace: true });
  }, [status, data, identityEpoch, setDotSession, navigate]);

  // 失敗の後に利用者が切り替わっていたら、新しい利用者に前の利用者の整理を再試行させずHomeへ戻す。
  const switchedAfterFailure = status === "error" && startedEpochRef.current !== identityEpoch;
  useEffect(() => {
    if (switchedAfterFailure) navigate({ to: "/", replace: true });
  }, [switchedAfterFailure, navigate]);

  if (status === "error") {
    return switchedAfterFailure ? null : <ErrorState onRetry={start} />;
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
};
