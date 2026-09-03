"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Seconds } from "@/types";
import { dotSessionSchema, type DotSession } from "./schema";
import type { SessionContextValue } from "./types";

const STORAGE_KEY = "fod.session.v1";

const SessionContext = createContext<SessionContextValue | null>(null);

type Persisted = {
  recordedDurationSec: Seconds | null;
  dotSession: DotSession | null;
};

function loadPersisted(): Persisted {
  if (typeof window === "undefined") {
    return { recordedDurationSec: null, dotSession: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { recordedDurationSec: null, dotSession: null };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const dotSession = parsed.dotSession
      ? dotSessionSchema.parse(parsed.dotSession)
      : null;
    return {
      recordedDurationSec: parsed.recordedDurationSec ?? null,
      dotSession,
    };
  } catch {
    return { recordedDurationSec: null, dotSession: null };
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [recordedDurationSec, setRecordedDurationSec] = useState<Seconds | null>(
    null,
  );
  const [dotSession, setDotSessionState] = useState<DotSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // localStorage からハイドレート（永続化は Phase 1 仕様に準拠）。
  // マウント時に外部ストア(localStorage)と同期する正当な用途のため、当該ルールを局所的に無効化する。
  useEffect(() => {
    const persisted = loadPersisted();
    /* eslint-disable react-hooks/set-state-in-effect */
    setRecordedDurationSec(persisted.recordedDurationSec);
    setDotSessionState(persisted.dotSession);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persist = useCallback((next: Persisted) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setRecordedDuration = useCallback(
    (sec: Seconds) => {
      setRecordedDurationSec(sec);
      persist({ recordedDurationSec: sec, dotSession });
    },
    [dotSession, persist],
  );

  const setDotSession = useCallback(
    (session: DotSession) => {
      setDotSessionState(session);
      persist({ recordedDurationSec, dotSession: session });
    },
    [recordedDurationSec, persist],
  );

  const reset = useCallback(() => {
    setRecordedDurationSec(null);
    setDotSessionState(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

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
