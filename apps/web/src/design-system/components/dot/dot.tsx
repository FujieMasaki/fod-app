"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { motion as motionToken } from "@/design-system/tokens";
import styles from "./dot.module.css";

type DotProps = {
  size: number;
  variant?: "solid" | "gradient";
  /** 呼吸アニメーション（reduced-motion では停止） */
  breathe?: boolean;
  className?: string;
  children?: ReactNode;
};

/** Dot／円形の primitive。呼吸するように静かに存在する。 */
export function Dot({
  size,
  variant = "solid",
  breathe = false,
  className,
  children,
}: DotProps) {
  const reduce = useReducedMotion();
  const animate =
    breathe && !reduce ? { scale: [1, motionToken.breathe.scaleTo, 1] } : undefined;

  return (
    <motion.div
      className={[styles.root, styles[variant], className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
      animate={animate}
      transition={
        animate
          ? { duration: motionToken.breathe.duration, ease: "easeInOut", repeat: Infinity }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}
