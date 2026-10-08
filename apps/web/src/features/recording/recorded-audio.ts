import type { StopResult } from "@/libs/audio/recorder";
import type { RecordedAudio } from "@/features/session";

/** 1回の録音の上限（契約の`duration_seconds`の最大）。達したら自動で止める */
export const MAX_RECORDING_SEC = 1800;

/**
 * 送れる音声の大きさの上限（契約の`DotUpload`の32MB）。serverの数え方がMBかMiBかは未実装のため、
 * 小さい方（10進）で判定し、serverが拒否し得る大きさを渡さない（TASK-010 Plan §7-3）。
 */
export const MAX_AUDIO_BYTES = 32_000_000;

/**
 * 止めた録音を、次に進めるかで分ける。
 * - recorded: 整理へ渡せる
 * - empty: 音声が無い・1秒未満（契約の`duration_seconds`の最小は1）
 * - too_large: 大きすぎて送れない
 */
export type RecordingOutcome = { kind: "recorded"; audio: RecordedAudio } | { kind: "empty" } | { kind: "too_large" };

export const toRecordingOutcome = ({ blob, durationSec, mimeType }: StopResult): RecordingOutcome => {
  if (!blob || blob.size === 0 || !mimeType || durationSec < 1) return { kind: "empty" };
  if (blob.size > MAX_AUDIO_BYTES) return { kind: "too_large" };
  // 自動停止のtimerは上限を少し過ぎて止まり得るため、契約の範囲へ収める。
  const seconds = Math.min(MAX_RECORDING_SEC, Math.max(1, Math.round(durationSec)));
  return { kind: "recorded", audio: { blob, mimeType, durationSec: seconds } };
};
