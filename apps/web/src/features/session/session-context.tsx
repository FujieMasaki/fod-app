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

function removeLegacyStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // storageを使えない環境では、消すものもない。
  }
}

/**
 * routeをまたぐ短いジャーナリング途中の状態（録音時間と現在のDot）をmemoryにだけ持つ。
 * browserのstorageへは書かない（frontend.md §2。正本はserver）。
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [recordedDurationSec, setRecordedDurationSec] = useState<Seconds | null>(
    null,
  );
  const [dotSession, setDotSessionState] = useState<DotSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 起動時に古い保存値を消す。復元はしない。
  useEffect(() => {
    removeLegacyStorage();
    setHydrated(true);
  }, []);

  const setRecordedDuration = useCallback((sec: Seconds) => {
    setRecordedDurationSec(sec);
  }, []);

  const setDotSession = useCallback((session: DotSession) => {
    setDotSessionState(session);
  }, []);

  const reset = useCallback(() => {
    setRecordedDurationSec(null);
    setDotSessionState(null);
    removeLegacyStorage();
  }, []);

  // 認証の終了・利用者の切り替わりで、前の利用者の録音時間とDotを残さない（TASK-007 Plan §7-3）。
  const { subscribeIdentityChange } = useAuth();
  useEffect(() => subscribeIdentityChange(reset), [subscribeIdentityChange, reset]);

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
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession は SessionProvider の内側で使用してください。");
  }
  return ctx;
}
