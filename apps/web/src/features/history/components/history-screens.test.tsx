import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MouseEventHandler, ReactNode } from "react";

import { AuthProvider } from "@/features/auth";
import { DayDetailScreen } from "./day-detail-screen";
import { DayListScreen } from "./day-list-screen";
import { DayScreen } from "./day-screen";

// 画面遷移は、遷移先を文字で表すだけの差し替えで確かめる。
const navigateMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
    onClick,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
    className?: string;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
    "aria-label"?: string;
    "aria-current"?: "true";
  }) => (
    <a href={params?.date ? to.replace("$date", params.date) : to} className={className} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigateMock,
}));

// Rails APIの応答（契約の形）をfetchの差し替えで模す。`METHOD path`ごとの応答の列（最後は使い続ける）。
type Reply = { status: number; body?: unknown };

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

const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => {
  return { status, body: { type: `urn:focus-on-dot:problem:${code}`, title: "x", detail: "serverの詳細", status, code, ...extra } };
};

const DOT_NEW = "6b1f0c2e-7a4d-4c1b-8e2f-3a9d5c7b1e04";
const DOT_OLD = "2c4e8a10-1b3d-4f5a-9c7e-0d2b4f6a8c13";
const DOT_TODAY = "9a7c5e31-2d4f-4b6a-8c0e-1f3a5b7d9e24";

const eveningDot = {
  id: DOT_NEW,
  date: "2026-09-28",
  started_at: "2026-09-28T13:04:05Z",
  duration_seconds: 312,
  sentence: "思っていたより、ちゃんと休めた一日だった。",
  summary: "午後に予定がひとつ流れて、散歩に出た。",
};
const morningDot = {
  id: DOT_OLD,
  date: "2026-09-28",
  started_at: "2026-09-27T23:10:00Z",
  duration_seconds: 95,
  sentence: "少し早く起きられた。",
  summary: "",
};

const mockApi = (routes: Record<string, Reply[]>) => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${path}`;
      requests.push(key);
      const queue = routes[key];
      if (!queue) throw new Error(`unexpected request: ${key}`);
      const reply = queue.length > 1 ? queue.shift()! : queue[0];
      const type = reply.status >= 400 ? "application/problem+json" : "application/json";
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": type } });
    }),
  );
  return requests;
};

const renderWithAuth = (ui: ReactNode) => {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  navigateMock.mockClear();
});

describe("Day", () => {
  it("今日の最新のDotを大きく表示し、同日の残りと一覧へ進める", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/today": [
        {
          status: 200,
          body: {
            date: "2026-10-01",
            dot_count: 2,
            latest_dot: { ...eveningDot, id: DOT_TODAY, date: "2026-10-01", started_at: "2026-10-01T11:30:00Z" },
          },
        },
      ],
    });
    renderWithAuth(<DayScreen />);

    expect(await screen.findByText("思っていたより、ちゃんと休めた一日だった。")).toBeInTheDocument();
    expect(screen.getByText("2026年10月1日")).toBeInTheDocument();
    expect(screen.getByText("20:30に話した記録・話した長さ 05:12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "今日の記録をすべて見る（2件）" })).toHaveAttribute("href", "/dots/2026-10-01");
    expect(screen.getByRole("link", { name: "過去のDotを見る" })).toHaveAttribute("href", "/dots");
    expect(screen.queryByText("まだ今日のDotはありません。")).not.toBeInTheDocument();
  });

  it("今日の記録が無ければ、未記録と録音への導線を示し、過去のDotを出さない", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/today": [{ status: 200, body: { date: "2026-10-01", dot_count: 0 } }],
    });
    renderWithAuth(<DayScreen />);

    expect(await screen.findByText("まだ今日のDotはありません。")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "話す" }));
    expect(navigateMock).toHaveBeenCalledWith({ to: "/record" });
    expect(screen.getByRole("link", { name: "過去のDotを見る" })).toBeInTheDocument();
  });

  it("取得に失敗したら、未記録とは分けて失敗と再試行を示す", async () => {
    mockApi({ "GET /api/v1/session": [signedIn], "GET /api/v1/days/today": [problem(500, "internal_error")] });
    renderWithAuth(<DayScreen />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("今日のDotを読み込めませんでした。");
    expect(alert).not.toHaveTextContent("serverの詳細");
    expect(within(alert).getByRole("button", { name: "もう一度読み込む" })).toBeInTheDocument();
    expect(screen.queryByText("まだ今日のDotはありません。")).not.toBeInTheDocument();
  });
});

describe("一覧", () => {
  const firstPage = {
    today: "2026-10-01",
    items: [
      { date: "2026-10-01", dot_count: 1, latest_dot_id: DOT_TODAY },
      { date: "2026-09-28", dot_count: 2, latest_dot_id: DOT_NEW },
    ],
    next_cursor: "c1",
  };
  const secondPage = {
    today: "2026-10-01",
    items: [{ date: "2025-09-28", dot_count: 1, latest_dot_id: DOT_OLD }],
    next_cursor: null,
  };

  it("1日を1つの丸として年月の見出しごとに並べ、今日・件数・選択中を文字と名前で示す", async () => {
    mockApi({ "GET /api/v1/session": [signedIn], "GET /api/v1/days": [{ status: 200, body: firstPage }] });
    renderWithAuth(<DayListScreen selected="2026-09-28" />);

    expect(await screen.findByRole("heading", { name: "2026年10月" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2026年9月" })).toBeInTheDocument();
    const today = screen.getByRole("link", { name: "2026年10月1日のDot、今日" });
    expect(today).toHaveAttribute("href", "/dots/2026-10-01");
    expect(today).not.toHaveAttribute("aria-current");
    const selected = screen.getByRole("link", { name: "2026年9月28日のDot、2件、選択中" });
    expect(selected).toHaveAttribute("aria-current", "true");
    expect(within(selected).getByText("選択中")).toBeInTheDocument();
    expect(within(selected).getByText("2件")).toBeInTheDocument();
  });

  it("丸を選ぶと、開いた日を一覧のURLに残してから日の詳細へ進む", async () => {
    mockApi({ "GET /api/v1/session": [signedIn], "GET /api/v1/days": [{ status: 200, body: firstPage }] });
    renderWithAuth(<DayListScreen />);

    fireEvent.click(await screen.findByRole("link", { name: "2026年9月28日のDot、2件" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(2));
    expect(navigateMock).toHaveBeenNthCalledWith(1, { to: "/dots", search: { selected: "2026-09-28" }, replace: true });
    expect(navigateMock).toHaveBeenNthCalledWith(2, { to: "/dots/$date", params: { date: "2026-09-28" } });
  });

  it("続きを読み込み、最後まで来たらそれを示す。別の年の同じ月日も別の名前になる", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days": [{ status: 200, body: firstPage }],
      "GET /api/v1/days?cursor=c1": [{ status: 200, body: secondPage }],
    });
    renderWithAuth(<DayListScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "さらに前のDotを読み込む" }));
    expect(await screen.findByRole("link", { name: "2025年9月28日のDot" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2025年9月" })).toBeInTheDocument();
    expect(screen.getByText("これより前のDotはありません。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "さらに前のDotを読み込む" })).not.toBeInTheDocument();
  });

  it("続きの取得に失敗しても読み込んだ丸を残し、その場で再試行できる", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days": [{ status: 200, body: firstPage }],
      "GET /api/v1/days?cursor=c1": [problem(500, "internal_error"), { status: 200, body: secondPage }],
    });
    renderWithAuth(<DayListScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "さらに前のDotを読み込む" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("続きを読み込めませんでした。");
    expect(screen.getByRole("link", { name: "2026年10月1日のDot、今日" })).toBeInTheDocument();

    fireEvent.click(within(alert).getByRole("button", { name: "もう一度読み込む" }));
    expect(await screen.findByRole("link", { name: "2025年9月28日のDot" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Dotが1件も無いことを、読み込みの失敗と分けて示す", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days": [{ status: 200, body: { today: "2026-10-01", items: [], next_cursor: null } }],
    });
    renderWithAuth(<DayListScreen />);

    expect(await screen.findByText("まだDotがありません。")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("一覧の読み込みに失敗したら、空の一覧とは分けて失敗を示す", async () => {
    mockApi({ "GET /api/v1/session": [signedIn], "GET /api/v1/days": [problem(500, "internal_error")] });
    renderWithAuth(<DayListScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent("過去のDotを読み込めませんでした。");
    expect(screen.queryByText("まだDotがありません。")).not.toBeInTheDocument();
  });

  it("応答が契約と合わなければ、再試行ではなく再読み込みを案内する", async () => {
    mockApi({ "GET /api/v1/session": [signedIn], "GET /api/v1/days": [{ status: 200, body: { items: [] } }] });
    renderWithAuth(<DayListScreen />);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "再読み込み" })).toBeInTheDocument();
    expect(within(alert).queryByRole("button", { name: "もう一度読み込む" })).not.toBeInTheDocument();
  });
});

describe("日の詳細", () => {
  it("既定は最新のDotで、録音時刻のボタンで同日の別のDotへ切り替える", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/2026-09-28": [
        { status: 200, body: { date: "2026-09-28", dots: [eveningDot, morningDot], next_cursor: null } },
      ],
    });
    renderWithAuth(<DayDetailScreen date="2026-09-28" />);

    expect(await screen.findByText("思っていたより、ちゃんと休めた一日だった。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2026年9月28日" })).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "録音した時刻" });
    const evening = within(group).getByRole("button", { name: "22:04（表示中）" });
    expect(evening).toHaveAttribute("aria-pressed", "true");

    // 0:00 JSTをまたいだ朝の録音（UTCでは前日）も、この日の記録として切り替えられる。
    fireEvent.click(within(group).getByRole("button", { name: "08:10" }));
    expect(screen.getByText("少し早く起きられた。")).toBeInTheDocument();
    expect(screen.queryByText("思っていたより、ちゃんと休めた一日だった。")).not.toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "08:10（表示中）" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "22:04" })).toHaveAttribute("aria-pressed", "false");
  });

  it("選んでいた記録が取り直しで無くなったら、別のDotを代わりに出さず、残りの時刻から選び直せる", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/2026-09-28": [
        { status: 200, body: { date: "2026-09-28", dots: [eveningDot, morningDot], next_cursor: null } },
        { status: 200, body: { date: "2026-09-28", dots: [eveningDot], next_cursor: null } },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <DayDetailScreen date="2026-09-28" />
        </AuthProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "08:10" }));
    expect(screen.getByText("少し早く起きられた。")).toBeInTheDocument();

    // 別の端末で朝の記録をゴミ箱へ移した後に取り直す。残りは1件だけになる。
    await act(() => client.refetchQueries());
    expect(await screen.findByText("選んでいた記録は見つかりませんでした。上の時刻から選んでください。")).toBeInTheDocument();
    expect(screen.queryByText("思っていたより、ちゃんと休めた一日だった。")).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("group", { name: "録音した時刻" })).getByRole("button", { name: "22:04" }));
    expect(screen.getByText("思っていたより、ちゃんと休めた一日だった。")).toBeInTheDocument();
  });

  it("その日のDotが多ければ、続きを読み込んで到達できる", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/2026-09-28": [{ status: 200, body: { date: "2026-09-28", dots: [eveningDot], next_cursor: "d1" } }],
      "GET /api/v1/days/2026-09-28?cursor=d1": [
        { status: 200, body: { date: "2026-09-28", dots: [morningDot], next_cursor: null } },
      ],
    });
    renderWithAuth(<DayDetailScreen date="2026-09-28" />);

    fireEvent.click(await screen.findByRole("button", { name: "この日の続きを読み込む" }));
    fireEvent.click(await screen.findByRole("button", { name: "08:10" }));
    expect(screen.getByText("少し早く起きられた。")).toBeInTheDocument();
  });

  it("古い一覧から開いた日が0件なら、取得失敗と分けて示し、一覧を取り直してその日の丸を消す", async () => {
    const stale = {
      today: "2026-10-01",
      items: [
        { date: "2026-10-01", dot_count: 1, latest_dot_id: DOT_TODAY },
        { date: "2026-09-28", dot_count: 2, latest_dot_id: DOT_NEW },
      ],
      next_cursor: null,
    };
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days": [{ status: 200, body: stale }, { status: 200, body: { ...stale, items: [stale.items[0]] } }],
      "GET /api/v1/days/2026-09-28": [{ status: 200, body: { date: "2026-09-28", dots: [], next_cursor: null } }],
    });
    // 一覧と日の詳細を同じcacheで切り替える（一覧から丸を選んで戻る流れ）。
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const withProviders = (ui: ReactNode) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{ui}</AuthProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(withProviders(<DayListScreen />));
    expect(await screen.findByRole("link", { name: "2026年9月28日のDot、2件" })).toBeInTheDocument();

    rerender(withProviders(<DayDetailScreen date="2026-09-28" />));
    // 読み込み中の表示もrole="status"のため、文言で0件の表示を探してから、その役割を確かめる。
    expect((await screen.findByText("この日に振り返れるDotはありません。")).closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "過去のDotの一覧へ" })).toHaveAttribute("href", "/dots");

    rerender(withProviders(<DayListScreen selected="2026-09-28" />));
    await waitFor(() => expect(screen.queryByRole("link", { name: /2026年9月28日のDot/ })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "2026年10月1日のDot、今日" })).toBeInTheDocument();
  });

  it("取得に失敗したら別のDotを代わりに出さず、失敗と再試行を示す", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/2026-09-28": [problem(500, "internal_error"), { status: 200, body: { date: "2026-09-28", dots: [morningDot], next_cursor: null } }],
    });
    renderWithAuth(<DayDetailScreen date="2026-09-28" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("この日のDotを読み込めませんでした。");
    expect(screen.queryByText("この日に振り返れるDotはありません。")).not.toBeInTheDocument();

    fireEvent.click(within(alert).getByRole("button", { name: "もう一度読み込む" }));
    expect(await screen.findByText("少し早く起きられた。")).toBeInTheDocument();
  });

  it("取得を拒否されたら、その理由を示し、別のDotを代わりに出さない", async () => {
    mockApi({ "GET /api/v1/session": [signedIn], "GET /api/v1/days/2026-09-28": [problem(403, "email_unconfirmed")] });
    renderWithAuth(<DayDetailScreen date="2026-09-28" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("メールアドレスの確認が済んでいません。");
    expect(alert).not.toHaveTextContent("serverの詳細");
    expect(screen.queryByRole("group", { name: "録音した時刻" })).not.toBeInTheDocument();
  });

  it("実在しない日付は通信せずに開けないと示す", async () => {
    const requests = mockApi({ "GET /api/v1/session": [signedIn] });
    renderWithAuth(<DayDetailScreen date="2026-02-30" />);

    expect(screen.getByRole("alert")).toHaveTextContent("この日付のDotは開けません。");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.some((request) => request.includes("/api/v1/days"))).toBe(false);
  });

  it("serverが日付の形を拒否したら、取得失敗ではなく開けない日付として示す", async () => {
    mockApi({
      "GET /api/v1/session": [signedIn],
      "GET /api/v1/days/2026-09-28": [
        problem(422, "validation_failed", { errors: [{ field: "date", code: "invalid_format" }] }),
      ],
    });
    renderWithAuth(<DayDetailScreen date="2026-09-28" />);

    expect(await screen.findByText("この日付のDotは開けません。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "もう一度読み込む" })).not.toBeInTheDocument();
  });
});
