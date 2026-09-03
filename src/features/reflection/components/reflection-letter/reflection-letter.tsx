"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Divider, Text, easing } from "@/design-system";
import type { DotSession } from "@/features/session";
import styles from "./reflection-letter.module.css";

/** 「今日という一日を、少し理解する」ための手紙。答えは教えず、静かに伴走する。 */
export function ReflectionLetter({ session }: { session: DotSession }) {
  const reduce = useReducedMotion();
  const [lead, ...restClosing] = session.closing.split("。").filter(Boolean);

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.18 } },
  };
  const paragraph: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 6 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easing.decelerate } },
  };

  return (
    <div className={styles.root}>
      <motion.div className={styles.body} variants={container} initial="hidden" animate="show">
        {session.reflection.map((para, i) => (
          <motion.div key={i} variants={paragraph}>
            <Text variant="letter">{para}</Text>
          </motion.div>
        ))}
      </motion.div>

      <div className={styles.closing}>
        <Divider className={styles.divider} />
        <Text variant="title">{lead ? `${lead}。` : session.closing}</Text>
        {restClosing.length > 0 && (
          <Text variant="small" tone="tertiary">
            {restClosing.join("。")}
          </Text>
        )}
      </div>
    </div>
  );
}
