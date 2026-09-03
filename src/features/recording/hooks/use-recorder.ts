"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRecorder, type RecorderHandle, type RecorderMode } from "@/libs/audio/recorder";

export type UseRecorder = {
  isRecording: boolean;
  elapsedSec: number;
  mode: RecorderMode;
  getAmplitude: () => number;
  start: () => Promise<void>;
  stop: () => Promise<{ durationSec: number }>;
};

/** 録音の開始・停止・経過時間・声量を管理する Feature Hook。 */
export function useRecorder(): UseRecorder {
  const recorderRef = useRef<RecorderHandle | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [mode, setMode] = useState<RecorderMode>("silent");

  const getAmplitude = useCallback(() => recorderRef.current?.getAmplitude() ?? 0, []);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    const recorder = createRecorder();
    recorderRef.current = recorder;
    setElapsedSec(0);
    setIsRecording(true);
    const nextMode = await recorder.start();
    setMode(nextMode);
    clearTimer();
    intervalRef.current = setInterval(() => {
      setElapsedSec((sec) => sec + 1);
    }, 1000);
  }, [clearTimer]);

  const stop = useCallback(async () => {
    clearTimer();
    setIsRecording(false);
    const recorder = recorderRef.current;
    if (!recorder) return { durationSec: 0 };
    const { durationSec } = await recorder.stop();
    recorderRef.current = null;
    return { durationSec };
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      clearTimer();
      recorderRef.current?.dispose();
      recorderRef.current = null;
    };
  }, [clearTimer]);

  return { isRecording, elapsedSec, mode, getAmplitude, start, stop };
}
