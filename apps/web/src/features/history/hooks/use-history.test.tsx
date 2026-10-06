import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AuthProvider, isApiError, useAuth } from "@/features/auth";
import { useDayDetail, useDayList, useToday } from "./use-history";

// Rails APIの応答（契約の形）をfetchの差し替えで模す。`METHOD path`ごとの応答の列（最後は使い続ける）。
// 応答の代わりにPromiseを置くと、そのPromiseが解決するまで応答を遅らせられる。
type Reply = { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;

const signedIn = {
  status: 200,
  body: {
    authenticated: true,
    csrf_token: "t1",
    expires_at: "2026-10-12T03:00:00Z",
    account_status: "active",
    user: {
      id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
      email: "user@example.com",
      email_confirmed: true,
      sign_in_methods: ["password"],
    },
  },
};

const problem = (status: number, code: string) => {
  return { status, body: { type: `urn:focus-on-dot:problem:${code}`, title: "x", status, code } };
};

const dot = (id: string, date: string, startedAt: string) => ({
  id,
  date,
  started_at: startedAt,
  duration_seconds: 60,
  sentence: `${id}の一文`,
  summary: "",
});

const DOT_A = "6b1f0c2e-7a4d-4c1b-8e2f-3a9d5c7b1e04";
const DOT_B = "2c4e8a10-1b3d-4f5a-9c7e-0d2b4f6a8c13";

const mockApi = (routes: Record<string, Reply[]>) => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${path}`;
      requests.push(key);
      const queue = routes[key];
      if (!queue) throw new Error(`unexpected request: ${key}`);
      const reply = await (queue.length > 1 ? queue.shift()! : queue[0]);
      const type = reply.status >= 400 ? "application/problem+json" : "application/json";
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": type } });
    }),
  );
  return requests;
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AuthProvider>{children}</AuthProvider>
  </QueryClientProvider>
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useToday", () => {
  it("今日の記録が無いことを、取得の失敗と分けて返す", async () => {
    mockApi({ "GET /api/v1/session": [signedIn], "GET /api/v1/days/today": [{ status: 200, body: { date: "2026-10-01", dot_count: 0 } }] });
    const { result } = renderHook(() => useToday(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ date: "2026-10-01", dot_count: 0 });
  });

  it("契約と合わない応答はschemaの失敗にする（古いタブの可能性）", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/today": [{ status: 200, body: { date: "2026-10-01", dot_count: 1 } }],
    });
    const { result } = renderHook(() => useToday(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isApiError(result.current.error) && result.current.error.kind).toBe("schema");
  });
});

describe("自動のretry", () => {
  it("通信の途切れは1回だけ送り直し、serverが理由を返した失敗とschemaの不一致は送り直さない", async () => {
    const requests = mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/today": [problem(500, "internal_error")],
    });
    const { result } = renderHook(() => useToday(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(requests.filter((r) => r === "GET /api/v1/days/today")).toHaveLength(1);

    vi.unstubAllGlobals();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        if (path === "/api/v1/session") {
          return new Response(JSON.stringify(signedIn.body), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        calls += 1;
        if (calls === 1) throw new TypeError("network");
        return new Response(JSON.stringify({ date: "2026-10-01", dot_count: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const retried = renderHook(() => useToday(), { wrapper });
    await waitFor(() => expect(retried.result.current.isSuccess).toBe(true), { timeout: 3000 });
    expect(calls).toBe(2);
  });
});

describe("useDayList", () => {
  it("serverのnext_cursorをそのまま渡して続きをたどり、nullで終わる", async () => {
    const requests = mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days": [
        {
          status: 200,
          body: { today: "2026-10-01", items: [{ date: "2026-10-01", dot_count: 2, latest_dot_id: DOT_A }], next_cursor: "c+1/=" },
        },
      ],
      "GET /api/v1/days?cursor=c%2B1%2F%3D": [
        {
          status: 200,
          body: { today: "2026-10-01", items: [{ date: "2026-09-28", dot_count: 1, latest_dot_id: DOT_B }], next_cursor: null },
        },
      ],
    });
    const { result } = renderHook(() => useDayList(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.today).toBe("2026-10-01");
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.days.map((day) => day.date)).toEqual(["2026-10-01", "2026-09-28"]));
    expect(result.current.hasNextPage).toBe(false);
    expect(requests).toContain("GET /api/v1/days?cursor=c%2B1%2F%3D");
  });

  it("続きの取得に失敗しても、取得済みの日を空にしない", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days": [
        {
          status: 200,
          body: { today: "2026-10-01", items: [{ date: "2026-10-01", dot_count: 1, latest_dot_id: DOT_A }], next_cursor: "c1" },
        },
      ],
      "GET /api/v1/days?cursor=c1": [problem(500, "internal_error")],
    });
    const { result } = renderHook(() => useDayList(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true));
    expect(result.current.days.map((day) => day.date)).toEqual(["2026-10-01"]);
  });
});

describe("利用者の切り替わり", () => {
  it("表示中の一覧で利用者が別の人に切り替わっても、前の利用者の日を一度も返さない", async () => {
    const otherUser = { ...signedIn, body: { ...signedIn.body, user: { ...signedIn.body.user, id: "5d3c1b2a-9e8f-4a7b-8c6d-0e1f2a3b4c5d" } } };
    mockApi({
      // 別のタブでAがlogoutしBがloginした後、このタブが認証状態を取り直す。
      "GET /api/v1/session": [signedIn, otherUser],
      "GET /api/v1/days": [
        { status: 200, body: { today: "2026-10-01", items: [{ date: "2026-09-28", dot_count: 1, latest_dot_id: DOT_A }], next_cursor: null } },
        { status: 200, body: { today: "2026-10-01", items: [{ date: "2026-09-27", dot_count: 1, latest_dot_id: DOT_B }], next_cursor: null } },
      ],
    });
    const leaked: string[] = [];
    const { result } = renderHook(
      () => {
        const auth = useAuth();
        const list = useDayList();
        if (auth.user?.id === otherUser.body.user.id && list.days.some((day) => day.date === "2026-09-28")) {
          leaked.push("前の利用者の日を返した");
        }
        return { auth, list };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.days.map((day) => day.date)).toEqual(["2026-09-28"]));

    await act(() => result.current.auth.refresh());
    await waitFor(() => expect(result.current.list.days.map((day) => day.date)).toEqual(["2026-09-27"]));
    expect(leaked).toEqual([]);
  });
});

describe("cursor_invalid", () => {
  it("serverがcursorを解釈できなければ、先頭から取り直す（契約のCursorInvalid）", async () => {
    const requests = mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days": [
        { status: 200, body: { today: "2026-10-01", items: [{ date: "2026-10-01", dot_count: 1, latest_dot_id: DOT_A }], next_cursor: "old" } },
        { status: 200, body: { today: "2026-10-01", items: [{ date: "2026-09-30", dot_count: 1, latest_dot_id: DOT_B }], next_cursor: null } },
      ],
      "GET /api/v1/days?cursor=old": [problem(400, "cursor_invalid")],
    });
    const { result } = renderHook(() => useDayList(), { wrapper });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.days.map((day) => day.date)).toEqual(["2026-09-30"]));
    expect(result.current.isError).toBe(false);
    expect(requests.filter((request) => request === "GET /api/v1/days?cursor=old")).toHaveLength(1);
  });
});

describe("useDayDetail", () => {
  it("日付ごとに取得し、前の日の遅れた応答を今の日として返さない", async () => {
    let releaseOld!: (reply: { status: number; body: unknown }) => void;
    const requests = mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/2026-09-28": [new Promise((resolve) => (releaseOld = resolve))],
      "GET /api/v1/days/2026-09-27": [
        { status: 200, body: { date: "2026-09-27", dots: [dot(DOT_B, "2026-09-27", "2026-09-27T01:00:00Z")], next_cursor: null } },
      ],
    });
    const { result, rerender } = renderHook(({ date }) => useDayDetail(date), {
      wrapper,
      initialProps: { date: "2026-09-28" },
    });
    // 前の日の取得が実際に送られ、応答を待っている間に切り替える。
    await waitFor(() => expect(requests).toContain("GET /api/v1/days/2026-09-28"));
    rerender({ date: "2026-09-27" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    releaseOld({ status: 200, body: { date: "2026-09-28", dots: [dot(DOT_A, "2026-09-28", "2026-09-28T01:00:00Z")], next_cursor: null } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.dots.map((d) => d.id)).toEqual([DOT_B]);
  });

  it("その日のDotが0件なら、取得失敗と分けて示し、一覧と今日を取り直す", async () => {
    const requests = mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/2026-09-28": [{ status: 200, body: { date: "2026-09-28", dots: [], next_cursor: null } }],
      "GET /api/v1/days": [{ status: 200, body: { today: "2026-10-01", items: [], next_cursor: null } }],
      "GET /api/v1/days/today": [{ status: 200, body: { date: "2026-10-01", dot_count: 0 } }],
    });
    // 一覧と今日を一度取得してから閉じ、cacheに古い一覧がある状態を作る（一覧の画面から日を開いた状態）。
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const list = renderHook(() => ({ list: useDayList(), today: useToday() }), { wrapper: shared });
    await waitFor(() => expect(list.result.current.list.isSuccess && list.result.current.today.isSuccess).toBe(true));
    list.unmount();
    const count = (key: string) => requests.filter((request) => request === key).length;
    expect(count("GET /api/v1/days")).toBe(1);

    const { result } = renderHook(() => useDayDetail("2026-09-28"), { wrapper: shared });
    await waitFor(() => expect(result.current.empty).toBe(true));
    expect(result.current.isError).toBe(false);
    // 一覧の画面は閉じているが、戻ったときに古い丸を見せないよう、すぐに取り直す。
    await waitFor(() => expect(count("GET /api/v1/days")).toBe(2));
    await waitFor(() => expect(count("GET /api/v1/days/today")).toBe(2));
  });

  it("その日の続きをnext_cursorでたどり、cursor_invalidなら先頭から取り直す", async () => {
    const requests = mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/2026-09-28": [
        { status: 200, body: { date: "2026-09-28", dots: [dot(DOT_A, "2026-09-28", "2026-09-28T02:00:00Z")], next_cursor: "d1" } },
        { status: 200, body: { date: "2026-09-28", dots: [dot(DOT_A, "2026-09-28", "2026-09-28T02:00:00Z")], next_cursor: "d2" } },
      ],
      "GET /api/v1/days/2026-09-28?cursor=d1": [
        { status: 200, body: { date: "2026-09-28", dots: [dot(DOT_B, "2026-09-28", "2026-09-28T01:00:00Z")], next_cursor: null } },
      ],
      "GET /api/v1/days/2026-09-28?cursor=d2": [problem(400, "cursor_invalid")],
    });
    const { result } = renderHook(() => useDayDetail("2026-09-28"), { wrapper });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.dots.map((d) => d.id)).toEqual([DOT_A, DOT_B]));
    expect(result.current.hasNextPage).toBe(false);

    // 取り直した後の続きでserverがcursorを拒んだら、先頭から取り直す。
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(requests.filter((r) => r === "GET /api/v1/days/2026-09-28").length).toBe(3));
    await waitFor(() => expect(result.current.isError).toBe(false));
  });

  it("実在しない日付では通信しない", async () => {
    const requests = mockApi({ "GET /api/v1/session": [signedIn] });
    const { result } = renderHook(() => useDayDetail("2026-02-30"), { wrapper });
    await waitFor(() => expect(requests).toContain("GET /api/v1/session"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.fetchStatus).toBe("idle");
    expect(requests.some((r) => r.includes("/api/v1/days"))).toBe(false);
  });

  it("取得に失敗したら0件として扱わない", async () => {
    mockApi({ "GET /api/v1/session": [signedIn], "GET /api/v1/days/2026-09-28": [problem(500, "internal_error")] });
    const { result } = renderHook(() => useDayDetail("2026-09-28"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.empty).toBe(false);
    expect(result.current.dots).toEqual([]);
  });
});
