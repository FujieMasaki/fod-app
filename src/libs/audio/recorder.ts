/**
 * 録音の低レベル抽象（MediaRecorder + AnalyserNode）。
 * SDK/Web API の詳細を Feature へ漏らさない。マイク不可時は無音モードへフォールバックする。
 */
export type RecorderMode = "mic" | "silent";

export type RecorderHandle = {
  start: () => Promise<RecorderMode>;
  stop: () => Promise<{ blob: Blob | null; durationSec: number }>;
  /** 現在の声量(0..1)。無音モードでは穏やかな合成波を返す。 */
  getAmplitude: () => number;
  dispose: () => void;
};

export function createRecorder(): RecorderHandle {
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let timeData: Uint8Array<ArrayBuffer> | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let mode: RecorderMode = "silent";
  let running = false;

  async function start(): Promise<RecorderMode> {
    startedAt = Date.now();
    running = true;
    chunks = [];

    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) {
      mode = "silent";
      return mode;
    }

    try {
      stream = await md.getUserMedia({ audio: true });
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctx();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      timeData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      source.connect(analyser);

      if (typeof MediaRecorder !== "undefined") {
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.start();
      }
      mode = "mic";
    } catch {
      // 権限拒否・非対応：無音モードで体験を止めない
      cleanupAudio();
      mode = "silent";
    }
    return mode;
  }

  function getAmplitude(): number {
    if (!running) return 0;
    if (analyser && timeData) {
      analyser.getByteTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i += 1) {
        const v = (timeData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / timeData.length);
      return Math.min(1, rms * 3.2); // 聞こえる程度の声量で十分振れるよう増幅
    }
    // 無音モード：穏やかな合成波（波形を止めない）
    const t = (Date.now() - startedAt) / 1000;
    const base = 0.32 + Math.sin(t * 2.1) * 0.14 + Math.sin(t * 5.3) * 0.08;
    return Math.min(1, Math.max(0.12, base));
  }

  function stop(): Promise<{ blob: Blob | null; durationSec: number }> {
    running = false;
    const durationSec = Math.round((Date.now() - startedAt) / 1000);

    return new Promise((resolve) => {
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = () => {
          const blob = chunks.length ? new Blob(chunks, { type: recorder?.mimeType }) : null;
          cleanupAudio();
          resolve({ blob, durationSec });
        };
        recorder.stop();
      } else {
        cleanupAudio();
        resolve({ blob: null, durationSec });
      }
    });
  }

  function cleanupAudio() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (audioCtx && audioCtx.state !== "closed") void audioCtx.close();
    audioCtx = null;
    analyser = null;
    timeData = null;
  }

  function dispose() {
    running = false;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorder = null;
    cleanupAudio();
  }

  return { start, stop, getAmplitude, dispose };
}
