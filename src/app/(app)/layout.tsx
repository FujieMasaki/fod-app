import type { ReactNode } from "react";
import styles from "./app-frame.module.css";

/** モバイルファーストの端末フレーム。5 画面はこの中で一続きの体験になる。 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className={styles.frame}>{children}</div>;
}
