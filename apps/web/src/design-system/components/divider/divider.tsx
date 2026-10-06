import styles from "./divider.module.css";

export const Divider = ({ className }: { className?: string }) => {
  return <hr className={[styles.root, className].filter(Boolean).join(" ")} />;
};
