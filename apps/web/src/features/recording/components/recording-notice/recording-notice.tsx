import type { ReactNode } from "react";

import { Text } from "@/design-system";
import styles from "./recording-notice.module.css";

type RecordingNoticeProps = {
  title: string;
  description: string;
  /** 次の操作（Button）。先頭を主な操作にする */
  children: ReactNode;
};

/** 録音できなかった・録音が止まったときに、理由と次の操作を示す。利用者を責めない言い方にする。 */
export const RecordingNotice = ({ title, description, children }: RecordingNoticeProps) => {
  return (
    <div className={styles.root} role="alert">
      <div className={styles.body}>
        <Text variant="title" as="h1">
          {title}
        </Text>
        <Text variant="body" tone="secondary">
          {description}
        </Text>
      </div>
      <div className={styles.actions}>{children}</div>
    </div>
  );
};
