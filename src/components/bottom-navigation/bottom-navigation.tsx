import Link from "next/link";
import {
  Text,
  HomeIcon,
  JournalIcon,
  DotIcon,
  SettingsIcon,
} from "@/design-system";
import styles from "./bottom-navigation.module.css";

export type TabKey = "home" | "reflection" | "dot" | "settings";

type TabDef = {
  key: TabKey;
  label: string;
  href?: string;
  Icon: (props: { className?: string }) => React.ReactNode;
  enabled: boolean;
};

// Phase 1 のフローは Home / Reflection のみ。Dot・設定は非活性。
const TABS: TabDef[] = [
  { key: "home", label: "ホーム", href: "/", Icon: HomeIcon, enabled: true },
  { key: "reflection", label: "振り返り", href: "/reflection", Icon: JournalIcon, enabled: true },
  { key: "dot", label: "Dot", Icon: DotIcon, enabled: false },
  { key: "settings", label: "設定", Icon: SettingsIcon, enabled: false },
];

export function BottomNavigation({ active }: { active: TabKey }) {
  return (
    <nav className={styles.root} aria-label="メインナビゲーション">
      {TABS.map(({ key, label, href, Icon, enabled }) => {
        const isActive = key === active;
        const className = [styles.item, isActive && styles.active, !enabled && styles.disabled]
          .filter(Boolean)
          .join(" ");
        const inner = (
          <>
            <Icon className={styles.icon} />
            <Text variant="caption" as="span">
              {label}
            </Text>
          </>
        );

        if (!enabled) {
          return (
            <span key={key} className={className} aria-disabled="true">
              {inner}
            </span>
          );
        }
        return (
          <Link
            key={key}
            href={href!}
            className={className}
            aria-current={isActive ? "page" : undefined}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
