import type { Seconds } from "@/types";
import type { DotSession } from "./schema";

export type { DotSession };

export type SessionState = {
  /** 直近の録音時間（Recording → Processing で引き渡す） */
  recordedDurationSec: Seconds | null;
  /** 整理結果（Processing で確定し、Today's Dot / Reflection が参照） */
  dotSession: DotSession | null;
};

export type SessionContextValue = SessionState & {
  /** 起動時の準備（古い保存値の消去）が終わったか。終わる前は空の状態として扱わない */
  hydrated: boolean;
  setRecordedDuration: (sec: Seconds) => void;
  setDotSession: (session: DotSession) => void;
  reset: () => void;
};
