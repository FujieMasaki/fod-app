import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorState } from "./error-state";

describe("失敗してもユーザーを責めない", () => {
  it("技術用語ではなく、安心できる文言と保存の説明を示す", () => {
    render(<ErrorState />);
    expect(screen.getByText("今日のDotをうまく整理できませんでした。")).toBeInTheDocument();
    expect(screen.getByText(/音声は保存されています/)).toBeInTheDocument();
  });

  it("もう一度試せる導線がある", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "もう一度" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
