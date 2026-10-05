import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "../auth-provider";
import { ConfirmationScreen } from "./confirmation-screen";
import { PasswordForgotScreen } from "./password-forgot-screen";
import { PasswordResetScreen } from "./password-reset-screen";
import { UnlockScreen } from "./unlock-screen";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

// Rails APIの応答（契約の形）をfetchの差し替えで模す。`METHOD path`ごとに1つの応答。
type Reply = { status: number; body?: unknown };

function problem(status: number, code: string) {
  return { status, body: { type: `urn:focus-on-dot:problem:${code}`, title: "x", status, code } };
}

function mockApi(routes: Record<string, Reply>) {
  const requests: { key: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${path}`;
      requests.push({ key, body: init?.body as string | undefined });
      const reply =
        key === "GET /api/v1/session" ? { status: 200, body: { authenticated: false, csrf_token: "t1" } } : routes[key];
      if (!reply) throw new Error(`unexpected request: ${key}`);
      if (reply.body === undefined) return new Response(null, { status: reply.status });
      const type = reply.status >= 400 ? "application/problem+json" : "application/json";
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": type } });
    }),
  );
  return requests;
}

function renderScreen(ui: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>,
  );
}

function openLink(path: string, token?: string) {
  window.history.replaceState(null, "", token === undefined ? path : `${path}#token=${encodeURIComponent(token)}`);
}

function sentBody(requests: { key: string; body?: string }[], key: string) {
  return JSON.parse(requests.find((r) => r.key === key)!.body!);
}

beforeEach(() => {
  openLink("/");
});

afterEach(() => {
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe("メールのリンクのtoken", () => {
  it("読んだらURLから消し、画面に出さない", async () => {
    mockApi({});
    openLink("/confirmation", "secret-token");
    renderScreen(<ConfirmationScreen />);

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.pathname).toBe("/confirmation");
    expect(document.body.textContent).not.toContain("secret-token");
  });

  it("実際のrouterの上でも、消したtokenをURLへ書き戻さず、遷移して戻ってもtoken付きのURLにならない", async () => {
    const { createRootRoute, createRoute, createRouter, createBrowserHistory, RouterProvider } =
      await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
    mockApi({});
    openLink("/password/reset", "secret-token");
    const rootRoute = createRootRoute();
    const resetRoute = createRoute({ getParentRoute: () => rootRoute, path: "/password/reset", component: PasswordResetScreen });
    const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: () => <p>ログイン画面</p> });
    const router = createRouter({
      routeTree: rootRoute.addChildren([resetRoute, loginRoute]),
      history: createBrowserHistory(),
    });
    renderScreen(<RouterProvider router={router} />);

    await screen.findByLabelText("新しいパスワード");
    await waitFor(() => expect(window.location.hash).toBe(""));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.location.hash).toBe("");

    await act(() => router.navigate({ to: "/login" }));
    await screen.findByText("ログイン画面");
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(window.location.pathname).toBe("/password/reset");
    expect(window.location.hash).toBe("");
  });

  it("開いただけではserverへ送らず、操作で送る", async () => {
    const requests = mockApi({ "PATCH /api/v1/confirmation": { status: 204 } });
    openLink("/confirmation", "secret-token");
    renderScreen(<ConfirmationScreen />);

    const button = await screen.findByRole("button", { name: "メールアドレスを確認する" });
    expect(requests.some((r) => r.key === "PATCH /api/v1/confirmation")).toBe(false);

    fireEvent.click(button);

    expect(await screen.findByText("メールアドレスを確認しました")).toBeInTheDocument();
    expect(sentBody(requests, "PATCH /api/v1/confirmation")).toEqual({ token: "secret-token" });
  });
});

describe("ConfirmationScreen", () => {
  it("期限切れなら理由を示し、確認メールの再送を受け付ける", async () => {
    const requests = mockApi({
      "PATCH /api/v1/confirmation": problem(422, "token_expired"),
      "POST /api/v1/confirmation": { status: 202 },
    });
    openLink("/confirmation", "old-token");
    renderScreen(<ConfirmationScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "メールアドレスを確認する" }));
    expect(await screen.findByText(/有効期限（24時間）が過ぎています/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "確認のメールを送る" }));

    expect(await screen.findByText(/該当するアカウントがある場合、確認のメールを送りました/)).toBeInTheDocument();
    expect(sentBody(requests, "POST /api/v1/confirmation")).toEqual({ email: "user@example.com" });
  });

  it("tokenがなければ理由を示して再送の画面にする", async () => {
    mockApi({});
    openLink("/confirmation");
    renderScreen(<ConfirmationScreen />);

    expect(await screen.findByRole("button", { name: "確認のメールを送る" })).toBeInTheDocument();
    expect(screen.getByText(/リンクが正しくありません/)).toBeInTheDocument();
  });

  it("契約の上限（256文字）までのtokenは送り、超えるtokenは使わない", async () => {
    const requests = mockApi({ "PATCH /api/v1/confirmation": { status: 204 } });
    openLink("/confirmation", "a".repeat(256));
    const { unmount } = renderScreen(<ConfirmationScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "メールアドレスを確認する" }));
    await screen.findByText("メールアドレスを確認しました");
    expect(sentBody(requests, "PATCH /api/v1/confirmation")).toEqual({ token: "a".repeat(256) });
    unmount();

    openLink("/confirmation", "a".repeat(257));
    renderScreen(<ConfirmationScreen />);
    expect(await screen.findByRole("button", { name: "確認のメールを送る" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "メールアドレスを確認する" })).not.toBeInTheDocument();
  });
});

describe("tokenの画面での古いタブの案内", () => {
  it("CSRFの再送の後も合わなければ、再読み込みではなくメールのリンクを開き直すよう示す（tokenはURLから消してあるため）", async () => {
    mockApi({ "PATCH /api/v1/confirmation": problem(403, "csrf_invalid") });
    openLink("/confirmation", "secret-token");
    renderScreen(<ConfirmationScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "メールアドレスを確認する" }));

    expect(await screen.findByText(/メールのリンクをもう一度開いてから/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "再読み込み" })).not.toBeInTheDocument();
  });
});

describe("PasswordForgotScreen", () => {
  it("登録の有無を明かさない受付を示す", async () => {
    const requests = mockApi({ "POST /api/v1/password": { status: 202 } });
    renderScreen(<PasswordForgotScreen />);

    fireEvent.change(await screen.findByLabelText("メールアドレス"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定のメールを送る" }));

    expect(await screen.findByText(/該当するアカウントがある場合、パスワード再設定のメールを送りました/)).toBeInTheDocument();
    expect(sentBody(requests, "POST /api/v1/password")).toEqual({ email: "user@example.com" });
  });
});

describe("PasswordResetScreen", () => {
  it("新しいpasswordとtokenを送り、ログインへ案内する", async () => {
    const requests = mockApi({ "PATCH /api/v1/password": { status: 204 } });
    openLink("/password/reset", "reset-token");
    renderScreen(<PasswordResetScreen />);

    fireEvent.change(await screen.findByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText("パスワードを再設定しました")).toBeInTheDocument();
    expect(sentBody(requests, "PATCH /api/v1/password")).toEqual({ token: "reset-token", password: "new-password-1" });
  });

  it("新しいパスワードの欄は、文字数をHTMLで制限しない（補助文字を含むパスワードを切り詰めない）", async () => {
    mockApi({});
    openLink("/password/reset", "reset-token");
    renderScreen(<PasswordResetScreen />);

    expect(await screen.findByLabelText("新しいパスワード")).not.toHaveAttribute("maxlength");
  });

  it("login中に再設定したら、状態を取り直して未認証にしてからログインへ案内する", async () => {
    // 再設定でserverは既存のCookieを無効にする。取り直さないと、ログイン画面が古い認証済みを見てHomeへ戻す。
    let sessionCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/session") {
          sessionCount += 1;
          return Response.json(
            sessionCount === 1
              ? {
                  authenticated: true,
                  csrf_token: "t1",
                  expires_at: "2099-01-01T00:00:00Z",
                  account_status: "active",
                  user: {
                    id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
                    email: "a@example.com",
                    email_confirmed: true,
                    sign_in_methods: ["password"],
                  },
                }
              : { authenticated: false, csrf_token: "t2" },
          );
        }
        if (init?.method === "PATCH" && path === "/api/v1/password") return new Response(null, { status: 204 });
        throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
      }),
    );
    function StatusProbe() {
      return <p>{`status:${useAuth().status}`}</p>;
    }
    openLink("/password/reset", "reset-token");
    renderScreen(
      <>
        <PasswordResetScreen />
        <StatusProbe />
      </>,
    );
    await screen.findByText("status:authenticated");

    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText("パスワードを再設定しました")).toBeInTheDocument();
    expect(screen.getByText("status:anonymous")).toBeInTheDocument();
  });

  it("再設定の前に始まった取り直しが認証済みを返しても、再設定の後に取り直して未認証にする", async () => {
    const signedIn = {
      authenticated: true,
      csrf_token: "t1",
      expires_at: "2099-01-01T00:00:00Z",
      account_status: "active",
      user: {
        id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
        email: "a@example.com",
        email_confirmed: true,
        sign_in_methods: ["password"],
      },
    };
    let sessionCount = 0;
    let releaseStale: () => void = () => undefined;
    let patched = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/session") {
          sessionCount += 1;
          if (sessionCount === 1) return Response.json(signedIn);
          // 2回目（再設定の前に始まった取り直し）は、再設定の後に認証済みを返す
          if (sessionCount === 2) {
            return new Promise<Response>((resolve) => {
              releaseStale = () => resolve(Response.json(signedIn));
            });
          }
          return Response.json(patched ? { authenticated: false, csrf_token: "t2" } : signedIn);
        }
        if (init?.method === "PATCH" && path === "/api/v1/password") {
          patched = true;
          setTimeout(() => releaseStale(), 0);
          return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
      }),
    );
    function StatusProbe() {
      return <p>{`status:${useAuth().status}`}</p>;
    }
    openLink("/password/reset", "reset-token");
    renderScreen(
      <>
        <PasswordResetScreen />
        <StatusProbe />
      </>,
    );
    await screen.findByText("status:authenticated");
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(sessionCount).toBe(2));

    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText("パスワードを再設定しました")).toBeInTheDocument();
    // 古い応答が届き、その後に再設定の後の取り直し（3回目）が終わってから確かめる
    await waitFor(() => expect(sessionCount).toBe(3));
    await waitFor(() => expect(screen.getByText("status:anonymous")).toBeInTheDocument());
  });

  it("再設定がserverで済んだのに応答を失っても、状態を取り直して未認証にする", async () => {
    let patched = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/session") {
          return Response.json(
            patched
              ? { authenticated: false, csrf_token: "t2" }
              : {
                  authenticated: true,
                  csrf_token: "t1",
                  expires_at: "2099-01-01T00:00:00Z",
                  account_status: "active",
                  user: {
                    id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
                    email: "a@example.com",
                    email_confirmed: true,
                    sign_in_methods: ["password"],
                  },
                },
          );
        }
        if (init?.method === "PATCH" && path === "/api/v1/password") {
          // serverでは再設定が済み、応答だけが届かない
          patched = true;
          throw new TypeError("Failed to fetch");
        }
        throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
      }),
    );
    function StatusProbe() {
      return <p>{`status:${useAuth().status}`}</p>;
    }
    openLink("/password/reset", "reset-token");
    renderScreen(
      <>
        <PasswordResetScreen />
        <StatusProbe />
      </>,
    );
    await screen.findByText("status:authenticated");

    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText("status:anonymous")).toBeInTheDocument();
    // 送り直すとtokenが使用済みになるため、済んでいる可能性とログインへの導線を示す
    expect(screen.getByText(/再設定できたか確かめられませんでした/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ログインへ" })).toBeInTheDocument();
  });

  it("再設定の直後にofflineになっても、認証済みを残さない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/session") {
          return Response.json({
            authenticated: true,
            csrf_token: "t1",
            expires_at: "2099-01-01T00:00:00Z",
            account_status: "active",
            user: {
              id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
              email: "a@example.com",
              email_confirmed: true,
              sign_in_methods: ["password"],
            },
          });
        }
        if (init?.method === "PATCH" && path === "/api/v1/password") {
          // 応答の直後に回線が切れ、取り直しは一時停止する
          onlineManager.setOnline(false);
          return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
      }),
    );
    function StatusProbe() {
      return <p>{`status:${useAuth().status}`}</p>;
    }
    openLink("/password/reset", "reset-token");
    renderScreen(
      <>
        <PasswordResetScreen />
        <StatusProbe />
      </>,
    );
    await screen.findByText("status:authenticated");

    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText("パスワードを再設定しました")).toBeInTheDocument();
    expect(screen.getByText("status:anonymous")).toBeInTheDocument();
  });

  it("再設定の後の取り直しが返らなくても、待たずに未認証にして完了を示す", async () => {
    let patched = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/session") {
          if (patched) return new Promise<Response>(() => undefined);
          return Response.json({
            authenticated: true,
            csrf_token: "t1",
            expires_at: "2099-01-01T00:00:00Z",
            account_status: "active",
            user: {
              id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
              email: "a@example.com",
              email_confirmed: true,
              sign_in_methods: ["password"],
            },
          });
        }
        if (init?.method === "PATCH" && path === "/api/v1/password") {
          patched = true;
          return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
      }),
    );
    function StatusProbe() {
      return <p>{`status:${useAuth().status}`}</p>;
    }
    openLink("/password/reset", "reset-token");
    renderScreen(
      <>
        <PasswordResetScreen />
        <StatusProbe />
      </>,
    );
    await screen.findByText("status:authenticated");

    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText("パスワードを再設定しました")).toBeInTheDocument();
    expect(screen.getByText("status:anonymous")).toBeInTheDocument();
  });

  it.each([
    ["serverのerror（500）", 500, "internal_error", "status:anonymous"],
    ["回数の制限（429）", 429, "rate_limited", "status:authenticated"],
    ["期限切れ（422）", 422, "token_expired", "status:authenticated"],
    ["CSRF（403）", 403, "csrf_invalid", "status:authenticated"],
  ])("%s: 済んだかもしれない失敗なら未認証に、行われなかった失敗なら認証済みのままにする", async (_, status, code, expected) => {
    let sessionCount = 0;
    let patchSent = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/session") {
          sessionCount += 1;
          // 送った後の取り直しは少し遅れて返す（その間の表示も確かめるため）
          if (sessionCount > 1) await new Promise((resolve) => setTimeout(resolve, 20));
          // 500の後の取り直しは、serverで済んでいたとして未認証を返す
          if (sessionCount > 1 && code === "internal_error") return Response.json({ authenticated: false, csrf_token: "t2" });
          return Response.json({
            authenticated: true,
            csrf_token: "t1",
            expires_at: "2099-01-01T00:00:00Z",
            account_status: "active",
            user: {
              id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
              email: "a@example.com",
              email_confirmed: true,
              sign_in_methods: ["password"],
            },
          });
        }
        if (init?.method === "PATCH" && path === "/api/v1/password") {
          patchSent = true;
          return Response.json(
            { type: `urn:focus-on-dot:problem:${code}`, title: "x", status, code, retry_after_seconds: 60 },
            { status, headers: { "Content-Type": "application/problem+json" } },
          );
        }
        throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
      }),
    );
    function StatusProbe() {
      const { status, identityEpoch } = useAuth();
      return <p>{`status:${status} epoch:${identityEpoch}`}</p>;
    }
    openLink("/password/reset", "reset-token");
    renderScreen(
      <>
        <PasswordResetScreen />
        <StatusProbe />
      </>,
    );
    const before = (await screen.findByText(/status:authenticated/)).textContent;

    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    // 送った後の処理（取り直しを含む）が落ち着くまで待ってから、状態を確かめる
    await waitFor(() => expect(patchSent).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (expected === "status:authenticated") {
      // 行われなかった失敗では、一度も未認証にせず、個人データを消さない（利用者の世代が変わらない）
      expect(screen.getByText(/status:/).textContent).toBe(before);
    } else {
      expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    }
  });

  it("再設定を受け付けなかった（入力の誤り）ときは、認証済みのままにする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/session") {
          return Response.json({
            authenticated: true,
            csrf_token: "t1",
            expires_at: "2099-01-01T00:00:00Z",
            account_status: "active",
            user: {
              id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
              email: "a@example.com",
              email_confirmed: true,
              sign_in_methods: ["password"],
            },
          });
        }
        if (init?.method === "PATCH" && path === "/api/v1/password") {
          return Response.json(
            {
              type: "urn:focus-on-dot:problem:validation_failed",
              title: "x",
              status: 422,
              code: "validation_failed",
              errors: [{ field: "password", code: "out_of_range" }],
            },
            { status: 422, headers: { "Content-Type": "application/problem+json" } },
          );
        }
        throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
      }),
    );
    function StatusProbe() {
      return <p>{`status:${useAuth().status}`}</p>;
    }
    openLink("/password/reset", "reset-token");
    renderScreen(
      <>
        <PasswordResetScreen />
        <StatusProbe />
      </>,
    );
    await screen.findByText("status:authenticated");

    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText("8文字以上で入力してください。")).toBeInTheDocument();
    expect(screen.getByText("status:authenticated")).toBeInTheDocument();
  });

  it.each([
    ["未認証", { authenticated: false, csrf_token: "t0" }],
    [
      "別の利用者",
      {
        authenticated: true,
        csrf_token: "t0",
        expires_at: "2099-01-01T00:00:00Z",
        account_status: "active",
        user: {
          id: "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
          email: "b@example.com",
          email_confirmed: true,
          sign_in_methods: ["password"],
        },
      },
    ],
  ])("cacheが%sでも、再設定の前に送られた取得の認証済みを信じない", async (_, initial) => {
    // 別のタブでtokenの持ち主Aとしてloginした後、このタブへ戻った取り直しの応答が、再設定の後に届く
    const signedInA = {
      authenticated: true,
      csrf_token: "t1",
      expires_at: "2099-01-01T00:00:00Z",
      account_status: "active",
      user: {
        id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
        email: "a@example.com",
        email_confirmed: true,
        sign_in_methods: ["password"],
      },
    };
    let sessionCount = 0;
    let releaseStale: () => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/session") {
          sessionCount += 1;
          if (sessionCount === 1) return Response.json(initial);
          if (sessionCount === 2) {
            return new Promise<Response>((resolve) => {
              releaseStale = () => resolve(Response.json(signedInA));
            });
          }
          return Response.json({ authenticated: false, csrf_token: "t2" });
        }
        if (init?.method === "PATCH" && path === "/api/v1/password") {
          setTimeout(() => releaseStale(), 0);
          return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected request: ${init?.method ?? "GET"} ${path}`);
      }),
    );
    function StatusProbe() {
      return <p>{`status:${useAuth().status}`}</p>;
    }
    openLink("/password/reset", "reset-token");
    renderScreen(
      <>
        <PasswordResetScreen />
        <StatusProbe />
      </>,
    );
    await waitFor(() => expect(sessionCount).toBe(1));
    await screen.findByText(/status:(anonymous|authenticated)/);
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(sessionCount).toBe(2));

    fireEvent.change(screen.getByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText("パスワードを再設定しました")).toBeInTheDocument();
    await waitFor(() => expect(sessionCount).toBe(3));
    await waitFor(() => expect(screen.getByText("status:anonymous")).toBeInTheDocument());
  });

  it("失敗の応答の形が契約と合わないときも、済んでいる可能性があるためログインを先に示す", async () => {
    mockApi({ "PATCH /api/v1/password": { status: 422, body: { type: "x", title: "x", status: 422, code: "unknown_code" } } });
    openLink("/password/reset", "reset-token");
    renderScreen(<PasswordResetScreen />);

    fireEvent.change(await screen.findByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText(/再設定できたか確かめられませんでした/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ログインへ" })).toBeInTheDocument();
  });

  it("送り直してtoken_invalidになったら、済んでいる可能性とログインへの導線を示す", async () => {
    mockApi({ "PATCH /api/v1/password": problem(422, "token_invalid") });
    openLink("/password/reset", "used-token");
    renderScreen(<PasswordResetScreen />);

    fireEvent.change(await screen.findByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText(/直前に再設定した場合は、新しいパスワードでログインできます/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ログインへ" })).toBeInTheDocument();
  });

  it("passwordが短ければ項目に示す", async () => {
    mockApi({
      "PATCH /api/v1/password": {
        status: 422,
        body: {
          type: "urn:focus-on-dot:problem:validation_failed",
          title: "x",
          status: 422,
          code: "validation_failed",
          errors: [{ field: "password", code: "out_of_range" }],
        },
      },
    });
    openLink("/password/reset", "reset-token");
    renderScreen(<PasswordResetScreen />);

    fireEvent.change(await screen.findByLabelText("新しいパスワード"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText("8文字以上で入力してください。")).toBeInTheDocument();
  });

  it("使えないtokenなら再設定のメールの送り直しへ案内する", async () => {
    mockApi({ "PATCH /api/v1/password": problem(422, "token_invalid") });
    openLink("/password/reset", "used-token");
    renderScreen(<PasswordResetScreen />);

    fireEvent.change(await screen.findByLabelText("新しいパスワード"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "再設定する" }));

    expect(await screen.findByText(/使用済みか、正しくないリンクです/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "再設定のメールを送り直す" })).toHaveAttribute("href", "/password/forgot");
  });
});

describe("UnlockScreen", () => {
  it("操作でロックを解除する", async () => {
    const requests = mockApi({ "PATCH /api/v1/unlock": { status: 204 } });
    openLink("/unlock", "unlock-token");
    renderScreen(<UnlockScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "ロックを解除する" }));

    expect(await screen.findByText("ロックを解除しました")).toBeInTheDocument();
    expect(sentBody(requests, "PATCH /api/v1/unlock")).toEqual({ token: "unlock-token" });
  });

  it("使えないtokenなら、1時間で自動で解けることを示す", async () => {
    mockApi({ "PATCH /api/v1/unlock": problem(422, "token_invalid") });
    openLink("/unlock", "used-token");
    renderScreen(<UnlockScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "ロックを解除する" }));

    expect(await screen.findByText(/1時間で自動でも解除されます/)).toBeInTheDocument();
    // 応答を失って送り直した場合も分かるよう、解除が済んでいればログインできることを示す
    expect(screen.getByText(/直前に解除した場合は、そのままログインできます/)).toBeInTheDocument();
  });
});
