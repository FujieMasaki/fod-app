"use client";

import { motion, useReducedMotion } from "framer-motion";
import { motion as motionToken } from "@/design-system/tokens";
import { MicrophoneIcon } from "@/design-system/icons";
import { Ripple } from "../ripple/ripple";
import styles from "./mic-button.module.css";

type MicButtonProps = {
  onStart: () => void;
  label?: string;
  size?: number;
};

/**
 * 「行動を促すボタン」ではなく、安心して話し始められる入口。
 * 呼吸(breathe)しながら、待機の波紋(ripple)をまとう。
 */
export function MicButton({ onStart, label = "タップして話す", size = 112 }: MicButtonProps) {
  const reduce = useReducedMotion();

  return (
    <div className={styles.wrap} style={{ width: size, height: size }}>
      <Ripple size={size} />
      <motion.button
        type="button"
        className={styles.button}
        style={{ width: size, height: size }}
        onClick={onStart}
        aria-label={label}
        animate={reduce ? undefined : { scale: [1, motionToken.breathe.scaleTo, 1] }}
        transition={
          reduce
            ? undefined
            : { duration: motionToken.breathe.duration, ease: "easeInOut", repeat: Infinity }
        }
      >
        <MicrophoneIcon className={styles.icon} />
      </motion.button>
    </div>
  );
}
