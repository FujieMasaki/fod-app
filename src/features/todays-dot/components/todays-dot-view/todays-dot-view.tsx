"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button, SentenceCard, Text } from "@/design-system";
import type { DotSession } from "@/features/session";
import styles from "./todays-dot-view.module.css";

/**
 * 体験の山場。分析ではなく、まず今日を象徴する「一文」を静かに届ける。
 * その後、「今日のDotを整理しました。」という自然なメッセージを添える。
 */
export function TodaysDotView({ session }: { session: DotSession }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const openReflection = () => router.push("/reflection");

  return (
    <div className={styles.root}>
      <div className={styles.eyebrow}>
        <Text variant="eyebrow" tone="secondary">
          今日の一文
        </Text>
      </div>

      <div className={styles.center}>
        <SentenceCard sentence={session.sentence} onOpenMessage={openReflection} />

        <motion.div
          className={styles.done}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 1.2, duration: 0.6 }}
        >
          <Text variant="small" tone="tertiary">
            今日のDotを整理しました。
          </Text>
        </motion.div>
      </div>

      <div className={styles.footer}>
        <Button variant="primary" fullWidth onClick={openReflection}>
          詳しく見る
        </Button>
      </div>
    </div>
  );
}
