import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

import { isProblem } from "@/libs/api-client/request";
import { AuthProvider, useAuth } from "./auth-provider";

// Rails APIの応答（契約の形）をfetchの差し替えで模す。実serverには接続しない。
type Reply = { status: number; body?: unknown } | Error;

const USER_A = "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10";
const USER_B = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

function authenticated(id: string, token: string, expiresAt = "2099-01-01T00:00:00Z") {
  return {
    status: 200,
    body: {
      authenticated: true,
      csrf_token: token,
      expires_at: expiresAt,
      account_status: "active",
      user: { id, email: "user@example.com", email_confirmed: true, sign_in_methods: ["password"] },
    },
  };
}

function anonymous(token: string) {
  return { status: 200, body: { authenticated: false, csrf_token: token } };
}

function problem(status: number, code: string) {
  return { status, body: { type: `urn:focus-on-dot:problem:${code}`, title: "x", status, code } };
}

/** `METHOD path`ごとに応答の列を用意する。列の最後の応答は使い続ける。 */
function mockApi(routes: Record<string, Reply[]>) {
  const calls: { key: string; csrf?: string }[] = [];
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ key, csrf: headers["X-CSRF-Token"] });
    const queue = routes[key];
    if (!queue) throw new Error(`unexpected request: ${key}`);
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    if (reply instanceof Error) throw reply;
    if (reply.body === undefined) return new Response(null, { status: reply.status });
    const type = reply.status >= 400 ? "application/problem+json" : "application/json";
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": type } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderAuth() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result: { current: ReturnType<typeof useAuth> | null } = { current: null };
  const onIdentityChange = vi.fn();

  function Probe() {
    const auth = useAuth();
    result.current = auth;
    return null;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  const auth = () => result.current!;
  return { auth, queryClient, onIdentityChange };
}

async function renderAndSubscribe() {
  const rendered = renderAuth();
  await waitFor(() => expect(rendered.auth().status).not.toBe("checking"));
  rendered.auth().subscribeIdentityChange(rendered.onIdentityChange);
  return rendered;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe("認証状態", () => {
  it("serverの応答から利用者と期限を得る", async () => {
    mockApi({ "GET /api/v1/session": [authenticated(USER_A, "t1", "2026-10-12T03:00:00Z")] });

    const { auth } = renderAuth();
    expect(auth().status).toBe("checking");

    await waitFor(() => expect(auth().status).toBe("authenticated"));
    expect(auth().user?.id).toBe(USER_A);
    expect(auth().expiresAt).toBe("2026-10-12T03:00:00Z");
    expect(auth().csrfToken).toBe("t1");
  });

  it("取得に失敗したら未認証と区別してunknownにし、取り直せる", async () => {
    mockApi({ "GET /api/v1/session": [new TypeError("Failed to fetch"), anonymous("t1")] });

    const { auth } = renderAuth();
    await waitFor(() => expect(auth().status).toBe("unknown"));

    await act(() => auth().refresh());
    await waitFor(() => expect(auth().status).toBe("anonymous"));
  });

  it("退会を受理した利用者はdeletion_in_progressにする", async () => {
    const reply = authenticated(USER_A, "t1");
    mockApi({
      "GET /api/v1/session": [{ ...reply, body: { ...(reply.body as object), account_status: "deletion_in_progress" } }],
    });

    const { auth } = renderAuth();
    await waitFor(() => expect(auth().status).toBe("deletion_in_progress"));
  });
});

describe("login", () => {
  it("取得したCSRF tokenで送り、成功したら利用者の切り替わりを通知する", async () => {
    const calls = mockApi({
      "GET /api/v1/session": [anonymous("t1")],
      "POST /api/v1/session": [authenticated(USER_A, "t2")],
    });
    const { auth, onIdentityChange } = await renderAndSubscribe();

    await act(() => auth().signIn({ email: "user@example.com", password: "password123" }));

    expect(calls.find((c) => c.key === "POST /api/v1/session")?.csrf).toBe("t1");
    await waitFor(() => expect(auth().status).toBe("authenticated"));
    expect(auth().csrfToken).toBe("t2");
    expect(onIdentityChange).toHaveBeenCalledTimes(1);
  });

  it("csrf_invalidならtokenを取り直して1回だけ再送する", async () => {
    const calls = mockApi({
      "GET /api/v1/session": [anonymous("old"), anonymous("new")],
      "POST /api/v1/session": [problem(403, "csrf_invalid"), authenticated(USER_A, "t2")],
    });
    const { auth } = await renderAndSubscribe();

    await act(() => auth().signIn({ email: "user@example.com", password: "password123" }));

    expect(calls.filter((c) => c.key === "POST /api/v1/session").map((c) => c.csrf)).toEqual(["old", "new"]);
    await waitFor(() => expect(auth().status).toBe("authenticated"));
  });

  it("再送でもcsrf_invalidなら、それ以上は送らずに失敗を返す", async () => {
    const calls = mockApi({
      "GET /api/v1/session": [anonymous("t1")],
      "POST /api/v1/session": [problem(403, "csrf_invalid")],
    });
    const { auth } = await renderAndSubscribe();

    const error = await auth()
      .signIn({ email: "user@example.com", password: "password123" })
      .catch((e: unknown) => e);

    expect(isProblem(error, "csrf_invalid")).toBe(true);
    expect(calls.filter((c) => c.key === "POST /api/v1/session")).toHaveLength(2);
  });

  it("passwordの不一致では認証の終了として扱わない", async () => {
    mockApi({
      "GET /api/v1/session": [anonymous("t1")],
      "POST /api/v1/session": [problem(401, "invalid_credentials")],
    });
    const { auth, onIdentityChange } = await renderAndSubscribe();

    await auth()
      .signIn({ email: "user@example.com", password: "wrong" })
      .catch(() => undefined);

    expect(auth().status).toBe("anonymous");
    expect(auth().endReason).toBeNull();
    expect(onIdentityChange).not.toHaveBeenCalled();
  });
});

describe("保護APIの呼び出し中の失効", () => {
  it("session_expiredなら期限切れとして未認証にし、個人データのqueryを消して通知する", async () => {
    mockApi({
      "GET /api/v1/session": [authenticated(USER_A, "t1"), anonymous("t2")],
      "GET /api/v1/days/today": [problem(401, "session_expired")],
    });
    const { auth, queryClient, onIdentityChange } = await renderAndSubscribe();
    queryClient.setQueryData(["days", "today"], { private: true });

    const error = await auth()
      .request("/api/v1/days/today")
      .catch((e: unknown) => e);

    expect(isProblem(error, "session_expired")).toBe(true);
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().endReason).toBe("expired");
    expect(onIdentityChange).toHaveBeenCalled();
    expect(queryClient.getQueryData(["days", "today"])).toBeUndefined();
  });

  it("取り直しに失敗しても、未認証として保護する画面を閉じる", async () => {
    mockApi({
      "GET /api/v1/session": [authenticated(USER_A, "t1"), new TypeError("Failed to fetch")],
      "GET /api/v1/days/today": [problem(401, "unauthenticated")],
    });
    const { auth } = await renderAndSubscribe();

    await auth()
      .request("/api/v1/days/today")
      .catch(() => undefined);

    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().endReason).toBe("session_lost");
  });
});

describe("logout", () => {
  it("成功したら未認証にし、logoutしたことを残す", async () => {
    const calls = mockApi({
      "GET /api/v1/session": [authenticated(USER_A, "t1"), anonymous("t2")],
      "DELETE /api/v1/session": [{ status: 204 }],
    });
    const { auth, onIdentityChange } = await renderAndSubscribe();

    await act(() => auth().signOut());

    expect(calls.find((c) => c.key === "DELETE /api/v1/session")?.csrf).toBe("t1");
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().endReason).toBe("signed_out");
    expect(onIdentityChange).toHaveBeenCalled();
  });

  it("失敗したら投げ、個人データは消すがlogin中のままにする", async () => {
    mockApi({
      "GET /api/v1/session": [authenticated(USER_A, "t1")],
      "DELETE /api/v1/session": [new TypeError("Failed to fetch")],
    });
    const { auth, onIdentityChange } = await renderAndSubscribe();

    await expect(auth().signOut()).rejects.toThrow();

    expect(onIdentityChange).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(auth().status).toBe("authenticated"));
    expect(auth().endReason).toBeNull();
  });
});

describe("別タブ・期限での変化", () => {
  it("画面へ戻ったときに別の利用者へ変わっていれば通知する", async () => {
    mockApi({ "GET /api/v1/session": [authenticated(USER_A, "t1"), authenticated(USER_B, "t2")] });
    const { auth, onIdentityChange } = await renderAndSubscribe();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(auth().user?.id).toBe(USER_B));
    expect(onIdentityChange).toHaveBeenCalledTimes(1);
    expect(auth().endReason).toBeNull();
  });

  it("画面へ戻ったときに別タブでlogoutされていれば、期限前なのでsession_lostにする", async () => {
    mockApi({ "GET /api/v1/session": [authenticated(USER_A, "t1"), anonymous("t2")] });
    const { auth } = await renderAndSubscribe();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().endReason).toBe("session_lost");
  });

  it("期限の時刻に取り直し、未認証になっていれば期限切れにする", async () => {
    const expiresAt = new Date(Date.now() + 100).toISOString().replace(/\.\d+Z$/, "Z");
    mockApi({ "GET /api/v1/session": [authenticated(USER_A, "t1", expiresAt), anonymous("t2")] });
    const { auth, onIdentityChange } = await renderAndSubscribe();

    await waitFor(() => expect(auth().status).toBe("anonymous"), { timeout: 4000 });
    expect(auth().endReason).toBe("expired");
    expect(onIdentityChange).toHaveBeenCalledTimes(1);
  });
});
