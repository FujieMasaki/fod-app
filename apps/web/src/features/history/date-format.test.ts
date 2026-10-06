import { describe, expect, it } from "vitest";

import { dayOfMonth, formatFullDate, formatMonthDay, groupByMonth, isCalendarDate, timeLabels } from "./date-format";

describe("isCalendarDate", () => {
  it("実在する暦日のYYYY-MM-DDだけを受け付ける", () => {
    expect(isCalendarDate("2026-09-28")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-9-28")).toBe(false);
    expect(isCalendarDate("2026-09-28\n")).toBe(false);
    expect(isCalendarDate("2026/09/28")).toBe(false);
    expect(isCalendarDate(undefined)).toBe(false);
  });
});

describe("日付の表示", () => {
  it("端末のタイムゾーンで変換せず、serverの暦日をそのまま表示する", () => {
    // new Date("2026-10-01")はUTCの0時で、UTCより西の端末では9月30日になる。文字列のまま分解する。
    expect(formatFullDate("2026-10-01")).toBe("2026年10月1日");
    expect(formatMonthDay("2026-10-01")).toBe("10月1日");
    expect(dayOfMonth("2026-10-01")).toBe(1);
  });

  it("検証していない値は表示しない", () => {
    expect(() => formatFullDate("2026-02-30")).toThrow(TypeError);
  });
});

describe("groupByMonth", () => {
  it("serverの並び（新しい順）を保ったまま、年と月の見出しで区切る", () => {
    const days = [{ date: "2027-01-03" }, { date: "2026-12-31" }, { date: "2026-12-01" }, { date: "2026-09-28" }];
    expect(groupByMonth(days)).toEqual([
      { label: "2027年1月", items: [{ date: "2027-01-03" }] },
      { label: "2026年12月", items: [{ date: "2026-12-31" }, { date: "2026-12-01" }] },
      { label: "2026年9月", items: [{ date: "2026-09-28" }] },
    ]);
  });

  it("別の年の同じ月を1つの見出しにまとめない", () => {
    const groups = groupByMonth([{ date: "2027-09-01" }, { date: "2026-09-28" }]);
    expect(groups.map((group) => group.label)).toEqual(["2027年9月", "2026年9月"]);
  });

  it("記録が無ければ見出しも作らない", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe("timeLabels", () => {
  it("録音時刻をJSTで表示する（0:00 JSTをまたぐ前後を含む）", () => {
    const labels = timeLabels([
      { id: "a", started_at: "2026-09-28T13:04:05Z" },
      { id: "b", started_at: "2026-09-27T15:00:00Z" },
      { id: "c", started_at: "2026-09-27T14:59:59Z" },
    ]);
    expect(labels.get("a")).toBe("22:04");
    expect(labels.get("b")).toBe("00:00");
    expect(labels.get("c")).toBe("23:59");
  });

  it("分まで同じ録音が複数あるときだけ秒まで表示し、同じ名前の選択肢を作らない", () => {
    const labels = timeLabels([
      { id: "a", started_at: "2026-09-28T13:04:50Z" },
      { id: "b", started_at: "2026-09-28T13:04:05Z" },
      { id: "c", started_at: "2026-09-28T12:00:00Z" },
    ]);
    expect(labels.get("a")).toBe("22:04:50");
    expect(labels.get("b")).toBe("22:04:05");
    expect(labels.get("c")).toBe("21:00");
  });
});
