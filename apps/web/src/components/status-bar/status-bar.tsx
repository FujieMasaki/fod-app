import styles from "./status-bar.module.css";

/** 端末ステータスバーの再現（Phase 1 は固定表示 9:41）。 */
export function StatusBar() {
  return (
    <div className={styles.root} aria-hidden>
      <span>9:41</span>
      <span className={styles.icons}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="4.5" y="5" width="3" height="6" rx="1" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="13.5" y="0" width="3" height="11" rx="1" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
          <path d="M8 11.2 1 4.3a9.8 9.8 0 0 1 14 0L8 11.2Z" opacity="0.9" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none" stroke="currentColor">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" opacity="0.4" />
          <rect x="2" y="2" width="18" height="8" rx="1.5" fill="currentColor" stroke="none" />
          <rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
        </svg>
      </span>
    </div>
  );
}
