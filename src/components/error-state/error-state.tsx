import { Button, Text } from "@/design-system";
import styles from "./error-state.module.css";

type ErrorStateProps = {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
};

/**
 * 失敗時もユーザーを責めず、不安にさせない。技術用語は出さない。
 * 再実行の導線を用意する（Architecture Guide §20）。
 */
export function ErrorState({
  title = "今日のDotをうまく整理できませんでした。",
  description = "音声は保存されています。もう一度試してください。",
  retryLabel = "もう一度",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className={styles.root} role="alert">
      <div className={styles.body}>
        <Text variant="title" align="center">
          {title}
        </Text>
        <Text variant="body" tone="secondary" align="center">
          {description}
        </Text>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
