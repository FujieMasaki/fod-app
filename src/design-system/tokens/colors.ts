/** 型付きカラートークン（CSS 変数のミラー。JS 側で必要な場合のみ参照） */
export const colors = {
  brand: {
    50: "#eef3f6",
    100: "#dce6ec",
    500: "#527d99",
    600: "#446a82",
    700: "#375568",
    900: "#2c4657",
  },
  bg: { base: "#e7edf1", raised: "#f6f9fb" },
  surface: { card: "#ffffff", muted: "#f6f9fb" },
  text: {
    primary: "#33434f",
    secondary: "#5a6975",
    tertiary: "#68767f",
    inverse: "#ffffff",
  },
  border: {
    hairline: "rgba(51,67,79,.07)",
    default: "rgba(51,67,79,.12)",
  },
  semantic: {
    success: "#5e9b86",
    warning: "#c29a5b",
    danger: "#be7f79",
    info: "#527d99",
  },
} as const;
