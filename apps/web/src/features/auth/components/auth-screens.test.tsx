import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { AuthProvider, useAuth } from "../auth-provider";
import { AccountScreen } from "./account-screen";
import { RequireAuth } from "./require-auth";
import { SignInScreen } from "./sign-in-screen";
import { SignInPrompt } from "./sign-in-prompt";
import { SignUpScreen } from "./sign-up-screen";

// 画面遷移は、遷移先を文字で表すだけの差し替えで確かめる。
const locationMock = vi.hoisted(() => ({ pathname: "/record" }));
vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to, search }: { to: string; search?: Record<string, string> }) => (
    <p>{`navigate:${to}${search && Object.keys(search).length > 0 ? `?${new URLSearchParams(search)}` : ""}`}</p>
  ),
  Link: ({
    to,
    search,
    children,
    className,
  }: {
    to: string;
    search?: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={search ? `${to}?${new URLSearchParams(search)}` : to} className={className}>
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

    expect(await screen.findByText(/確認が済んでいない登録があれば、確認のメールを送ります/)).toBeInTheDocument();
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

describe("logoutの後の案内と戻り先", () => {
  it("設定画面でlogoutしたら、戻り先を付けずにログインへ移る", async () => {
    locationMock.pathname = "/settings";
    mockApi({
      "GET /api/v1/session": [signedIn, anonymous],
      "DELETE /api/v1/session": [{ status: 204 }],
    });
    renderWithAuth(
      <RequireAuth>
        <AccountScreen />
      </RequireAuth>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "ログアウト" }));

    expect(await screen.findByText("navigate:/login")).toBeInTheDocument();
    expect(screen.queryByText(/redirect=/)).not.toBeInTheDocument();
  });

  it("「ログアウトしました」は1回だけ案内し、次に開いたときは出さない", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn, anonymous],
      "DELETE /api/v1/session": [{ status: 204 }],
    });
    function Harness() {
      const { signOut } = useAuth();
      const [openCount, setOpenCount] = useState(0);
      return (
        <div>
          <button onClick={() => void signOut()}>logout</button>
          <button onClick={() => setOpenCount((n) => n + 1)}>open</button>
          {openCount > 0 && <SignInScreen key={openCount} redirect="/" />}
        </div>
      );
    }
    renderWithAuth(<Harness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "logout" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(await screen.findByText("ログアウトしました。")).toBeInTheDocument();

    // 開き直すと、もう案内しない
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    await waitFor(() => expect(screen.queryByText("ログアウトしました。")).not.toBeInTheDocument());
  });
});

describe("SignUpScreen", () => {
  function fillSignUp(password = "password1234") {
    fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: password } });
    fireEvent.click(screen.getByRole("button", { name: "登録する" }));
  }

  it("登録済みかどうかにかかわらず同じ受付を示す", async () => {
    const requests = mockApi({ "GET /api/v1/session": [anonymous], "POST /api/v1/registration": [{ status: 202 }] });
    renderWithAuth(<SignUpScreen />);
    await screen.findByRole("button", { name: "登録する" });

    fillSignUp();

    expect(await screen.findByText(/すでに登録済みの場合は、ログイン方法の案内が届きます/)).toBeInTheDocument();
    expect(JSON.parse(requests.find((r) => r.key === "POST /api/v1/registration")!.body!)).toEqual({
      email: "new@example.com",
      password: "password1234",
    });
  });

  it("項目ごとの失敗は項目に示し、共通の文言は出さない", async () => {
    mockApi({
      "GET /api/v1/session": [anonymous],
      "POST /api/v1/registration": [
        problem(422, "validation_failed", { errors: [{ field: "password", code: "out_of_range" }] }),
      ],
    });
    renderWithAuth(<SignUpScreen />);
    await screen.findByRole("button", { name: "登録する" });

    fillSignUp("short");

    expect(await screen.findByText("8文字以上で入力してください。")).toBeInTheDocument();
    expect(screen.queryByText("入力内容を確かめてください。")).not.toBeInTheDocument();
  });

  it("項目の横に出せない項目の失敗は、共通の文言で示す", async () => {
    mockApi({
      "GET /api/v1/session": [anonymous],
      "POST /api/v1/registration": [
        problem(422, "validation_failed", { errors: [{ field: "base", code: "not_allowed" }] }),
      ],
    });
    renderWithAuth(<SignUpScreen />);
    await screen.findByRole("button", { name: "登録する" });

    fillSignUp();

    expect(await screen.findByText("入力内容を確かめてください。")).toBeInTheDocument();
  });

  it("csrf_invalidが続いたら再読み込みを案内する", async () => {
    mockApi({ "GET /api/v1/session": [anonymous], "POST /api/v1/registration": [problem(403, "csrf_invalid")] });
    renderWithAuth(<SignUpScreen />);
    await screen.findByRole("button", { name: "登録する" });

    fillSignUp();

    expect(await screen.findByRole("button", { name: "再読み込み" })).toBeInTheDocument();
  });
});

describe("SignInPrompt", () => {
  it("未認証のときだけ、録音へ戻るログインの導線を出す", async () => {
    mockApi({ "GET /api/v1/session": [anonymous] });
    renderWithAuth(<SignInPrompt />);

    expect(await screen.findByRole("link", { name: "ログイン・新規登録" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Frecord",
    );
  });

  it("login中は出さない", async () => {
    mockApi({ "GET /api/v1/session": [signedIn] });
    function StatusProbe() {
      return <p>{`status:${useAuth().status}`}</p>;
    }
    renderWithAuth(
      <>
        <StatusProbe />
        <SignInPrompt />
      </>,
    );

    await screen.findByText("status:authenticated");
    expect(screen.queryByRole("link", { name: "ログイン・新規登録" })).not.toBeInTheDocument();
  });
});

describe("SignInScreen（login済み）", () => {
  it("login済みで開いたら戻り先へ進む", async () => {
    mockApi({ "GET /api/v1/session": [signedIn] });
    renderWithAuth(<SignInScreen redirect="/settings" />);

    expect(await screen.findByText("navigate:/settings")).toBeInTheDocument();
  });

  it("状態を確かめられないまま開いたら、logoutが済んでいない可能性を示す", async () => {
    mockApi({ "GET /api/v1/session": [new TypeError("Failed to fetch")] });
    renderWithAuth(<SignInScreen redirect="/" />);

    expect(await screen.findByText(/まだログアウトできていない可能性があります/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "状態を確かめ直す" })).toBeInTheDocument();
  });
});

describe("logoutに失敗したとき（共有端末で済んだと思わせない）", () => {
  it("logoutも状態の取り直しも失敗したら、設定画面の代わりにlogoutが済んでいない可能性を示す", async () => {
    locationMock.pathname = "/settings";
    mockApi({
      "GET /api/v1/session": [signedIn, new TypeError("Failed to fetch")],
      "DELETE /api/v1/session": [new TypeError("Failed to fetch")],
    });
    renderWithAuth(
      <RequireAuth>
        <AccountScreen />
      </RequireAuth>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "ログアウト" }));

    expect(await screen.findByText(/まだログアウトできていない可能性があります/)).toBeInTheDocument();
    expect(screen.queryByText(/navigate:\/login/)).not.toBeInTheDocument();
  });
});

describe("Googleでのlogin", () => {
  it("formを送る前に、前の利用者の個人データを消すよう通知する", async () => {
    mockApi({ "GET /api/v1/session": [anonymous] });
    const onIdentityChange = vi.fn();
    function Subscriber() {
      const { subscribeIdentityChange } = useAuth();
      useState(() => subscribeIdentityChange(onIdentityChange));
      return null;
    }
    const { container } = renderWithAuth(
      <>
        <Subscriber />
        <SignInScreen redirect="/" />
      </>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Googleでログイン" })).toBeEnabled());

    fireEvent.submit(container.querySelector('form[action="/auth/google_oauth2"]') as HTMLFormElement);

    expect(onIdentityChange).toHaveBeenCalledTimes(1);
  });
});

describe("確認メールの再送", () => {
  it("未確認と分かったときに送ったメールアドレスへ頼む（入力欄を後で書き換えても変わらない）", async () => {
    const requests = mockApi({
      "GET /api/v1/session": [anonymous],
      "POST /api/v1/session": [problem(403, "email_unconfirmed")],
      "POST /api/v1/confirmation": [{ status: 202 }],
    });
    renderWithAuth(<SignInScreen redirect="/" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "ログイン" })).toBeEnabled());

    fillSignIn();
    const resend = await screen.findByRole("button", { name: "確認メールを送り直す" });
    fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "other@example.com" } });
    fireEvent.click(resend);

    await screen.findByText(/確認が済んでいない登録があれば/);
    expect(JSON.parse(requests.find((r) => r.key === "POST /api/v1/confirmation")!.body!)).toEqual({
      email: "user@example.com",
    });
  });
});
