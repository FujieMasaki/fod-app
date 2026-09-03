import { describe, expect, it } from "vitest";
import { dotSessionSchema } from "./schema";
import { sampleSession } from "@/mocks/sample-session";

describe("外部から受け取る Dot は Zod で検証する", () => {
  it("正しい形のデータは受理する", () => {
    expect(() => dotSessionSchema.parse(sampleSession)).not.toThrow();
  });

  it("reflection が配列でなければ拒否する", () => {
    const invalid = { ...sampleSession, reflection: "ひとつの文字列" };
    expect(() => dotSessionSchema.parse(invalid)).toThrow();
  });

  it("必須フィールドが欠けていれば拒否する", () => {
    const withoutSentence: Record<string, unknown> = { ...sampleSession };
    delete withoutSentence.sentence;
    expect(() => dotSessionSchema.parse(withoutSentence)).toThrow();
  });
});
