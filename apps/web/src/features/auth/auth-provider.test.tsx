import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

import { ApiError, isProblem } from "@/libs/api-client/request";
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

  it("取り直しに失敗したら、前に得た認証済みのままにせずunknownにする", async () => {
    mockApi({ "GET /api/v1/session": [authenticated(USER_A, "t1"), new TypeError("Failed to fetch")] });
    const { auth } = renderAuth();
    await waitFor(() => expect(auth().status).toBe("authenticated"));

    await act(() => auth().refresh());

    await waitFor(() => expect(auth().status).toBe("unknown"));
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
      // login後の取り直しは新しいCookieで送られ、認証済みを返す
      "GET /api/v1/session": [anonymous("t1"), authenticated(USER_A, "t2")],
      "POST /api/v1/session": [authenticated(USER_A, "t2")],
    });
    const { auth, onIdentityChange } = await renderAndSubscribe();

    await act(() => auth().signIn({ email: "user@example.com", password: "password123" }));

    expect(calls.find((c) => c.key === "POST /api/v1/session")?.csrf).toBe("t1");
    await waitFor(() => expect(auth().status).toBe("authenticated"));
    expect(auth().csrfToken).toBe("t2");
    expect(onIdentityChange).toHaveBeenCalledTimes(1);
  });

  it("login前に始まった取り直しの応答を受け取ってからloginを送り、未認証へ戻さない", async () => {
    let releaseStale: (response: Response) => void = () => undefined;
    let getCount = 0;
    let postedAfterGet: boolean | null = null;
    let staleDone = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          postedAfterGet = staleDone;
          return Response.json(authenticated(USER_A, "t2").body);
        }
        getCount += 1;
        if (getCount === 1) return Response.json(anonymous("t1").body);
        // 2回目（画面へ戻ったときの取り直し）はlogin前のCookieで送られ、遅れて未認証を返す
        if (getCount === 2) {
          return new Promise<Response>((resolve) => {
            releaseStale = resolve;
          });
        }
        // login後の取り直しは新しいCookieで送られる
        return Response.json(authenticated(USER_A, "t3").body);
      }),
    );
    const { auth } = await renderAndSubscribe();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(getCount).toBe(2));
    const signingIn = auth().signIn({ email: "user@example.com", password: "password123" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(postedAfterGet).toBeNull();

    staleDone = true;
    releaseStale(Response.json(anonymous("t1").body));
    await act(() => signingIn);

    expect(postedAfterGet).toBe(true);
    await waitFor(() => expect(getCount).toBe(3));
    expect(auth().status).toBe("authenticated");
    expect(auth().endReason).toBeNull();
  });

  it("loginを待っている間に保護APIが401を返しても、loginより前に取り直しを送らない", async () => {
    const order: string[] = [];
    let releaseApi: (response: Response) => void = () => undefined;
    let getCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${path}`;
        if (key === "GET /api/v1/session") {
          getCount += 1;
          order.push(`GET${getCount}`);
          // 1回目はloginの前（Aのsessionが残っている）、2回目以降はloginの後
          return Response.json(getCount === 1 ? authenticated(USER_A, "t1").body : authenticated(USER_B, "t3").body);
        }
        order.push(key);
        if (key === "PATCH /api/v1/dots/a") {
          return new Promise<Response>((resolve) => {
            releaseApi = resolve;
          });
        }
        return Response.json(authenticated(USER_B, "t2").body);
      }),
    );
    const { auth } = await renderAndSubscribe();

    const pendingApi = auth()
      .request("/api/v1/dots/a", { method: "PATCH", body: {} })
      .catch(() => undefined);
    await waitFor(() => expect(order).toContain("PATCH /api/v1/dots/a"));
    const signingIn = auth().signIn({ email: "b@example.com", password: "password123" });
    releaseApi(
      new Response(JSON.stringify(problem(401, "unauthenticated").body), {
        status: 401,
        headers: { "Content-Type": "application/problem+json" },
      }),
    );
    await act(() => pendingApi);
    await act(() => signingIn);

    // loginのPOSTより前に、2回目の取り直し（401による）が送られていない
    expect(order.indexOf("POST /api/v1/session")).toBeLessThan(order.indexOf("GET2"));
    await waitFor(() => expect(auth().user?.id).toBe(USER_B));
  });

  it("loginの間に呼ばれたrefreshは、loginが終わってから取り直す", async () => {
    const order: string[] = [];
    let releasePost: (response: Response) => void = () => undefined;
    let getCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          order.push("POST");
          return new Promise<Response>((resolve) => {
            releasePost = (response) => {
              order.push("POST done");
              resolve(response);
            };
          });
        }
        getCount += 1;
        order.push(`GET${getCount}`);
        return Response.json(getCount === 1 ? anonymous("t1").body : authenticated(USER_A, "t3").body);
      }),
    );
    const { auth } = await renderAndSubscribe();

    const signingIn = auth().signIn({ email: "user@example.com", password: "password123" });
    await waitFor(() => expect(order).toContain("POST"));
    const refreshing = auth().refresh();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).not.toContain("GET2");

    releasePost(Response.json(authenticated(USER_A, "t2").body));
    await act(() => signingIn);
    await act(() => refreshing);

    expect(order.indexOf("POST done")).toBeLessThan(order.indexOf("GET2"));
  });

  it("csrf_invalidならtokenを取り直して1回だけ再送する", async () => {
    const calls = mockApi({
      "GET /api/v1/session": [anonymous("old"), anonymous("new"), authenticated(USER_A, "t2")],
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

  it("logoutの後もserverで認証済みなら1回だけ送り直し、それでも残れば失敗にする", async () => {
    const calls = mockApi({
      // 前の取り直しの応答でCookieが戻った、などでlogoutが効いていない
      "GET /api/v1/session": [authenticated(USER_A, "t1")],
      "DELETE /api/v1/session": [{ status: 204 }],
    });
    const { auth } = await renderAndSubscribe();

    await expect(auth().signOut()).rejects.toThrow("sign_out_unconfirmed");

    expect(calls.filter((c) => c.key === "DELETE /api/v1/session")).toHaveLength(2);
    expect(auth().status).toBe("authenticated");
    expect(auth().endReason).toBeNull();
  });

  it("送り直しで終われば成功にする", async () => {
    const calls = mockApi({
      "GET /api/v1/session": [authenticated(USER_A, "t1"), authenticated(USER_A, "t2"), anonymous("t3")],
      "DELETE /api/v1/session": [{ status: 204 }],
    });
    const { auth } = await renderAndSubscribe();

    await act(() => auth().signOut());

    expect(calls.filter((c) => c.key === "DELETE /api/v1/session").map((c) => c.csrf)).toEqual(["t1", "t2"]);
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().endReason).toBe("signed_out");
  });

  it("実行中の取り直しの応答を受け取ってからDELETEを送る", async () => {
    const order: string[] = [];
    let releaseGet: (response: Response) => void = () => undefined;
    let getCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          order.push("DELETE");
          return new Response(null, { status: 204 });
        }
        getCount += 1;
        order.push(`GET${getCount}`);
        if (getCount === 1) return Response.json(authenticated(USER_A, "t1").body);
        if (getCount === 2) {
          return new Promise<Response>((resolve) => {
            releaseGet = (response) => {
              order.push("GET2 done");
              resolve(response);
            };
          });
        }
        return Response.json(anonymous("t3").body);
      }),
    );
    const { auth } = await renderAndSubscribe();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(getCount).toBe(2));
    const signingOut = auth().signOut();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).not.toContain("DELETE");

    releaseGet(Response.json(authenticated(USER_A, "t1").body));
    await act(() => signingOut);

    expect(order.indexOf("GET2 done")).toBeLessThan(order.indexOf("DELETE"));
    expect(auth().endReason).toBe("signed_out");
  });

  it("実行中の通信を待ちきれなければ、DELETEを送らずに失敗にする", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const order: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${path}`;
        order.push(key);
        // 応答が返らないまま止まっている保護API
        if (key === "PATCH /api/v1/dots/a") return new Promise<Response>(() => undefined);
        if (key === "DELETE /api/v1/session") return new Response(null, { status: 204 });
        return Response.json(authenticated(USER_A, "t1").body);
      }),
    );
    const { auth } = await renderAndSubscribe();

    void auth().request("/api/v1/dots/a", { method: "PATCH", body: {} });
    await waitFor(() => expect(order).toContain("PATCH /api/v1/dots/a"));
    const signingOut = auth().signOut().catch((e: unknown) => e);
    await act(() => vi.advanceTimersByTimeAsync(10_500));

    expect(await signingOut).toBeInstanceOf(ApiError);
    expect(order).not.toContain("DELETE /api/v1/session");
    expect(auth().status).toBe("authenticated");
    expect(auth().endReason).toBeNull();
  });

  it("実行中の保護APIの応答を受け取ってからDELETEを送り、logout中に始めた保護APIは後で送る", async () => {
    const order: string[] = [];
    let releaseApi: (response: Response) => void = () => undefined;
    let getCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${path}`;
        order.push(key);
        if (key === "DELETE /api/v1/session") return new Response(null, { status: 204 });
        if (key === "PATCH /api/v1/dots/a") {
          return new Promise<Response>((resolve) => {
            releaseApi = (response) => {
              order.push("PATCH a done");
              resolve(response);
            };
          });
        }
        if (key === "PATCH /api/v1/dots/b") return new Response(null, { status: 204 });
        getCount += 1;
        return Response.json(getCount === 1 ? authenticated(USER_A, "t1").body : anonymous("t2").body);
      }),
    );
    const { auth } = await renderAndSubscribe();

    const first = auth().request("/api/v1/dots/a", { method: "PATCH", body: {} });
    await waitFor(() => expect(order).toContain("PATCH /api/v1/dots/a"));
    const signingOut = auth().signOut();
    const second = auth().request("/api/v1/dots/b", { method: "PATCH", body: {} }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).not.toContain("DELETE /api/v1/session");
    expect(order).not.toContain("PATCH /api/v1/dots/b");

    releaseApi(new Response(null, { status: 204 }));
    await act(() => first);
    await act(() => signingOut);
    await act(() => second);

    expect(order.indexOf("PATCH a done")).toBeLessThan(order.indexOf("DELETE /api/v1/session"));
    expect(order.indexOf("DELETE /api/v1/session")).toBeLessThan(order.indexOf("PATCH /api/v1/dots/b"));
    expect(auth().endReason).toBe("signed_out");
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const expiresAt = new Date(Date.now() + 60_000).toISOString().replace(/\.\d+Z$/, "Z");
    mockApi({ "GET /api/v1/session": [authenticated(USER_A, "t1", expiresAt), anonymous("t2")] });
    const { auth, onIdentityChange } = await renderAndSubscribe();

    await act(() => vi.advanceTimersByTimeAsync(62_000));

    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().endReason).toBe("expired");
    expect(onIdentityChange).toHaveBeenCalledTimes(1);
  });

  it("端末の時計が進んでいて期限の前に取り直しても、間隔を空けて確かめ直す", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 端末の時計ではもう期限を過ぎているが、serverではまだ認証済み（時計のずれ）
    const expiresAt = new Date(Date.now() - 5_000).toISOString().replace(/\.\d+Z$/, "Z");
    const calls = mockApi({
      "GET /api/v1/session": [authenticated(USER_A, "t1", expiresAt), authenticated(USER_A, "t1", expiresAt), anonymous("t2")],
    });
    const { auth } = await renderAndSubscribe();

    await act(() => vi.advanceTimersByTimeAsync(31_000));
    await waitFor(() => expect(calls.filter((c) => c.key === "GET /api/v1/session")).toHaveLength(2));
    expect(auth().status).toBe("authenticated");

    await act(() => vi.advanceTimersByTimeAsync(31_000));
    await waitFor(() => expect(auth().status).toBe("anonymous"));
    expect(auth().endReason).toBe("expired");
  });
});

describe("後続の機能が使う入口", () => {
  it("保護APIのcsrf_invalidでもtokenを取り直して1回だけ再送する", async () => {
    const calls = mockApi({
      "GET /api/v1/session": [authenticated(USER_A, "old"), authenticated(USER_A, "new")],
      "PATCH /api/v1/dots/x": [problem(403, "csrf_invalid"), { status: 204 }],
    });
    const { auth } = await renderAndSubscribe();

    await auth().request("/api/v1/dots/x", { method: "PATCH", body: {} });

    expect(calls.filter((c) => c.key === "PATCH /api/v1/dots/x").map((c) => c.csrf)).toEqual(["old", "new"]);
  });

  it("csrf_invalidの後に利用者が変わっていたら再送しない", async () => {
    const calls = mockApi({
      "GET /api/v1/session": [authenticated(USER_A, "csrf-A"), authenticated(USER_B, "csrf-B")],
      "POST /api/v1/recording_attempts": [problem(403, "csrf_invalid")],
    });
    const { auth } = await renderAndSubscribe();

    const error = await auth()
      .request("/api/v1/recording_attempts", { method: "POST", body: {} })
      .catch((e: unknown) => e);

    expect(isProblem(error, "csrf_invalid")).toBe(true);
    expect(calls.filter((c) => c.key === "POST /api/v1/recording_attempts").map((c) => c.csrf)).toEqual(["csrf-A"]);
  });

  it("Googleへ遷移する前に、前の利用者の個人データを消すよう通知する", async () => {
    mockApi({ "GET /api/v1/session": [anonymous("t1")] });
    const { auth, queryClient, onIdentityChange } = await renderAndSubscribe();
    queryClient.setQueryData(["days", "today"], { private: true });

    act(() => auth().prepareExternalSignIn());

    expect(onIdentityChange).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["days", "today"])).toBeUndefined();
  });
});
