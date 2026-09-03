"use client";

import { useRouter } from "next/navigation";
import { Text } from "@/design-system";
import { IconButton } from "@/design-system";
import { ChevronLeftIcon } from "@/design-system";
import styles from "./app-header.module.css";

type AppHeaderProps = {
  title: string;
  /** 中央 eyebrow（Today's Dot）か通常タイトルか */
  variant?: "title" | "eyebrow";
  showBack?: boolean;
  onBack?: () => void;
};

/** 画面上部の見出し。戻る導線は任意。ビジネスロジックは持たない。 */
export function AppHeader({ title, variant = "title", showBack = false, onBack }: AppHeaderProps) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.back());

  return (
    <header className={styles.root}>
      {showBack && (
        <IconButton aria-label="戻る" className={styles.back} onClick={handleBack}>
          <ChevronLeftIcon />
        </IconButton>
      )}
      <Text variant={variant === "eyebrow" ? "eyebrow" : "title"} tone={variant === "eyebrow" ? "secondary" : "primary"} align="center">
        {title}
      </Text>
    </header>
  );
}
