import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider, useAuth } from "@/features/auth";
import { SessionProvider, useSession } from "@/features/session";
import { RecordingStage } from "./recording-stage";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigateMock }));

// マイクの許可（getUserMedia）・AudioContext・MediaRecorderを最小の形で差し替え、録音の開始と止めたtrackを数える。
// 実際のマイクは使わない。
// - hold: grantPermissionを呼ぶまで許可を待たせる
// - reject: getUserMediaをこの名前のDOMExceptionで失敗させる
// - supported: MediaRecorderが録れる形式
// - chunkBytes: 止めたときに渡す音声の大きさ
// - holdStop: releaseStopを呼ぶまで、止めた後の最後のdataとstopの通知を遅らせる
const stubMicrophone = ({
  hold = false,
  reject,
  supported = ["audio/webm;codecs=opus"],
  chunkBytes = 16,
  holdStop = false,
}: { hold?: boolean; reject?: string; supported?: string[]; chunkBytes?: number; holdStop?: boolean } = {}) => {
  const counts = { recordingStarts: 0, stoppedTracks: 0, requests: 0, recorderStops: 0 };
  const endedListeners = new Set<() => void>();
  const track = {
    stop: () => (counts.stoppedTracks += 1),
    addEventListener: (_: string, listener: () => void) => endedListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => endedListeners.delete(listener),
  };
  const stream = { getTracks: () => [track] };
  let grant: () => void = () => undefined;
  let releaseStop: () => void = () => undefined;
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () => {
        counts.requests += 1;
        if (reject) return Promise.reject(new DOMException("failed", reject));
        if (!hold) return Promise.resolve(stream);
        return new Promise((resolve) => {
          grant = () => resolve(stream);
        });
      },
    },
  });
  vi.stubGlobal(
    "AudioContext",
    class {
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
    },
  );
  vi.stubGlobal(
    "MediaRecorder",
    class {
      static isTypeSupported = (type: string) => supported.includes(type);
      state = "inactive";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() {
        this.state = "recording";
        counts.recordingStarts += 1;
      }
      stop() {
        this.state = "inactive";
        counts.recorderStops += 1;
        const finish = () => {
          this.ondataavailable?.({ data: new Blob([new Uint8Array(chunkBytes)]) });
          this.onstop?.();
        };
        if (holdStop) releaseStop = finish;
        else finish();
      }
    },
  );
  return Object.assign(counts, {
    grantPermission: () => grant(),
    releaseStop: () => releaseStop(),
    // マイクが切れる（抜けた・OSが止めた）
    endTrack: () => endedListeners.forEach((listener) => listener()),
  });
};

const AudioProbe = () => {
  const { recordedAudio } = useSession();
  return (
    <p>
      {recordedAudio === null ? "no-audio" : `audio:${recordedAudio.mimeType}:${recordedAudio.durationSec}`}
    </p>
  );
};

let switchUser: () => void = () => undefined;
const SwitchProbe = () => {
  switchUser = useAuth().prepareExternalSignIn;
  return null;
};

const renderStage = ({ strict = false } = {}) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ authenticated: false, csrf_token: "t" })),
  );
  const tree = (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <SessionProvider>
          <RecordingStage />
          <AudioProbe />
          <SwitchProbe />
        </SessionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

// 録音時間に関わる時計（経過時間のtimerとDate）だけを差し替え、testが進めた分だけ進める。実時間では進めない
// （実時間の分だけ録音時間がずれないように）。波形のrequestAnimationFrameは差し替えない（30分ぶん描画すると遅い）。
const useRecordingClock = () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
};

// 録音が始まるまで待ち、指定の秒数だけ録音する。
const recordFor = async (mic: { recordingStarts: number }, seconds: number) => {
  await waitFor(() => expect(mic.recordingStarts).toBe(1));
  await act(() => vi.advanceTimersByTimeAsync(seconds * 1000));
};

afterEach(() => {
  vi.useRealTimers();
  navigateMock.mockReset();
  vi.unstubAllGlobals();
});

describe("RecordingStage", () => {
  it("止めたら録音した音声と録音時間を確定して整理へ進む", async () => {
    useRecordingClock();
    const mic = stubMicrophone();
    renderStage();
    await recordFor(mic, 30);

    fireEvent.click(screen.getByRole("button", { name: "話し終える" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/processing" }));
    expect(screen.getByText("audio:audio/webm:30")).toBeInTheDocument();
    expect(mic.stoppedTracks).toBe(1);
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("「話し終える」を続けて押しても、止めるのも整理へ進むのも1回だけ", async () => {
    useRecordingClock();
    const mic = stubMicrophone();
    renderStage();
    await recordFor(mic, 5);

    const stopButton = screen.getByRole("button", { name: "話し終える" });
    fireEvent.click(stopButton);
    fireEvent.click(stopButton);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/processing" }));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(mic.recorderStops).toBe(1);
  });

  it("録音の途中で利用者が切り替わったら、前の利用者の録音を残さずHomeへ戻る", async () => {
    useRecordingClock();
    const mic = stubMicrophone();
    renderStage();
    await recordFor(mic, 5);

    act(() => switchUser());
    fireEvent.click(screen.getByRole("button", { name: "話し終える" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(navigateMock).not.toHaveBeenCalledWith({ to: "/processing" });
    expect(screen.getByText("no-audio")).toBeInTheDocument();
  });

  it("StrictModeで開始が二重に実行されても、片付けた録音の後に新しく始め直し、マイクで録音する", async () => {
    useRecordingClock();
    const counts = stubMicrophone();

    renderStage({ strict: true });

    // 1回目の録音は片付けてtrackを止め、2回目の録音だけが始まって続く
    await waitFor(() => expect(counts.recordingStarts).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(counts.requests).toBe(2);
    expect(counts.stoppedTracks).toBe(1);
    expect(counts.recordingStarts).toBe(1);

    // 片付けた録音の経過時間の計測は残らない（1秒で1つだけ進む）
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole("status")).toHaveAccessibleName("録音中 00:01");
  });

  it("マイクの許可を待っている間に止めたら、許可の後に録音を始めず、受け渡せる音声が無いことを示す", async () => {
    useRecordingClock();
    const mic = stubMicrophone({ hold: true });
    renderStage();
    await waitFor(() => expect(mic.requests).toBe(1));
    expect(screen.getByRole("status")).toHaveAccessibleName("マイクを準備しています");

    fireEvent.click(screen.getByRole("button", { name: "話し終える" }));
    await screen.findByText("録音できた音声がありません");
    await act(async () => mic.grantPermission());
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(mic.recordingStarts).toBe(0);
    expect(mic.stoppedTracks).toBe(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("マイクの使用が拒否されたら、録音したように見せず、許可してからやり直す操作とHomeへ戻る操作を示す", async () => {
    const mic = stubMicrophone({ reject: "NotAllowedError" });
    renderStage();

    expect(await screen.findByRole("alert")).toHaveTextContent("マイクの使用が許可されていません");
    expect(screen.queryByRole("button", { name: "話し終える" })).not.toBeInTheDocument();
    expect(mic.recordingStarts).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "もう一度試す" }));
    await waitFor(() => expect(mic.requests).toBe(2));

    fireEvent.click(await screen.findByRole("button", { name: "Homeへ戻る" }));
    expect(navigateMock).toHaveBeenCalledWith({ to: "/" });
    expect(screen.getByText("no-audio")).toBeInTheDocument();
  });

  it.each([
    ["NotFoundError", "マイクが見つかりません"],
    ["NotReadableError", "マイクを使えませんでした"],
  ])("マイクを開けない（%s）ときは、理由とやり直す操作を示す", async (reject, title) => {
    stubMicrophone({ reject });
    renderStage();

    expect(await screen.findByRole("alert")).toHaveTextContent(title);
    expect(screen.getByRole("button", { name: "もう一度試す" })).toBeInTheDocument();
  });

  it("録音できないブラウザでは、マイクを要求せず、対応ブラウザとHomeへ戻る操作だけを示す", async () => {
    const mic = stubMicrophone({ supported: [] });
    renderStage();

    expect(await screen.findByRole("alert")).toHaveTextContent("このブラウザでは録音できません");
    expect(screen.getByRole("alert")).toHaveTextContent("Chrome・Edge・Firefox・Safari");
    expect(screen.queryByRole("button", { name: "もう一度試す" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Homeへ戻る" })).toBeInTheDocument();
    expect(mic.requests).toBe(0);
  });

  it("1秒未満で止めたら整理へ進まず、録り直せる", async () => {
    useRecordingClock();
    const mic = stubMicrophone();
    renderStage();
    await waitFor(() => expect(mic.recordingStarts).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "話し終える" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("録音できた音声がありません");
    expect(navigateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "録り直す" }));
    await waitFor(() => expect(mic.recordingStarts).toBe(2));
    expect(screen.getByRole("button", { name: "話し終える" })).toBeEnabled();
  });

  it("送れる大きさを超えたら整理へ進まず、録り直しを案内する", async () => {
    useRecordingClock();
    const mic = stubMicrophone({ chunkBytes: 32_000_001 });
    renderStage();
    await recordFor(mic, 5);

    fireEvent.click(screen.getByRole("button", { name: "話し終える" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("録音が大きすぎて送れません");
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByText("no-audio")).toBeInTheDocument();
  });

  it("録音中にマイクが切れたら止めて、ここまでで整理するか録り直すかを選べる", async () => {
    useRecordingClock();
    const mic = stubMicrophone();
    renderStage();
    await recordFor(mic, 10);

    act(() => mic.endTrack());

    expect(await screen.findByRole("alert")).toHaveTextContent("録音が途中で止まりました");
    expect(navigateMock).not.toHaveBeenCalled();
    expect(mic.stoppedTracks).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "ここまでで整理する" }));
    expect(navigateMock).toHaveBeenCalledWith({ to: "/processing" });
    expect(screen.getByText("audio:audio/webm:10")).toBeInTheDocument();
  });

  it("中断の案内を見ている間に利用者が切り替わったら、「ここまでで整理する」でも前の利用者の録音を渡さずHomeへ戻る", async () => {
    useRecordingClock();
    const mic = stubMicrophone();
    renderStage();
    await recordFor(mic, 10);
    act(() => mic.endTrack());
    await screen.findByText("録音が途中で止まりました");

    act(() => switchUser());
    fireEvent.click(screen.getByRole("button", { name: "ここまでで整理する" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true });
    expect(navigateMock).not.toHaveBeenCalledWith({ to: "/processing" });
    expect(screen.getByText("no-audio")).toBeInTheDocument();
  });

  it("マイクが切れて止めている途中は「話し終える」を押せず、中断の案内を1回だけ出す", async () => {
    useRecordingClock();
    const mic = stubMicrophone({ holdStop: true });
    renderStage();
    await recordFor(mic, 10);

    act(() => mic.endTrack());
    const stopButton = screen.getByRole("button", { name: "話し終える" });
    expect(stopButton).toBeDisabled();
    fireEvent.click(stopButton);
    await act(async () => mic.releaseStop());

    expect(await screen.findByRole("alert")).toHaveTextContent("録音が途中で止まりました");
    expect(navigateMock).not.toHaveBeenCalled();
    expect(mic.recorderStops).toBe(1);
  });

  it("止めている途中に画面を離れたら、後から整理へ進まない", async () => {
    useRecordingClock();
    const mic = stubMicrophone({ holdStop: true });
    const { unmount } = renderStage();
    await recordFor(mic, 10);

    fireEvent.click(screen.getByRole("button", { name: "話し終える" }));
    unmount();
    await act(async () => mic.releaseStop());

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("30分に達したら自動で止めて、整理へ進む", async () => {
    useRecordingClock();
    const mic = stubMicrophone();
    renderStage();
    await waitFor(() => expect(mic.recordingStarts).toBe(1));
    // 1秒ごとの描画を1800回繰り返さないよう、まとめて進める
    act(() => vi.advanceTimersByTime(1800 * 1000));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/processing" }));
    expect(screen.getByText("audio:audio/webm:1800")).toBeInTheDocument();
    expect(mic.recorderStops).toBe(1);
  });
});
