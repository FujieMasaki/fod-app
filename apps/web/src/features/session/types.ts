import type { AudioMimeType } from "@/libs/audio/recorder";
import type { Seconds } from "@/types";
import type { DotSession } from "./schema";

export type { DotSession };

/** 録音した音声と録音時間。送るまでmemoryにだけ置く（storageへ書かない。journaling.md §2） */
export type RecordedAudio = {
  blob: Blob;
  mimeType: AudioMimeType;
  /** 契約の`duration_seconds`（1〜1800の整数） */
  durationSec: Seconds;
};

export type SessionState = {
  /** 直近の録音（Recording → Processing で引き渡す） */
  recordedAudio: RecordedAudio | null;
  /** 整理結果（Processing で確定し、Today's Dot / Reflection が参照） */
  dotSession: DotSession | null;
};

export type SessionContextValue = SessionState & {
  /** 起動時の準備（古い保存値の消去）が終わったか。終わる前は空の状態として扱わない */
  hydrated: boolean;
  setRecordedAudio: (audio: RecordedAudio) => void;
  /** 録音を捨てる（録り直す・整理が済んだ） */
  clearRecordedAudio: () => void;
  setDotSession: (session: DotSession) => void;
  reset: () => void;
};
