import { describe, expect, it } from "vitest";

import { MAX_AUDIO_BYTES, toRecordingOutcome } from "./recorded-audio";

const audioOf = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: "audio/webm" });

describe("toRecordingOutcome", () => {
  it("1秒以上の音声は、整数の録音時間と形式を添えて整理へ渡せる", () => {
    const blob = audioOf(10);

    expect(toRecordingOutcome({ blob, durationSec: 12.4, mimeType: "audio/webm" })).toEqual({
      kind: "recorded",
      audio: { blob, mimeType: "audio/webm", durationSec: 12 },
    });
  });

  it.each([
    ["音声が無い", { blob: null, durationSec: 5, mimeType: "audio/webm" as const }],
    ["音声が空", { blob: audioOf(0), durationSec: 5, mimeType: "audio/webm" as const }],
    ["1秒未満", { blob: audioOf(10), durationSec: 0.9, mimeType: "audio/webm" as const }],
    ["形式が分からない", { blob: audioOf(10), durationSec: 5, mimeType: null }],
  ])("%sなら、受け渡せる音声が無いと分ける", (_, result) => {
    expect(toRecordingOutcome(result)).toEqual({ kind: "empty" });
  });

  it("上限（32,000,000 bytes）までは渡せ、超えたら大きすぎると分ける", () => {
    expect(toRecordingOutcome({ blob: audioOf(MAX_AUDIO_BYTES), durationSec: 60, mimeType: "audio/mp4" }).kind).toBe(
      "recorded",
    );
    expect(toRecordingOutcome({ blob: audioOf(MAX_AUDIO_BYTES + 1), durationSec: 60, mimeType: "audio/mp4" })).toEqual({
      kind: "too_large",
    });
  });

  it("自動停止で上限を少し過ぎても、録音時間は契約の上限（1800秒）に収める", () => {
    const outcome = toRecordingOutcome({ blob: audioOf(10), durationSec: 1800.6, mimeType: "audio/webm" });

    expect(outcome.kind === "recorded" && outcome.audio.durationSec).toBe(1800);
  });
});
