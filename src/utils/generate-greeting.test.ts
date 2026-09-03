import { describe, expect, it } from "vitest";
import { generateGreeting } from "./generate-greeting";

describe("挨拶は時間帯に寄り添う", () => {
  it("深夜はねぎらいの言葉を返す", () => {
    expect(generateGreeting(2)).toBe("おつかれさまです");
  });

  it("朝はおはようと迎える", () => {
    expect(generateGreeting(8)).toBe("おはようございます");
  });

  it("昼はこんにちはと迎える", () => {
    expect(generateGreeting(13)).toBe("こんにちは");
  });

  it("夜はこんばんはと迎える", () => {
    expect(generateGreeting(21)).toBe("こんばんは");
  });

  it("境界(4時・11時・18時)で言葉が切り替わる", () => {
    expect(generateGreeting(4)).toBe("おはようございます");
    expect(generateGreeting(11)).toBe("こんにちは");
    expect(generateGreeting(18)).toBe("こんばんは");
  });
});
