import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "@/features/session";
import { sampleSession } from "@/mocks/sample-session";
import { ProcessingIndicator } from "./processing-indicator";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
}));

function renderProcessing() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <ProcessingIndicator />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  replaceMock.mockReset();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("整理が終わると今日の一文へ進む", () => {
  it("整理完了で /dot へ自動遷移し、結果をセッションへ確定する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => sampleSession })),
    );

    renderProcessing();

    // 待ち時間の文言が表示される
    expect(screen.getByText("もう少しだけお待ちください")).toBeInTheDocument();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dot"));

    // セッション（今日の一文）が localStorage に確定している
    const stored = JSON.parse(window.localStorage.getItem("fod.session.v1") ?? "{}");
    expect(stored.dotSession?.sentence).toBe(sampleSession.sentence);
  });

  it("失敗しても不安にさせず、もう一度試すと今日の一文へ進む", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => sampleSession });
    vi.stubGlobal("fetch", fetchMock);

    renderProcessing();

    // まず失敗の受け止め（技術用語なし）が出る
    const retry = await screen.findByRole("button", { name: "もう一度" });
    expect(screen.getByText("今日のDotをうまく整理できませんでした。")).toBeInTheDocument();

    fireEvent.click(retry);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dot"));
  });
});
