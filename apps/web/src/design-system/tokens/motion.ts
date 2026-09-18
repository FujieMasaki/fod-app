/**
 * モーショントークン（Design System §07 / Phase 1 仕様 §4）。
 * 「呼吸するように動く」。prefers-reduced-motion では拡縮・波紋を止め、フェードのみ残す。
 */
export const easing = {
  standard: [0.4, 0, 0.2, 1] as const,
  decelerate: [0, 0, 0.2, 1] as const,
};

export const duration = {
  fast: 0.16,
  base: 0.24,
  slow: 0.4,
} as const;

/** アニメーション定義（秒） */
export const motion = {
  breathe: { scaleTo: 1.05, duration: 6.5 }, // Dot / MicButton の呼吸
  ripple: { scaleFrom: 0.72, scaleTo: 2.1, duration: 5, stagger: 2.5 },
  spin: { duration: 1.1 }, // Processing のローディング
  riseIn: { y: 8, duration: 0.6, stagger: 0.12 }, // 今日の一文の立ち上がり
  crossfade: { duration: 0.4 }, // 画面遷移
} as const;
