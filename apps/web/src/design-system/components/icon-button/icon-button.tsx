import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./icon-button.module.css";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** アイコンボタンは視覚のみのため aria-label 必須 */
  "aria-label": string;
  children: ReactNode;
};

export function IconButton({ className, type = "button", children, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={[styles.root, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
