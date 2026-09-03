/** 8pt グリッド（4px は半ステップ例外）。余白は「呼吸」。 */
export const spacing = [0, 4, 8, 12, 16, 24, 32, 40, 48, 56, 64] as const;

export const layout = {
  screenPadding: 30, // 画面パディング 28–34
  cardPadding: 32, // カード内
  sectionGapMin: 48, // セクション間 48–64
  sectionGapMax: 64,
} as const;
