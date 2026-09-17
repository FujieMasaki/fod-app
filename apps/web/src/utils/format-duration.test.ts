import { describe, expect, it } from "vitest";
import { formatDuration } from "./format-duration";

describe("録音時間は mm:ss で静かに示す", () => {
  it("0 秒は 00:00", () => {
    expect(formatDuration(0)).toBe("00:00");
  });

  it("28 秒は 00:28", () => {
    expect(formatDuration(28)).toBe("00:28");
  });

  it("分をまたぐと繰り上がる", () => {
    expect(formatDuration(75)).toBe("01:15");
  });

  it("負値や小数は安全に丸める", () => {
    expect(formatDuration(-5)).toBe("00:00");
    expect(formatDuration(9.8)).toBe("00:09");
  });
});
