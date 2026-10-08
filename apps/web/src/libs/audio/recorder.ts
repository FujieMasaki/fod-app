/**
 * 録音の低レベル抽象（getUserMedia + MediaRecorder + AnalyserNode）。
 * SDK/Web API の詳細を Feature へ漏らさない。マイクを開く（open）と録音を始める（record）を分ける。
 * 間に録音attemptの発行を挟めるようにするため（TASK-010 Plan §7-2）。
 */

/**
 * マイクを開いた結果。
 * - ok: 開けた。`record`で録音を始められる
 * - denied: 利用者またはブラウザの設定が許可していない
 * - unsupported: 録音に必要なAPIが無い（非対応のブラウザ・安全でない接続）か、受け付ける形式で録れない
 * - no_device: マイクが見つからない
 * - unavailable: それ以外の理由で使えない（他のアプリが使っている、など）
 * - cancelled: 許可を待っている間に止めた・片付けた。streamは止めてある
 */
export type OpenResult = "ok" | "denied" | "unsupported" | "no_device" | "unavailable" | "cancelled";

/** 送る先（契約の`DotUpload`）が受け付ける形式。MediaRecorderで録れる最初のものを使う */
export type AudioMimeType = "audio/webm" | "audio/mp4";

const CANDIDATE_TYPES: readonly { recorderType: string; mimeType: AudioMimeType }[] = [
  { recorderType: "audio/webm;codecs=opus", mimeType: "audio/webm" },
  { recorderType: "audio/mp4", mimeType: "audio/mp4" },
];

// 止めた後にstopの通知を待つ上限。通知が来ない実装でも、停止の操作を止めたままにしない。
const STOP_TIMEOUT_MS = 3_000;

// 30分でも契約の32MBに十分収まる大きさにする（Safariのmp4は既定のbitrateが高い）。
const AUDIO_BITS_PER_SECOND = 64_000;

export type StopResult = {
  /** 録れた音声。録音を始めていない・何も録れていなければnull */
  blob: Blob | null;
  /** 録音を始めてから止めるまでの秒数（小数を含む） */
  durationSec: number;
  mimeType: AudioMimeType | null;
};

export type RecorderHandle = {
  open: () => Promise<OpenResult>;
  /** `open`が`ok`を返した後に呼ぶ。録音を始めたらtrue */
  record: () => boolean;
  stop: () => Promise<StopResult>;
  /** 現在の声量(0..1)。録音していなければ0 */
  getAmplitude: () => number;
  dispose: () => void;
};

export type RecorderOptions = {
  /** 録音中にマイクが切れた（trackのended）か、MediaRecorderが失敗した */
  onInterrupt?: () => void;
};

const supportedType = () => {
  if (typeof MediaRecorder === "undefined") return null;
  // isTypeSupportedが無い古い実装では、形式を確かめられないため録らない。
  if (typeof MediaRecorder.isTypeSupported !== "function") return null;
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type.recorderType)) ?? null;
};

const failureOf = (error: unknown): Exclude<OpenResult, "ok" | "cancelled" | "unsupported"> => {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no_device";
  return "unavailable";
};

export const createRecorder = ({ onInterrupt }: RecorderOptions = {}): RecorderHandle => {
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let timeData: Uint8Array<ArrayBuffer> | null = null;
  let recorder: MediaRecorder | null = null;
  let type: (typeof CANDIDATE_TYPES)[number] | null = null;
  let chunks: Blob[] = [];
  // 録音が止まった（stopを呼んだ・マイクが切れて自動で止まった）ことの通知。最後のdataはこれより前に届く。
  let stopped: Promise<void> | null = null;
  let startedAt: number | null = null;
  // 片付けた後か。マイクの許可を待っている間に画面を離れると、許可の後にstreamが開いたまま残るため確かめる。
  let disposed = false;
  // 止められたか（停止を押した・画面を離れた）。許可の後に録音を始めないために確かめる。
  let cancelled = false;

  const interrupt = () => {
    if (!recorder || cancelled) return;
    onInterrupt?.();
  };

  const open = async (): Promise<OpenResult> => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    type = supportedType();
    if (!md?.getUserMedia || !type) return "unsupported";

    let granted: MediaStream;
    try {
      granted = await md.getUserMedia({ audio: true });
    } catch (error) {
      return disposed || cancelled ? "cancelled" : failureOf(error);
    }
    if (disposed || cancelled) {
      granted.getTracks().forEach((track) => track.stop());
      return "cancelled";
    }
    stream = granted;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctx();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      timeData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      source.connect(analyser);
    } catch {
      cleanupAudio();
      return "unavailable";
    }
    return "ok";
  };

  const record = (): boolean => {
    if (!stream || !type || disposed || cancelled) return false;
    try {
      const next = new MediaRecorder(stream, {
        mimeType: type.recorderType,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      chunks = [];
      next.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      next.onerror = interrupt;
      stopped = new Promise((resolve) => {
        next.onstop = () => resolve();
      });
      stream.getTracks().forEach((track) => track.addEventListener("ended", interrupt));
      recorder = next;
      next.start();
    } catch {
      recorder = null;
      return false;
    }
    startedAt = Date.now();
    return true;
  };

  const getAmplitude = (): number => {
    if (!analyser || !timeData || startedAt === null || cancelled) return 0;
    analyser.getByteTimeDomainData(timeData);
    let sum = 0;
    for (let i = 0; i < timeData.length; i += 1) {
      const v = (timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeData.length);
    return Math.min(1, rms * 3.2); // 聞こえる程度の声量で十分振れるよう増幅
  };

  const stop = async (): Promise<StopResult> => {
    cancelled = true;
    const durationSec = startedAt === null ? 0 : (Date.now() - startedAt) / 1000;
    const mimeType = type?.mimeType ?? null;
    const active = recorder;
    const done = stopped;
    recorder = null;
    stopped = null;

    if (active && active.state !== "inactive") active.stop();
    // 自動で止まった直後（stateはinactiveでも、最後のdataとstopの通知がまだ）も、届くまで待つ。
    if (active && done) {
      await Promise.race([done, new Promise((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS))]);
    }
    const blob = chunks.length ? new Blob(chunks, { type: mimeType ?? undefined }) : null;
    chunks = [];
    cleanupAudio();
    return { blob, durationSec, mimeType };
  };

  const cleanupAudio = () => {
    stream?.getTracks().forEach((track) => {
      track.removeEventListener("ended", interrupt);
      track.stop();
    });
    stream = null;
    if (audioCtx && audioCtx.state !== "closed") void audioCtx.close();
    audioCtx = null;
    analyser = null;
    timeData = null;
  };

  const dispose = () => {
    disposed = true;
    cancelled = true;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorder = null;
    stopped = null;
    chunks = [];
    cleanupAudio();
  };

  return { open, record, stop, getAmplitude, dispose };
};
