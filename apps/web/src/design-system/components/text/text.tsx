import type { CSSProperties, ElementType, ReactNode } from "react";
import type { TypographyVariant } from "@/design-system/tokens";
import styles from "./text.module.css";

type Tone = "primary" | "secondary" | "tertiary" | "inverse" | "brand";
type Align = "start" | "center" | "end";

const toneVar: Record<Tone, string> = {
  primary: "var(--fod-text-primary)",
  secondary: "var(--fod-text-secondary)",
  tertiary: "var(--fod-text-tertiary)",
  inverse: "var(--fod-text-inverse)",
  brand: "var(--fod-brand-500)",
};

type TextProps = {
  variant: TypographyVariant;
  as?: ElementType;
  tone?: Tone;
  align?: Align;
  className?: string;
  id?: string;
  children: ReactNode;
} & Pick<
  React.HTMLAttributes<HTMLElement>,
  "aria-live" | "aria-hidden" | "role" | "suppressHydrationWarning"
>;

/**
 * タイポグラフィ primitive。すべての文字表現はこのコンポーネントを通す。
 * variant がフォント種別（明朝/ゴシック）・サイズ・行間・字送りを規定する。
 */
export function Text({
  variant,
  as,
  tone = "primary",
  align = "start",
  className,
  children,
  ...rest
}: TextProps) {
  const Tag = (as ?? "p") as ElementType;
  const style = {
    "--tone": toneVar[tone],
    "--align": align,
  } as CSSProperties;

  return (
    <Tag
      className={[styles.root, styles[variant], className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
