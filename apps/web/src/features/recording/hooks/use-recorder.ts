"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRecorder, type OpenResult, type RecorderHandle } from "@/libs/audio/recorder";
import { MAX_RECORDING_SEC, toRecordingOutcome, type RecordingOutcome } from "../recorded-audio";

/**
 * - idle: 録音していない（始める前・止めた後・失敗の後）
 * - requesting: マイクの許可を待っている
 * - recording: 録音している
 * - stopping: 止めて音声を受け取っている
 */
export type RecorderPhase = "idle" | "requesting" | "recording" | "stopping";

/** マイクを開けなかった理由（libs/audio/recorderの`OpenResult`のうち失敗） */
export type RecorderFailure = Exclude<OpenResult, "ok" | "cancelled">;

/** 利用者が止める前に止まった録音。中断（マイクが切れた）か、上限（30分）に達した */
export type AutoStopped = { reason: "interrupted" | "limit"; outcome: RecordingOutcome };

export type UseRecorder = {
  phase: RecorderPhase;
  elapsedSec: number;
  failure: RecorderFailure | null;
  autoStopped: AutoStopped | null;
  getAmplitude: () => number;
  /** マイクを開いて録音を始める。権限拒否・非対応などでは録音を始めず`failure`に理由を置く */
  start: () => Promise<void>;
  /** 録音を止めて結果を返す。止めている途中に呼ぶと、同じ結果を返す */
  stop: () => Promise<RecordingOutcome>;
};

/** 録音の開始・停止・経過時間・声量・失敗と中断を管理する Feature Hook。 */
export const useRecorder = (): UseRecorder => {
  const recorderRef = useRef<RecorderHandle | null>(null);
  const stoppingRef = useRef<Promise<RecordingOutcome> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [failure, setFailure] = useState<RecorderFailure | null>(null);
  const [autoStopped, setAutoStopped] = useState<AutoStopped | null>(null);

  const getAmplitude = useCallback(() => recorderRef.current?.getAmplitude() ?? 0, []);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stop = useCallback((): Promise<RecordingOutcome> => {
    if (stoppingRef.current) return stoppingRef.current;
    const recorder = recorderRef.current;
    if (!recorder) return Promise.resolve({ kind: "empty" });
    clearTimer();
    setPhase("stopping");
    const stopping = recorder.stop().then((result) => {
      // 止めている間に始め直した（録り直し）・片付けた録音では、stateを動かさない。
      if (recorderRef.current === recorder) {
        recorderRef.current = null;
        stoppingRef.current = null;
        setPhase("idle");
      }
      return toRecordingOutcome(result);
    });
    stoppingRef.current = stopping;
    return stopping;
  }, [clearTimer]);

  // 利用者が止めていないのに止まった。利用者が止めている途中なら、そちらの結果に任せる。
  const autoStop = useCallback(
    async (recorder: RecorderHandle, reason: AutoStopped["reason"]) => {
      if (recorderRef.current !== recorder || stoppingRef.current) return;
      const outcome = await stop();
      setAutoStopped({ reason, outcome });
    },
    [stop],
  );

  const start = useCallback(async () => {
    recorderRef.current?.dispose();
    clearTimer();
    const recorder: RecorderHandle = createRecorder({ onInterrupt: () => void autoStop(recorder, "interrupted") });
    recorderRef.current = recorder;
    stoppingRef.current = null;
    setFailure(null);
    setAutoStopped(null);
    setElapsedSec(0);
    setPhase("requesting");

    const opened = await recorder.open();
    // 許可を待っている間に止めた・片付けた（StrictModeの再実行を含む）録音では、stateもtimerも動かさない。
    if (recorderRef.current !== recorder || opened === "cancelled") return;
    // 録音attemptの発行は、ここ（マイクを開いた後、録音を始める前）に入る（TASK-010 Plan §7-2）。
    const failed = opened !== "ok" ? opened : recorder.record() ? null : "unavailable";
    if (failed) {
      recorder.dispose();
      recorderRef.current = null;
      setFailure(failed);
      setPhase("idle");
      return;
    }
    setPhase("recording");
    // 経過時間は録音を始めた時刻からの実時間で数える。背景のタブでtimerが間引かれても、30分の上限を遅らせない。
    const recordedAt = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - recordedAt) / 1000));
    }, 1000);
  }, [autoStop, clearTimer]);

  // 上限に達したら自動で止める（話した内容は整理へ渡せる）。
  useEffect(() => {
    const recorder = recorderRef.current;
    if (phase === "recording" && recorder && elapsedSec >= MAX_RECORDING_SEC) void autoStop(recorder, "limit");
  }, [phase, elapsedSec, autoStop]);

  useEffect(() => {
    return () => {
      clearTimer();
      recorderRef.current?.dispose();
      recorderRef.current = null;
    };
  }, [clearTimer]);

  return { phase, elapsedSec, failure, autoStopped, getAmplitude, start, stop };
};
