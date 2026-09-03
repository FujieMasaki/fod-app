"use client";

import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { motion as motionToken } from "@/design-system/tokens";
import styles from "./spinner.module.css";

/**
 * 処理中のローディング。進捗は示さない。
 * reduced-motion では回転を止め、静かなフェード（明滅）に置き換える。
 */
export function Spinner({ size = 28, label }: { size?: number; label?: string }) {
  const reduce = useReducedMotion();
  const style = { "--spinner-size": `${size}px` } as CSSProperties;

  return (
    <motion.div
      className={styles.root}
      style={style}
      role="status"
      aria-label={label ?? "読み込み中"}
      animate={reduce ? { opacity: [0.4, 1, 0.4] } : { rotate: 360 }}
      transition={
        reduce
          ? { duration: 1.6, ease: "easeInOut", repeat: Infinity }
          : { duration: motionToken.spin.duration, ease: "linear", repeat: Infinity }
      }
    />
  );
}
