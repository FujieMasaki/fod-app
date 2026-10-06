import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/features/auth";
import { SessionProvider, useSession } from "@/features/session";
import { sampleSession } from "@/mocks/sample-session";
import { ProcessingIndicator } from "./processing-indicator";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

// AuthProviderの認証状態の取得（未認証）だけを別に返し、残りをDot生成のmockへ渡す。
const stubFetch = (dotApi: (...args: unknown[]) => unknown) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: unknown, ...rest: unknown[]) =>
      path === "/api/v1/session" ? Response.json({ authenticated: false, csrf_token: "t" }) : dotApi(path, ...rest),
    ),
  );
};

// 整理の結果が確定した現在のDot（SessionProviderのmemory）を表示する。
const DotProbe = () => {
  const { dotSession } = useSession();
  return <p>{dotSession ? `dot:${dotSession.sentence}` : "no-dot"}</p>;
};

const renderProcessing = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SessionProvider>
          <ProcessingIndicator />
          <DotProbe />
        </SessionProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  focusManager.setFocused(undefined);
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

    // 今日の一文がセッション（memory）に確定し、browserのstorageへは書かない
    expect(screen.getByText(`dot:${sampleSession.sentence}`)).toBeInTheDocument();
    expect(window.localStorage.getItem("fod.session.v1")).toBeNull();
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

  it("取り直しで別の利用者へ切り替わった後に前の利用者の結果が届いても、保存・表示しない", async () => {
    vi.stubEnv("VITE_DOT_API_URL", "http://api.test");
    const signedInAs = (id: string) => ({
      authenticated: true,
      csrf_token: "t",
      expires_at: "2099-01-01T00:00:00Z",
      account_status: "active",
      user: { id, email: "a@example.com", email_confirmed: true, sign_in_methods: ["password"] },
    });
    let sessionCount = 0;
    let releaseDot: (value: unknown) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: unknown) => {
        if (path === "/api/v1/session") {
          sessionCount += 1;
          return Response.json(
            signedInAs(sessionCount === 1 ? "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10" : "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"),
          );
        }
        return new Promise((resolve) => {
          releaseDot = resolve;
        });
      }),
    );
    renderProcessing();
    await waitFor(() => expect(sessionCount).toBe(1));
    await screen.findByText("もう少しだけお待ちください");

    // 画面へ戻ったときの取り直しでBに変わる（logoutの開始・Googleへの遷移による通知は経ない）
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(sessionCount).toBe(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // その後に、Aとして始めた整理の結果が届く
    await act(async () => releaseDot({ ok: true, json: async () => sampleSession }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalledWith({ to: "/dot", replace: true });
    expect(screen.getByText("no-dot")).toBeInTheDocument();
  });

  it("整理に失敗した後に利用者が切り替わったら、再試行を出さずHomeへ戻る", async () => {
    vi.stubEnv("VITE_DOT_API_URL", "http://api.test");
    stubFetch(vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    let switchUser: () => void = () => undefined;
    const SwitchProbe = () => {
      switchUser = useAuth().prepareExternalSignIn;
      return null;
    };
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
    await screen.findByRole("button", { name: "もう一度" });

    act(() => switchUser());

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true }));
    expect(screen.queryByRole("button", { name: "もう一度" })).not.toBeInTheDocument();
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
    const SwitchProbe = () => {
      switchUser = useAuth().prepareExternalSignIn;
      return null;
    };

    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <SessionProvider>
            <ProcessingIndicator />
            <SwitchProbe />
            <DotProbe />
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
    expect(screen.getByText("no-dot")).toBeInTheDocument();
  });
});
