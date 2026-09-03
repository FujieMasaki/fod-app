"use client";

import { motion } from "framer-motion";
import { motion as motionToken } from "@/design-system";
import styles from "./app-frame.module.css";

/**
 * 画面間遷移＝クロスフェード（400ms）。スライドは使わない。
 * template は遷移ごとに再マウントされ、入ってくる画面が静かにフェードインする。
 * フェードは reduced-motion でも残す（静けさを壊さない最小限の動き）。
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className={styles.transition}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: motionToken.crossfade.duration, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}
