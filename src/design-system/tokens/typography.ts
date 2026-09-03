/**
 * タイポグラフィトークン（Phase 1 仕様 §3）。
 * 感情を象徴する「声」（display / sentence / letter）は明朝、UI はゴシック。
 */
export const fontFamily = {
  sans: 'var(--font-sans), "Hiragino Kaku Gothic ProN", sans-serif',
  serif: 'var(--font-serif), "Hiragino Mincho ProN", serif',
} as const;

export type TypographyVariant =
  | "display"
  | "sentence"
  | "title"
  | "letter"
  | "body"
  | "small"
  | "caption"
  | "eyebrow";

/** 各 variant のフォント種別（Text コンポーネントで参照） */
export const typographyFont: Record<TypographyVariant, "sans" | "serif"> = {
  display: "serif",
  sentence: "serif",
  letter: "serif",
  title: "sans",
  body: "sans",
  small: "sans",
  caption: "sans",
  eyebrow: "sans",
};
