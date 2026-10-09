import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Dot, Ripple, Text, Waveform, StopIcon } from "@/design-system";
import { useAuth, useVerifySession } from "@/features/auth";
import { useSession, type RecordedAudio } from "@/features/session";
import { formatDuration } from "@/utils/format-duration";
import { useRecorder, type RecorderFailure } from "../../hooks/use-recorder";
import type { RecordingOutcome } from "../../recorded-audio";
import { RecordingGuide } from "../recording-guide/recording-guide";
import { RecordingNotice } from "../recording-notice/recording-notice";
import styles from "./recording-stage.module.css";

const CIRCLE_SIZE = 176;

// マイクを開けなかった理由ごとの案内。録音できたようには見せず、次の操作を示す（TASK-010 Plan §7-4）。
const FAILURE_NOTICE: Record<RecorderFailure, { title: string; description: string; canRetry: boolean }> = {
  denied: {
    title: "マイクの使用が許可されていません",
    description: "録音は始まっていません。ブラウザの設定で、このサイトのマイクを許可してから、もう一度お試しください。",
    canRetry: true,
  },
  unsupported: {
    title: "このブラウザでは録音できません",
    description:
      "録音は始まっていません。最新のChrome・Edge・Firefox・Safariで、https のページを開いてお試しください。",
    canRetry: false,
  },
  no_device: {
    title: "マイクが見つかりません",
    description: "録音は始まっていません。マイクを接続してから、もう一度お試しください。",
    canRetry: true,
  },
  unavailable: {
    title: "マイクを使えませんでした",
    description: "録音は始まっていません。ほかのアプリがマイクを使っていないか確かめてから、もう一度お試しください。",
    canRetry: true,
  },
};

/** 止めた後に、整理へ進まずに利用者の操作を待つ結果 */
type Ended =
  | { kind: "interrupted"; audio: RecordedAudio | null }
  | { kind: "empty" }
  | { kind: "too_large" };

/**
 * 録音の主要ブロック。最初に録音前の案内を出し、利用者が「録音を始める」を押してからマイクを要求する
 * （開いただけでは録音を始めない。ログインから戻った直後も同じ）。止めたら録音を Processing へ委ねる。
 */
export const RecordingStage = () => {
  const navigate = useNavigate();
  const { setRecordedAudio, clearRecordedAudio } = useSession();
  const { identityEpoch } = useAuth();
  const verifySession = useVerifySession();
  const { phase, elapsedSec, failure, autoStopped, getAmplitude, start, stop } = useRecorder();
  // 案内を読んで「録音を始める」を押したか
  const [started, setStarted] = useState(false);
  // 始める前にRailsで認証を確かめている間か。確かめている間に押し直しても、二重に始めない。
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false);
  // 認証を確かめられなかった（offlineなど）。録音は始めず、理由を示す。
  const [unverified, setUnverified] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [ended, setEnded] = useState<Ended | null>(null);
  // 録音を始めたときの利用者の世代。止めたときに利用者が切り替わっていたら、前の利用者の録音を残さない。
  const startedEpochRef = useRef(identityEpoch);
  const currentEpochRef = useRef(identityEpoch);
  currentEpochRef.current = identityEpoch;
  // 1回の録音の結果で次を決めたか。利用者の停止と自動停止（中断・上限）が同じ結果を受け取っても、1回だけ進める。
  const finishedRef = useRef(false);
  // 画面を離れたか。止めている途中に離れたら、後から整理へ進まない。
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 始める操作（録音を始める・もう一度試す・録り直す）のたびに、マイクを要求する前にRailsで認証を確かめ直す
  // （journaling.md §4。案内を読んでいる間に期限が切れ得るため）。
  const verifyAndStart = async () => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    const verdict = await verifySession();
    verifyingRef.current = false;
    if (!mountedRef.current) return;
    setVerifying(false);
    // 認証が終わっていたら始めない（ログイン・Homeへ移すのはguard）。確かめられなければ理由を示す。
    if (verdict !== "ok") {
      setUnverified(verdict === "busy");
      return;
    }
    setUnverified(false);
    // 前の録音は使わない（録り直す・新しく始める）。
    clearRecordedAudio();
    startedEpochRef.current = currentEpochRef.current;
    setStarted(true);
    finishedRef.current = false;
    setEnded(null);
    setStopping(false);
    void start();
  };

  const begin = () => {
    void verifyAndStart();
  };

  // 前の録音は、この画面に来た時点で使わない。録音はunmountでuseRecorderが片付ける。
  useEffect(() => {
    clearRecordedAudio();
  }, [clearRecordedAudio]);

  // 録音を始めた後に利用者が切り替わっていたら、前の利用者の録音を残さずHomeへ戻す。
  const leaveIfSwitched = (): boolean => {
    if (currentEpochRef.current === startedEpochRef.current) return false;
    navigate({ to: "/", replace: true });
    return true;
  };

  const proceed = (audio: RecordedAudio) => {
    // 中断の案内を見ている間に切り替わった場合も、新しい利用者へ前の利用者の録音を渡さない。
    if (leaveIfSwitched()) return;
    setRecordedAudio(audio);
    navigate({ to: "/processing" });
  };

  // 止めた結果で次を決める。
  const finish = (outcome: RecordingOutcome, reason: "user" | "interrupted" | "limit") => {
    if (finishedRef.current || !mountedRef.current) return;
    finishedRef.current = true;
    if (leaveIfSwitched()) return;
    // 大きすぎる録音は、中断でも整理へ渡せない理由をそのまま示す。
    if (reason === "interrupted" && outcome.kind !== "too_large") {
      setEnded({ kind: "interrupted", audio: outcome.kind === "recorded" ? outcome.audio : null });
    } else if (outcome.kind === "recorded") {
      proceed(outcome.audio);
    } else {
      setEnded({ kind: outcome.kind });
    }
  };

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    finish(await stop(), "user");
  };

  // マイクが切れた・30分に達したときは、利用者が止めたときと同じく結果で次を決める。
  useEffect(() => {
    if (!autoStopped) return;
    setStopping(true);
    finish(autoStopped.outcome, autoStopped.reason);
    // finishは描画ごとに作り直すが、通知1回につき1回だけ動かすため、依存に入れない。
  }, [autoStopped]);

  const goHome = () => navigate({ to: "/" });

  if (unverified) {
    return (
      <RecordingNotice
        title="ログインの状態を確かめられませんでした"
        description="録音は始まっていません。通信の状態を確かめてから、もう一度お試しください。"
      >
        <Button onClick={begin} disabled={verifying}>
          もう一度試す
        </Button>
        <Button variant="ghost" onClick={goHome}>
          Homeへ戻る
        </Button>
      </RecordingNotice>
    );
  }

  if (!started) return <RecordingGuide onStart={begin} onCancel={goHome} verifying={verifying} />;

  if (failure) {
    const notice = FAILURE_NOTICE[failure];
    return (
      <RecordingNotice title={notice.title} description={notice.description}>
        {notice.canRetry && <Button onClick={begin}>もう一度試す</Button>}
        <Button variant={notice.canRetry ? "ghost" : "primary"} onClick={goHome}>
          Homeへ戻る
        </Button>
      </RecordingNotice>
    );
  }

  if (ended?.kind === "interrupted" && ended.audio) {
    const audio = ended.audio;
    return (
      <RecordingNotice
        title="録音が途中で止まりました"
        description="マイクが使えなくなったため、録音を止めました。ここまでの録音で整理するか、録り直せます。"
      >
        <Button onClick={() => proceed(audio)}>ここまでで整理する</Button>
        <Button variant="ghost" onClick={begin}>
          録り直す
        </Button>
      </RecordingNotice>
    );
  }

  if (ended) {
    const notice =
      ended.kind === "too_large"
        ? {
            title: "録音が大きすぎて送れません",
            description: "1回の録音は32MBまでです。短く区切って、録り直してください。",
          }
        : {
            title: "録音できた音声がありません",
            description:
              ended.kind === "interrupted"
                ? "マイクが使えなくなったため、録音を止めました。使える音声が残っていないので、録り直してください。"
                : "録音が始まる前か、1秒未満で止まりました。もう一度録音してください。",
          };
    return (
      <RecordingNotice title={notice.title} description={notice.description}>
        <Button onClick={begin}>録り直す</Button>
        <Button variant="ghost" onClick={goHome}>
          Homeへ戻る
        </Button>
      </RecordingNotice>
    );
  }

  // 止めた後（idleに戻ってから次の画面へ移るまで）は、許可待ちとして見せず、もう止められないようにする。
  const stopRequested = stopping || autoStopped !== null;
  const requesting = phase === "requesting" || (phase === "idle" && !stopRequested);

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <Text variant="title" as="h1">
          {requesting ? "マイクを準備しています" : "話しています…"}
        </Text>
        <Text variant="body" tone="secondary">
          {requesting
            ? "ブラウザに確認が出たら、マイクの使用を許可してください。"
            : "安心して、自由に話してください。30分で自動的に終わります。"}
        </Text>
      </div>

      <div className={styles.middle}>
        <div
          className={styles.stage}
          role="status"
          aria-label={requesting ? "マイクを準備しています" : `録音中 ${formatDuration(elapsedSec)}`}
        >
          <Ripple size={CIRCLE_SIZE} />
          <Dot size={CIRCLE_SIZE} variant="solid" breathe>
            <span className={styles.timer}>{formatDuration(elapsedSec)}</span>
          </Dot>
        </div>

        <Waveform getAmplitude={getAmplitude} active={phase === "recording"} />
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.stopButton}
          onClick={handleStop}
          disabled={stopRequested || phase === "stopping"}
          aria-label="話し終える"
        >
          <StopIcon />
        </button>
        <Text variant="small" tone="tertiary">
          話し終える
        </Text>
      </div>
    </div>
  );
};
