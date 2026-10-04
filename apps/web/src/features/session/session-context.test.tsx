import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider, useAuth } from "@/features/auth";
import { sampleSession } from "@/mocks/sample-session";
import { SessionProvider, useSession } from "./session-context";

const STORAGE_KEY = "fod.session.v1";
const USER_A = "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10";

// Rails APIのSession（契約の形）をfetchの差し替えで模す。未認証で始まり、loginでAになる。
function mockSessionApi() {
  const signedIn = {
    authenticated: true,
    csrf_token: "t2",
    expires_at: "2099-01-01T00:00:00Z",
    account_status: "active",
    user: { id: USER_A, email: "a@example.com", email_confirmed: true, sign_in_methods: ["password"] },
  };
  let loggedIn = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") loggedIn = true;
      return Response.json(loggedIn ? signedIn : { authenticated: false, csrf_token: "t1" });
    }),
  );
}

function Probe() {
  const { dotSession, recordedDurationSec, hydrated } = useSession();
  const { status, signIn } = useAuth();
  return (
    <div>
      <p>{hydrated ? "hydrated" : "loading"}</p>
      <p>{status}</p>
      <p>{dotSession ? dotSession.sentence : "no-dot"}</p>
      <p>{recordedDurationSec ?? "no-duration"}</p>
      <button onClick={() => void signIn({ email: "a@example.com", password: "password123" })}>login</button>
    </div>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("認証の切り替わりと端末のジャーナリング状態", () => {
  it("利用者が切り替わったら録音時間とDotを消し、localStorageからも消す", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ recordedDurationSec: 28, dotSession: sampleSession }));
    mockSessionApi();

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <SessionProvider>
            <Probe />
          </SessionProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument());
    expect(screen.getByText(sampleSession.sentence)).toBeInTheDocument();

    act(() => screen.getByText("login").click());

    await waitFor(() => expect(screen.getByText("authenticated")).toBeInTheDocument());
    expect(screen.getByText("no-dot")).toBeInTheDocument();
    expect(screen.getByText("no-duration")).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
