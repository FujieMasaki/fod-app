import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider, useAuth } from "@/features/auth";
import { SessionProvider, useSession } from "@/features/session";
import { RecordingStage } from "./recording-stage";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigateMock }));

// 通常は、マイクとMediaRecorderは使わず、録音の開始・停止だけを模す。useRealRecorderのときだけ実物を使う。
const recorderMode = vi.hoisted(() => ({ useRealRecorder: false }));
vi.mock("../../hooks/use-recorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../hooks/use-recorder")>();
  return {
    useRecorder: () =>
      recorderMode.useRealRecorder
        ? actual.useRecorder()
        : {
            isRecording: true,
            elapsedSec: 30,
            mode: "silent",
            getAmplitude: () => 0,
            start: async () => undefined,
            stop: async () => ({ durationSec: 30 }),
          },
  };
});

// マイクの許可（getUserMedia）・AudioContext・MediaRecorderを最小の形で差し替え、録音の開始と止めたtrackを数える。
// holdなら、grantPermissionを呼ぶまで許可を待たせる。
const stubMicrophone = ({ hold = false } = {}) => {
  const counts = { recordingStarts: 0, stoppedTracks: 0, requests: 0 };
  const stream = { getTracks: () => [{ stop: () => (counts.stoppedTracks += 1) }] };
  let grant: () => void = () => undefined;
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () => {
        counts.requests += 1;
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
      state = "inactive";
      ondataavailable: unknown = null;
      start() {
        this.state = "recording";
        counts.recordingStarts += 1;
      }
      stop() {
        this.state = "inactive";
      }
    },
  );
  return Object.assign(counts, { grantPermission: () => grant() });
};

const DurationProbe = () => {
  const { recordedDurationSec } = useSession();
  return <p>{recordedDurationSec === null ? "no-duration" : `duration:${recordedDurationSec}`}</p>;
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
          <DurationProbe />
          <SwitchProbe />
        </SessionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

afterEach(() => {
  recorderMode.useRealRecorder = false;
  vi.useRealTimers();
  navigateMock.mockReset();
  vi.unstubAllGlobals();
});

describe("RecordingStage", () => {
  it("止めたら録音時間を確定して整理へ進む", async () => {
    renderStage();

    fireEvent.click(screen.getByRole("button", { name: "話し終える" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/processing" }));
    expect(screen.getByText("duration:30")).toBeInTheDocument();
  });

  it("録音の途中で利用者が切り替わったら、前の利用者の録音時間を残さずHomeへ戻る", async () => {
    renderStage();

    act(() => switchUser());
    fireEvent.click(screen.getByRole("button", { name: "話し終える" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(navigateMock).not.toHaveBeenCalledWith({ to: "/processing" });
    expect(screen.getByText("no-duration")).toBeInTheDocument();
  });

  it("StrictModeで開始が二重に実行されても、片付けた録音の後に新しく始め直し、マイクで録音する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    recorderMode.useRealRecorder = true;
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

  it("マイクの許可を待っている間に止めたら、許可の後に経過時間を進めない", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    recorderMode.useRealRecorder = true;
    const mic = stubMicrophone({ hold: true });
    renderStage();
    await waitFor(() => expect(mic.requests).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "話し終える" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    await act(async () => mic.grantPermission());
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(mic.recordingStarts).toBe(0);
    expect(screen.getByRole("status")).toHaveAccessibleName("録音中 00:00");
  });
});
