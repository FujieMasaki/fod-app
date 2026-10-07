/**
 * 履歴の日付・時刻の表示。日付（`YYYY-MM-DD`）はserverが決めたAsia/Tokyoの暦日なので、`Date`へ通さず文字列のまま
 * 分解する（`new Date("2026-09-28")`はUTCとして解釈され、端末によって前日になる）。時刻はJSTで表示する。
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type CalendarDate = { year: number; month: number; day: number };

const parse = (value: string): CalendarDate | null => {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // 存在しない暦日（2026-02-30）を弾く。UTCで組み立てて戻すと、範囲外の日は別の月日へ繰り上がる。
  // Date.UTCは0〜99年を1900年代として扱うため、setUTCFullYearで年をそのまま入れる。
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return { year, month, day };
};

/** URLなど外から来た値が、実在する暦日の`YYYY-MM-DD`か */
export const isCalendarDate = (value: unknown): value is string => {
  return typeof value === "string" && parse(value) !== null;
};

const partsOf = (date: string): CalendarDate => {
  const parsed = parse(date);
  // schemaで検証した値だけが来る。来たら表示を壊さず、呼び出し側の誤りとして止める。
  if (!parsed) throw new TypeError("history: invalid date");
  return parsed;
};

/** 「2026年9月28日」 */
export const formatFullDate = (date: string): string => {
  const { year, month, day } = partsOf(date);
  return `${year}年${month}月${day}日`;
};

/** 「9月28日」 */
export const formatMonthDay = (date: string): string => {
  const { month, day } = partsOf(date);
  return `${month}月${day}日`;
};

/** 丸に添える日の数字 */
export const dayOfMonth = (date: string): number => partsOf(date).day;

/**
 * 新しい順の日の並びを、年月の見出しごとに区切る。並び順は変えない（serverの順を正とする）。
 * 年も見出しに含めるので、年が変わる位置でも現在見ている年が分かる。
 */
export const groupByMonth = <T extends { date: string }>(items: readonly T[]): { label: string; items: T[] }[] => {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const { year, month } = partsOf(item.date);
    const key = `${year}-${month}`;
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: `${year}年${month}月`, items: [item] });
  }
  return groups.map(({ label, items: grouped }) => ({ label, items: grouped }));
};

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const timeWithSecondsFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const countOf = (labels: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return counts;
};

/**
 * 同じ日のDotを切り替えるための録音時刻のラベル（JST）。分まで同じものがあるときだけ秒まで出し、
 * 秒まで同じ（小数秒だけ違う）ものには、並び順の番号を添える。同じ名前の選択肢が並ばないようにする。
 */
export const timeLabels = (dots: readonly { id: string; started_at: string }[]): Map<string, string> => {
  const minutes = dots.map((dot) => timeFormat.format(new Date(dot.started_at)));
  const minuteCounts = countOf(minutes);
  const labels = dots.map((dot, index) =>
    minuteCounts.get(minutes[index])! > 1 ? timeWithSecondsFormat.format(new Date(dot.started_at)) : minutes[index],
  );
  const labelCounts = countOf(labels);
  const seen = new Map<string, number>();
  return new Map(
    dots.map((dot, index) => {
      const label = labels[index];
      if (labelCounts.get(label)! === 1) return [dot.id, label];
      const order = (seen.get(label) ?? 0) + 1;
      seen.set(label, order);
      return [dot.id, `${label}（${order}）`];
    }),
  );
};
