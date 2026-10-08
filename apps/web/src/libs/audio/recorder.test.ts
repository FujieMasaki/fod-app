import { afterEach, describe, expect, it, vi } from "vitest";

import { createRecorder } from "./recorder";

type FakeTrack = MediaStreamTrack & { end: () => void };

// マイクの許可（getUserMedia）・AudioContext・MediaRecorderを最小の形で差し替える。実際のマイクは使わない。
// - supported: MediaRecorderが録れる形式（isTypeSupportedがtrueを返すもの）
// - hold: grantPermissionを呼ぶまで許可を待たせる
// - reject: getUserMediaをこの名前のDOMExceptionで失敗させる
const stubMicrophone = ({
  supported = ["audio/webm;codecs=opus"],
  hold = false,
  reject,
}: { supported?: string[]; hold?: boolean; reject?: string } = {}) => {
  const stopTrack = vi.fn();
  const endedListeners = new Set<() => void>();
  const track = {
    stop: stopTrack,
    addEventListener: (_: string, listener: () => void) => endedListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => endedListeners.delete(listener),
    end: () => endedListeners.forEach((listener) => listener()),
  } as unknown as FakeTrack;
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  let grant: () => void = () => undefined;
  const recorders: FakeMediaRecorder[] = [];

  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () => {
        if (reject) return Promise.reject(new DOMException("denied", reject));
        if (!hold) return Promise.resolve(stream);
        return new Promise<MediaStream>((resolve) => {
          grant = () => resolve(stream);
        });
      },
    },
  });
  class FakeAudioContext {
    state = "running";
    createMediaStreamSource() {
      return { connect: () => undefined };
    }
    createAnalyser() {
      return { fftSize: 0, getByteTimeDomainData: () => undefined };
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }
  // 止めると最後のdataを渡してからstopを知らせる（MediaRecorderの順序）。
  class FakeMediaRecorder {
    static isTypeSupported = (type: string) => supported.includes(type);
    state = "inactive";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    options: MediaRecorderOptions | undefined;
    constructor(_: MediaStream, options?: MediaRecorderOptions) {
      this.options = options;
      recorders.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["voice"]) });
      this.onstop?.();
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  return { stopTrack, track, recorders, grantPermission: () => grant() };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createRecorder", () => {
  it("開いてから録音を始め、止めると受け付ける形式の音声と録音時間を返して資源を解放する", async () => {
    vi.useFakeTimers({ now: 0 });
    const { stopTrack, recorders } = stubMicrophone();
    const recorder = createRecorder();

    expect(await recorder.open()).toBe("ok");
    // マイクを開いただけでは録音を始めない（間に録音attemptの発行を挟めるように）
    expect(recorders).toHaveLength(0);
    expect(recorder.record()).toBe(true);
    expect(recorders[0].options).toEqual({ mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 64_000 });

    vi.setSystemTime(12_400);
    const result = await recorder.stop();

    expect(result.mimeType).toBe("audio/webm");
    expect(result.blob?.type).toBe("audio/webm");
    expect(result.blob?.size).toBeGreaterThan(0);
    expect(result.durationSec).toBeCloseTo(12.4);
    expect(stopTrack).toHaveBeenCalled();
  });

  it("webm/opusで録れないブラウザでは、mp4で録る", async () => {
    const { recorders } = stubMicrophone({ supported: ["audio/mp4"] });
    const recorder = createRecorder();

    expect(await recorder.open()).toBe("ok");
    recorder.record();

    expect(recorders[0].options?.mimeType).toBe("audio/mp4");
    expect((await recorder.stop()).mimeType).toBe("audio/mp4");
  });

  it.each([
    ["受け付ける形式で録れない", () => stubMicrophone({ supported: [] })],
    ["MediaRecorderが無い", () => (stubMicrophone(), vi.stubGlobal("MediaRecorder", undefined))],
    ["getUserMediaが無い（安全でない接続など）", () => (stubMicrophone(), vi.stubGlobal("navigator", {}))],
  ])("%sなら、マイクを要求せず非対応と返す", async (_, setup) => {
    setup();
    const recorder = createRecorder();

    expect(await recorder.open()).toBe("unsupported");
    expect(recorder.record()).toBe(false);
  });

  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "no_device"],
    ["OverconstrainedError", "no_device"],
    ["NotReadableError", "unavailable"],
    ["AbortError", "unavailable"],
  ])("getUserMediaが%sで失敗したら%sと返し、録音を始めない", async (name, expected) => {
    stubMicrophone({ reject: name });
    const recorder = createRecorder();

    expect(await recorder.open()).toBe(expected);
    expect(recorder.record()).toBe(false);
    expect((await recorder.stop()).blob).toBeNull();
  });

  it("許可を待っている間に片付けたら、許可の後にマイクのstreamを止めて録音を始めない", async () => {
    const { stopTrack, grantPermission, recorders } = stubMicrophone({ hold: true });
    const recorder = createRecorder();

    const opening = recorder.open();
    recorder.dispose();
    grantPermission();

    expect(await opening).toBe("cancelled");
    expect(stopTrack).toHaveBeenCalled();
    expect(recorder.record()).toBe(false);
    expect(recorders).toHaveLength(0);
  });

  it("許可を待っている間に止めたら、許可の後にマイクのstreamを止めて録音を始めない", async () => {
    const { stopTrack, grantPermission, recorders } = stubMicrophone({ hold: true });
    const recorder = createRecorder();

    const opening = recorder.open();
    const stopped = await recorder.stop();
    grantPermission();

    expect(stopped).toEqual({ blob: null, durationSec: 0, mimeType: "audio/webm" });
    expect(await opening).toBe("cancelled");
    expect(stopTrack).toHaveBeenCalled();
    expect(recorder.record()).toBe(false);
    expect(recorders).toHaveLength(0);
  });

  it("録音中にマイクが切れたら中断を知らせ、止めるとそこまでの音声を返す", async () => {
    const onInterrupt = vi.fn();
    const { track } = stubMicrophone();
    const recorder = createRecorder({ onInterrupt });
    await recorder.open();
    recorder.record();

    track.end();

    expect(onInterrupt).toHaveBeenCalledTimes(1);
    expect((await recorder.stop()).blob?.size).toBeGreaterThan(0);
  });

  it("MediaRecorderが失敗したら中断を知らせる", async () => {
    const onInterrupt = vi.fn();
    const { recorders } = stubMicrophone();
    const recorder = createRecorder({ onInterrupt });
    await recorder.open();
    recorder.record();

    recorders[0].onerror?.();

    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it("止めた後・片付けた後にマイクが切れても、中断を知らせない", async () => {
    const onInterrupt = vi.fn();
    const { track } = stubMicrophone();
    const recorder = createRecorder({ onInterrupt });
    await recorder.open();
    recorder.record();

    await recorder.stop();
    track.end();

    expect(onInterrupt).not.toHaveBeenCalled();
  });

  it("自動で止まった直後（stopの通知の前）に止めても、最後のdataを待ってから返す", async () => {
    const { recorders } = stubMicrophone();
    const recorder = createRecorder();
    await recorder.open();
    recorder.record();
    const media = recorders[0];
    // マイクが切れて止まり始めた: stateはinactiveだが、最後のdataとstopはまだ届いていない
    media.state = "inactive";

    const stopping = recorder.stop();
    media.ondataavailable?.({ data: new Blob(["last"]) });
    media.onstop?.();

    expect((await stopping).blob?.size).toBe(4);
  });

  it("片付けると、録音中のMediaRecorderとstreamを止める", async () => {
    const { stopTrack, recorders } = stubMicrophone();
    const recorder = createRecorder();
    await recorder.open();
    recorder.record();

    recorder.dispose();

    expect(recorders[0].state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalled();
    expect(recorder.getAmplitude()).toBe(0);
  });
});
