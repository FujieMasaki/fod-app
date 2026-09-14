import { motion } from "framer-motion";
import { Outlet, useLocation } from "@tanstack/react-router";
import { motion as motionToken } from "@/design-system";
import styles from "./app-shell.module.css";

/** 画面をモバイルフレーム内に収め、遷移時は静かにクロスフェードする。 */
export function AppShell() {
  const location = useLocation();

  return (
    <div className={styles.frame}>
      <motion.div
        key={location.pathname}
        className={styles.transition}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: motionToken.crossfade.duration, ease: "easeInOut" }}
      >
        <Outlet />
      </motion.div>
    </div>
  );
}
