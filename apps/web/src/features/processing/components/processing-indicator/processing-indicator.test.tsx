import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/features/auth";
import { SessionProvider } from "@/features/session";
import { sampleSession } from "@/mocks/sample-session";
import { ProcessingIndicator } from "./processing-indicator";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

// AuthProviderの認証状態の取得（未認証）だけを別に返し、残りをDot生成のmockへ渡す。
function stubFetch(dotApi: (...args: unknown[]) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: unknown, ...rest: unknown[]) =>
      path === "/api/v1/session" ? Response.json({ authenticated: false, csrf_token: "t" }) : dotApi(path, ...rest),
    ),
  );
}

function renderProcessing() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SessionProvider>
          <ProcessingIndicator />
        </SessionProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  navigateMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe("整理が終わると今日の一文へ進む", () => {
  it("整理完了で /dot へ自動遷移し、結果をセッションへ確定する", async () => {
    vi.stubEnv("VITE_DOT_API_URL", "http://api.test");
    stubFetch(vi.fn(async () => ({ ok: true, json: async () => sampleSession })));

    renderProcessing();

    // 待ち時間の文言が表示される
    expect(screen.getByText("もう少しだけお待ちください")).toBeInTheDocument();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/dot", replace: true }));

    // セッション（今日の一文）が localStorage に確定している
    const stored = JSON.parse(window.localStorage.getItem("fod.session.v1") ?? "{}");
    expect(stored.dotSession?.sentence).toBe(sampleSession.sentence);
  });

  it("失敗しても不安にさせず、もう一度試すと今日の一文へ進む", async () => {
    vi.stubEnv("VITE_DOT_API_URL", "http://api.test");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => sampleSession });
    stubFetch(fetchMock);

    renderProcessing();

    // まず失敗の受け止め（技術用語なし）が出る
    const retry = await screen.findByRole("button", { name: "もう一度" });
    expect(screen.getByText("今日のDotをうまく整理できませんでした。")).toBeInTheDocument();

    fireEvent.click(retry);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/dot", replace: true }));
  });

  it("整理の途中で利用者が切り替わったら、前の利用者の結果を保存・表示しない", async () => {
    vi.stubEnv("VITE_DOT_API_URL", "http://api.test");
    let releaseDot: (value: unknown) => void = () => undefined;
    stubFetch(
      vi.fn(
        () =>
          new Promise((resolve) => {
            releaseDot = resolve;
          }),
      ),
    );
    let switchUser: () => void = () => undefined;
    function SwitchProbe() {
      switchUser = useAuth().prepareExternalSignIn;
      return null;
    }

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <SessionProvider>
            <ProcessingIndicator />
            <SwitchProbe />
          </SessionProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("もう少しだけお待ちください")).toBeInTheDocument());

    // 利用者の切り替わり（ここでは遷移前の通知）が起きた後に、前の利用者の結果が届く
    act(() => switchUser());
    await act(async () => releaseDot({ ok: true, json: async () => sampleSession }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(navigateMock).not.toHaveBeenCalledWith({ to: "/dot", replace: true });
    expect(window.localStorage.getItem("fod.session.v1")).toBeNull();
  });
});
