import { Text } from "@/design-system";
import styles from "./greeting-header.module.css";

/** 挨拶＋問いかけ。急かさず、そっと迎える。 */
export function GreetingHeader({ greeting }: { greeting: string }) {
  return (
    <div className={styles.root}>
      <Text variant="display" as="h1" suppressHydrationWarning>
        {greeting}
      </Text>
      <Text variant="body" tone="secondary">
        今日は、どんな一日でしたか？
      </Text>
    </div>
  );
}
