"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { easing, motion as motionToken } from "@/design-system/tokens";
import { Card } from "../card/card";
import { Text } from "../text/text";
import { Divider } from "../divider/divider";
import { ChevronRightIcon } from "@/design-system/icons";
import styles from "./sentence-card.module.css";

type SentenceCardProps = {
  sentence: string;
  onOpenMessage?: () => void;
};

/** 句読点で行に分け、行ごとに立ち上がる（riseIn）。山場の「間」をつくる。 */
function toLines(sentence: string): string[] {
  return sentence
    .split(/(?<=[、。])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function SentenceCard({ sentence, onOpenMessage }: SentenceCardProps) {
  const reduce = useReducedMotion();
  const lines = toLines(sentence);

  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : motionToken.riseIn.stagger },
    },
  };
  const line: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : motionToken.riseIn.y },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: motionToken.riseIn.duration, ease: easing.decelerate },
    },
  };

  return (
    <Card>
      <motion.span
        className={styles.sentence}
        variants={container}
        initial="hidden"
        animate="show"
      >
        {lines.map((text, i) => (
          <motion.span key={i} className={styles.line} variants={line}>
            <Text variant="sentence" as="span">
              {text}
            </Text>
          </motion.span>
        ))}
      </motion.span>

      <div className={styles.footer}>
        <Divider />
        <button
          type="button"
          className={styles.messageRow}
          onClick={onOpenMessage}
          aria-label="AIからのメッセージを読む"
        >
          <Text variant="small" as="span" tone="secondary">
            AIからのメッセージ
          </Text>
          <ChevronRightIcon className={styles.chevron} />
        </button>
      </div>
    </Card>
  );
}
