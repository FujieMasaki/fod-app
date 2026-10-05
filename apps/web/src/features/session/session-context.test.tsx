import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

import { AuthProvider, useAuth } from "@/features/auth";
import { sampleSession } from "@/mocks/sample-session";
import { SessionProvider, useSession } from "./session-context";

const LEGACY_STORAGE_KEY = "fod.session.v1";
const USER_A = "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10";
const USER_B = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

function signedInAs(id: string) {
  return {
    authenticated: true,
    csrf_token: "t2",
    expires_at: "2099-01-01T00:00:00Z",
    account_status: "active",
    user: { id, email: "a@example.com", email_confirmed: true, sign_in_methods: ["password"] },
  };
}

// Rails APIのSession（契約の形）をfetchの差し替えで模す。`start`で始まり、loginで`afterLogin`になる。
function mockSessionApi(start: unknown, afterLogin: unknown) {
  let loggedIn = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") loggedIn = true;
      return Response.json(loggedIn ? afterLogin : start);
    }),
  );
}

function Probe() {
  const { dotSession, recordedDurationSec, hydrated, setDotSession, setRecordedDuration } = useSession();
  const { status, signIn } = useAuth();
  return (
    <div>
      <p>{hydrated ? "hydrated" : "loading"}</p>
      <p>{status}</p>
      <p>{dotSession ? dotSession.sentence : "no-dot"}</p>
      <p>{recordedDurationSec ?? "no-duration"}</p>
      <button
        onClick={() => {
          setRecordedDuration(28);
          setDotSession(sampleSession);
        }}
      >
        record
      </button>
      <button onClick={() => void signIn({ email: "b@example.com", password: "password123" })}>login</button>
    </div>
  );
}

function renderSession() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
  window.localStorage.clear();
});

describe("端末のジャーナリング状態", () => {
  it("起動時に前の保存値を復元せず、消す（別の利用者のDotを表示しない）", async () => {
    // Aの保存値が残った端末で、Bとして起動する
    window.localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ recordedDurationSec: 28, dotSession: sampleSession }),
    );
    mockSessionApi(signedInAs(USER_B), signedInAs(USER_B));
    renderSession();

    await waitFor(() => expect(screen.getByText("authenticated")).toBeInTheDocument());
    expect(screen.getByText("hydrated")).toBeInTheDocument();
    expect(screen.getByText("no-dot")).toBeInTheDocument();
    expect(screen.getByText("no-duration")).toBeInTheDocument();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("録音時間とDotはmemoryにだけ持ち、storageへ書かない", async () => {
    mockSessionApi(signedInAs(USER_A), signedInAs(USER_A));
    renderSession();
    await waitFor(() => expect(screen.getByText("authenticated")).toBeInTheDocument());

    act(() => screen.getByText("record").click());

    expect(screen.getByText(sampleSession.sentence)).toBeInTheDocument();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("別の利用者へ切り替わった描画で、前の利用者のDotを1回も描画しない", async () => {
    let getCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        getCount += 1;
        return Response.json(getCount === 1 ? signedInAs(USER_A) : signedInAs(USER_B));
      }),
    );
    const renders: { user: string | undefined; dot: string | null }[] = [];
    function Recorder() {
      const { dotSession } = useSession();
      const { user } = useAuth();
      renders.push({ user: user?.id, dot: dotSession?.sentence ?? null });
      return null;
    }
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <SessionProvider>
            <Probe />
            <Recorder />
          </SessionProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("authenticated")).toBeInTheDocument());
    act(() => screen.getByText("record").click());
    expect(screen.getByText(sampleSession.sentence)).toBeInTheDocument();

    // 画面へ戻ったときの取り直しで、別の利用者（B）に変わっている
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(renders.at(-1)?.user).toBe(USER_B));
    expect(renders.filter((r) => r.user === USER_B && r.dot !== null)).toEqual([]);
  });

  it("利用者が切り替わったら録音時間とDotを消す", async () => {
    mockSessionApi({ authenticated: false, csrf_token: "t1" }, signedInAs(USER_A));
    renderSession();
    await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument());
    act(() => screen.getByText("record").click());
    expect(screen.getByText(sampleSession.sentence)).toBeInTheDocument();

    act(() => screen.getByText("login").click());

    await waitFor(() => expect(screen.getByText("authenticated")).toBeInTheDocument());
    expect(screen.getByText("no-dot")).toBeInTheDocument();
    expect(screen.getByText("no-duration")).toBeInTheDocument();
  });
});
