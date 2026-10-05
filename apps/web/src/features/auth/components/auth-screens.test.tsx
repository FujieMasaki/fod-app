import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AuthProvider } from "../auth-provider";
import { AccountScreen } from "./account-screen";
import { RequireAuth } from "./require-auth";
import { SignInScreen } from "./sign-in-screen";

// 画面遷移は、遷移先を文字で表すだけの差し替えで確かめる。
const locationMock = vi.hoisted(() => ({ pathname: "/record" }));
vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to, search }: { to: string; search?: Record<string, string> }) => (
    <p>{`navigate:${to}${search && Object.keys(search).length > 0 ? `?${new URLSearchParams(search)}` : ""}`}</p>
  ),
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useLocation: () => locationMock,
}));

// Rails APIの応答（契約の形）をfetchの差し替えで模す。`METHOD path`ごとの応答の列（最後は使い続ける）。
type Reply = { status: number; body?: unknown } | Error;

const signedIn = {
  status: 200,
  body: {
    authenticated: true,
    csrf_token: "t2",
    expires_at: "2026-10-12T03:00:00Z",
    account_status: "active",
    user: {
      id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
      email: "user@example.com",
      email_confirmed: true,
      sign_in_methods: ["password", "google"],
    },
  },
};
const anonymous = { status: 200, body: { authenticated: false, csrf_token: "t1" } };

function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return { status, body: { type: `urn:focus-on-dot:problem:${code}`, title: "x", detail: "serverの詳細", status, code, ...extra } };
}

function mockApi(routes: Record<string, Reply[]>) {
  const requests: { key: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${path}`;
      requests.push({ key, body: init?.body as string | undefined });
      const queue = routes[key];
      if (!queue) throw new Error(`unexpected request: ${key}`);
      const reply = queue.length > 1 ? queue.shift()! : queue[0];
      if (reply instanceof Error) throw reply;
      if (reply.body === undefined) return new Response(null, { status: reply.status });
      const type = reply.status >= 400 ? "application/problem+json" : "application/json";
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": type } });
    }),
  );
  return requests;
}

function renderWithAuth(ui: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>,
  );
}

function fillSignIn(password = "password123") {
  fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "user@example.com" } });
  fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  locationMock.pathname = "/record";
});

describe("RequireAuth", () => {
  it("確かめ終わるまで中身を出さず、login中なら表示する", async () => {
    mockApi({ "GET /api/v1/session": [signedIn] });
    renderWithAuth(<RequireAuth>本人の画面</RequireAuth>);

    expect(screen.queryByText("本人の画面")).not.toBeInTheDocument();
    expect(await screen.findByText("本人の画面")).toBeInTheDocument();
  });

  it("未認証なら今の画面を戻り先にしてログインへ移る", async () => {
    mockApi({ "GET /api/v1/session": [anonymous] });
    renderWithAuth(<RequireAuth>本人の画面</RequireAuth>);

    expect(await screen.findByText("navigate:/login?redirect=%2Frecord")).toBeInTheDocument();
    expect(screen.queryByText("本人の画面")).not.toBeInTheDocument();
  });

  it("戻り先にできない画面からはredirectを付けない", async () => {
    locationMock.pathname = "/processing";
    mockApi({ "GET /api/v1/session": [anonymous] });
    renderWithAuth(<RequireAuth>本人の画面</RequireAuth>);

    expect(await screen.findByText("navigate:/login")).toBeInTheDocument();
  });

  it("状態を確かめられなければ、未認証とせず再試行を出す", async () => {
    mockApi({ "GET /api/v1/session": [new TypeError("Failed to fetch"), signedIn] });
    renderWithAuth(<RequireAuth>本人の画面</RequireAuth>);

    fireEvent.click(await screen.findByRole("button", { name: "もう一度" }));
    expect(await screen.findByText("本人の画面")).toBeInTheDocument();
  });

  it("退会の手続き中は本人の画面を開かない", async () => {
    mockApi({ "GET /api/v1/session": [{ ...signedIn, body: { ...signedIn.body, account_status: "deletion_in_progress" } }] });
    renderWithAuth(<RequireAuth>本人の画面</RequireAuth>);

    expect(await screen.findByText("退会の手続き中です")).toBeInTheDocument();
    expect(screen.queryByText("本人の画面")).not.toBeInTheDocument();
  });
});

describe("SignInScreen", () => {
  it("自分専用端末向けで7日保たれることを示す", async () => {
    mockApi({ "GET /api/v1/session": [anonymous] });
    renderWithAuth(<SignInScreen redirect="/" />);

    expect(await screen.findByText(/自分専用の端末向けです。ログインは7日間保たれます/)).toBeInTheDocument();
  });

  it("成功したら戻り先へ進む", async () => {
    // login後の取り直しは新しいCookieで送られ、認証済みを返す
    const requests = mockApi({ "GET /api/v1/session": [anonymous, signedIn], "POST /api/v1/session": [signedIn] });
    renderWithAuth(<SignInScreen redirect="/record" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "ログイン" })).toBeEnabled());

    fillSignIn();

    expect(await screen.findByText("navigate:/record")).toBeInTheDocument();
    expect(JSON.parse(requests.find((r) => r.key === "POST /api/v1/session")!.body!)).toEqual({
      email: "user@example.com",
      password: "password123",
    });
  });

  it("失敗はcodeから文言を出し、serverの文言とpasswordを残さない", async () => {
    mockApi({ "GET /api/v1/session": [anonymous], "POST /api/v1/session": [problem(401, "invalid_credentials")] });
    renderWithAuth(<SignInScreen redirect="/" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "ログイン" })).toBeEnabled());

    fillSignIn("wrong-password");

    expect(await screen.findByText("メールアドレスまたはパスワードが違います。")).toBeInTheDocument();
    expect(screen.queryByText("serverの詳細")).not.toBeInTheDocument();
    expect(screen.getByLabelText("パスワード")).toHaveValue("");
  });

  it("メール未確認なら確認メールの再送へ案内する", async () => {
    const requests = mockApi({
      "GET /api/v1/session": [anonymous],
      "POST /api/v1/session": [problem(403, "email_unconfirmed")],
      "POST /api/v1/confirmation": [{ status: 202 }],
    });
    renderWithAuth(<SignInScreen redirect="/" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "ログイン" })).toBeEnabled());

    fillSignIn();
    fireEvent.click(await screen.findByRole("button", { name: "確認メールを送り直す" }));

    expect(await screen.findByText(/確認のメールを送りました/)).toBeInTheDocument();
    expect(JSON.parse(requests.find((r) => r.key === "POST /api/v1/confirmation")!.body!)).toEqual({
      email: "user@example.com",
    });
  });

  it("Googleの失敗の理由を示す", async () => {
    mockApi({ "GET /api/v1/session": [anonymous] });
    renderWithAuth(<SignInScreen redirect="/" authError="google_email_conflict" />);

    expect(await screen.findByText(/メールアドレスとパスワードで登録されています/)).toBeInTheDocument();
  });

  it("GoogleのformにCSRF tokenと戻り先を入れる", async () => {
    mockApi({ "GET /api/v1/session": [anonymous] });
    const { container } = renderWithAuth(<SignInScreen redirect="/record" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Googleでログイン" })).toBeEnabled());

    const form = container.querySelector('form[action="/auth/google_oauth2"]') as HTMLFormElement;
    expect(form.method).toBe("post");
    expect(Object.fromEntries(new FormData(form))).toEqual({
      authenticity_token: "t1",
      intent: "sign_in",
      return_to: "/record",
    });
  });
});

describe("AccountScreen", () => {
  it("login中のアカウントと期限（JST）を示す", async () => {
    mockApi({ "GET /api/v1/session": [signedIn] });
    renderWithAuth(<AccountScreen />);

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("メールアドレスとパスワード、Google")).toBeInTheDocument();
    expect(screen.getByText("10月12日 12:00まで")).toBeInTheDocument();
  });

  it("logoutに失敗したら、終わったと断定せずに再試行させる", async () => {
    mockApi({ "GET /api/v1/session": [signedIn], "DELETE /api/v1/session": [new TypeError("Failed to fetch")] });
    renderWithAuth(<AccountScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "ログアウト" }));

    expect(await screen.findByText(/ログアウトできたか確かめられませんでした/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログアウト" })).toBeEnabled();
  });
});
