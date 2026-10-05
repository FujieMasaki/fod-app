import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider, useAuth } from "@/features/auth";
import { SessionProvider, useSession } from "@/features/session";
import { RecordingStage } from "./recording-stage";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigateMock }));

// マイクとMediaRecorderは使わず、録音の開始・停止だけを模す。
vi.mock("../../hooks/use-recorder", () => ({
  useRecorder: () => ({
    isRecording: true,
    elapsedSec: 30,
    mode: "silent",
    getAmplitude: () => 0,
    start: async () => undefined,
    stop: async () => ({ durationSec: 30 }),
  }),
}));

function DurationProbe() {
  const { recordedDurationSec } = useSession();
  return <p>{recordedDurationSec === null ? "no-duration" : `duration:${recordedDurationSec}`}</p>;
}

let switchUser: () => void = () => undefined;
function SwitchProbe() {
  switchUser = useAuth().prepareExternalSignIn;
  return null;
}

function renderStage() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ authenticated: false, csrf_token: "t" })),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <SessionProvider>
          <RecordingStage />
          <DurationProbe />
          <SwitchProbe />
        </SessionProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
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
});
