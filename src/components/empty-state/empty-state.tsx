import { Button, Text } from "@/design-system";
import styles from "./empty-state.module.css";

type EmptyStateProps = {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * まだ記録が無いときの静かな受け皿。急かさず、話し始める入口へそっと戻す。
 */
export function EmptyState({
  title = "まだ今日のDotがありません。",
  description = "今日をひとつ、話すことから始まります。",
  actionLabel = "ホームへ",
  onAction,
}: EmptyStateProps) {
  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <Text variant="title" align="center">
          {title}
        </Text>
        <Text variant="body" tone="secondary" align="center">
          {description}
        </Text>
      </div>
      {onAction && (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
