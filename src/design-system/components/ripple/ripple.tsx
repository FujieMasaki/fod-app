"use client";

import { motion, useReducedMotion } from "framer-motion";
import { motion as motionToken } from "@/design-system/tokens";
import styles from "./ripple.module.css";

type RippleProps = {
  /** リングの基準直径(px) */
  size: number;
  /** 同時に走らせるリング数（半周期ずつずらす） */
  count?: number;
};

/**
 * 録音・待機の波紋。2 本を半周期(2.5s)ずらして自然な広がりをつくる。
 * prefers-reduced-motion では波紋を止める（フェード基調のみ残す）。
 */
export function Ripple({ size, count = 2 }: RippleProps) {
  const reduce = useReducedMotion();
  if (reduce) return null;

  const { scaleFrom, scaleTo, duration, stagger } = motionToken.ripple;
  const scaleMid = scaleFrom + (scaleTo - scaleFrom) * 0.35;

  return (
    <div className={styles.root} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <motion.span
          key={i}
          className={styles.ring}
          style={{ width: size, height: size }}
          // 開始・終端の opacity を 0 にし、ループ終端のスケール瞬間リセットを不可視化する
          // （中心に丸がフラッシュするのを防ぐ）
          initial={{ scale: scaleFrom, opacity: 0 }}
          animate={{ scale: [scaleFrom, scaleMid, scaleTo], opacity: [0, 0.5, 0] }}
          transition={{
            duration,
            ease: "easeOut",
            times: [0, 0.35, 1],
            repeat: Infinity,
            delay: i * stagger,
          }}
        />
      ))}
    </div>
  );
}
