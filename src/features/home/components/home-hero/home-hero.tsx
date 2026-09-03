"use client";

import { useRouter } from "next/navigation";
import { MicButton, Text } from "@/design-system";
import { generateGreeting } from "@/utils/generate-greeting";
import { GreetingHeader } from "../greeting-header/greeting-header";
import styles from "./home-hero.module.css";

const TAP_LABEL = "タップして話す";

/** 入口。「ここなら安心して話せそう」。呼吸するマイクへ自然に視線が向かう。 */
export function HomeHero() {
  const router = useRouter();
  // 挨拶は時刻依存。クライアントの時刻で確定し、hydration 差分は抑制する。
  const greeting = generateGreeting();

  return (
    <div className={styles.root}>
      <GreetingHeader greeting={greeting} />

      <div className={styles.stage}>
        <MicButton onStart={() => router.push("/record")} label={TAP_LABEL} />
      </div>

      <div className={styles.hint}>
        <Text variant="small" tone="tertiary">
          {TAP_LABEL}
        </Text>
      </div>
    </div>
  );
}
