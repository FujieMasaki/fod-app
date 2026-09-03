import type { ReactNode } from "react";
import { StatusBar } from "@/components/status-bar/status-bar";
import { BottomNavigation, type TabKey } from "@/components/bottom-navigation/bottom-navigation";
import styles from "./screen-layout.module.css";

type ScreenLayoutProps = {
  children: ReactNode;
  /** 上部ヘッダー（AppHeader 等） */
  header?: ReactNode;
  /** TabBar を表示するタブ。フロー中（record/processing/dot）は渡さない。 */
  activeTab?: TabKey;
  /** 単一焦点画面は中央寄せ */
  center?: boolean;
};

/** StatusBar（固定）＋ヘッダー＋コンテンツ＋TabBar を組み立てる骨格。 */
export function ScreenLayout({ children, header, activeTab, center = false }: ScreenLayoutProps) {
  return (
    <div className={styles.screen}>
      <StatusBar />
      {header}
      <main className={[styles.content, center && styles.center].filter(Boolean).join(" ")}>
        {children}
      </main>
      {activeTab && <BottomNavigation active={activeTab} />}
    </div>
  );
}
