import type { HTMLAttributes } from "react";
import styles from "./card.module.css";

type CardProps = HTMLAttributes<HTMLDivElement> & { as?: "div" | "article" | "section" };

/** surface/card。影で存在感を出さず、余白で佇む。 */
export function Card({ as: Tag = "article", className, children, ...rest }: CardProps) {
  return (
    <Tag className={[styles.root, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Tag>
  );
}
