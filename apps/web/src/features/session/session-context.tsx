"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/features/auth";
import type { Seconds } from "@/types";
import type { DotSession } from "./schema";
import type { SessionContextValue } from "./types";

// 以前に録音時間と現在のDotを保存していたkey。利用者を区別しないため、前の利用者の値を別の利用者の
// 画面へ復元してしまう。読み取りをやめ、起動時に消す（journaling.md §2。TASK-007 Plan §13）。
const LEGACY_STORAGE_KEY = "fod.session.v1";

const SessionContext = createContext<SessionContextValue | null>(null);

const removeLegacyStorage = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // storageを使えない環境では、消すものもない。
  }
};

/**
 * routeをまたぐ短いジャーナリング途中の状態（録音時間と現在のDot）をmemoryにだけ持つ。
 * browserのstorageへは書かない（frontend.md §2。正本はserver）。
 */
export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const { identityEpoch, subscribeIdentityChange } = useAuth();
  // 値は、書いたときの利用者の世代番号と一緒に持つ。番号が今と違えば前の利用者の値なので見せない
  // （切り替わりの描画では、消す通知より先に新しい利用者が描画されるため。TASK-007 Plan §7-3）。
  const [recorded, setRecorded] = useState<{ epoch: number; value: Seconds } | null>(null);
  const [dot, setDot] = useState<{ epoch: number; value: DotSession } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 起動時に古い保存値を消す。復元はしない。
  useEffect(() => {
    removeLegacyStorage();
    setHydrated(true);
  }, []);

  const setRecordedDuration = useCallback(
    (sec: Seconds) => {
      setRecorded({ epoch: identityEpoch, value: sec });
    },
    [identityEpoch],
  );

  const setDotSession = useCallback(
    (session: DotSession) => {
      setDot({ epoch: identityEpoch, value: session });
    },
    [identityEpoch],
  );

  const reset = useCallback(() => {
    setRecorded(null);
    setDot(null);
    removeLegacyStorage();
  }, []);

  // 認証の終了・利用者の切り替わりで、前の利用者の録音時間とDotを消す（TASK-007 Plan §7-3）。
  useEffect(() => subscribeIdentityChange(reset), [subscribeIdentityChange, reset]);

  const recordedDurationSec = recorded && recorded.epoch === identityEpoch ? recorded.value : null;
  const dotSession = dot && dot.epoch === identityEpoch ? dot.value : null;

  const value = useMemo<SessionContextValue>(
    () => ({
      recordedDurationSec,
      dotSession,
      hydrated,
      setRecordedDuration,
      setDotSession,
      reset,
    }),
    [recordedDurationSec, dotSession, hydrated, setRecordedDuration, setDotSession, reset],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
};

export const useSession = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession は SessionProvider の内側で使用してください。");
  }
  return ctx;
};
