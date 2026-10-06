import { Link } from "@tanstack/react-router";
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

// Dotはserverに保存したDotのDay（/day）へ。そこから一覧・日の詳細へ進む（TASK-012）。
const TABS: TabDef[] = [
  { key: "home", label: "ホーム", href: "/", Icon: HomeIcon, enabled: true },
  { key: "reflection", label: "振り返り", href: "/reflection", Icon: JournalIcon, enabled: true },
  { key: "dot", label: "Dot", href: "/day", Icon: DotIcon, enabled: true },
  { key: "settings", label: "設定", href: "/settings", Icon: SettingsIcon, enabled: true },
];

export const BottomNavigation = ({ active }: { active: TabKey }) => {
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
            to={href!}
            className={className}
            aria-current={isActive ? "page" : undefined}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
};
