import { useEffect, useRef, type MouseEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { Button, Text } from "@/design-system";
import type { DaySummary } from "@/libs/api-contract/schemas";
import { dayOfMonth, formatFullDate, groupByMonth } from "../date-format";
import { useDayList } from "../hooks/use-history";
import { HistoryError, HistoryLoading } from "./history-status";

/**
 * 一覧: 記録のある日を1日=1つの丸として新しい順に並べる（dot-history §2「一覧」「丸の表現」）。
 * 丸の色・大きさはすべて同じにし、日付・今日・件数・選択中は文字と枠線で示す。続きはボタンで読み込む。
 */
export const DayListScreen = ({ selected }: { selected?: string }) => {
  const navigate = useNavigate();
  const list = useDayList();

  // 開いた日を一覧のURLに残してから詳細へ進む。戻ったときに、どの日を開いていたかを枠線と文字で示すため。
  const openDay = async (event: MouseEvent<HTMLAnchorElement>, date: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    await navigate({ to: "/dots", search: { selected: date }, replace: true });
    await navigate({ to: "/dots/$date", params: { date } });
  };

  if (list.isPending) return <HistoryLoading label="過去のDotを読み込んでいます" />;
  if (list.isError && list.days.length === 0) {
    return <HistoryError title="過去のDotを読み込めませんでした。" error={list.error} onRetry={() => void list.refetch()} />;
  }
  if (list.days.length === 0) {
    return (
      <div className="flex flex-col gap-3 py-6">
        <p className="text-body leading-body text-ink">まだDotがありません。</p>
        <p className="text-small leading-small text-ink-secondary">話した日が、ここに丸として並んでいきます。</p>
        <Button variant="primary" onClick={() => navigate({ to: "/record" })}>
          話す
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      {/* 取り直し（日が0件だった後など）に失敗したら、取得済みの丸を残したまま知らせる */}
      {list.isRefetchError && (
        <HistoryError inline title="最新の一覧を読み込めませんでした。" error={list.error} onRetry={() => void list.refetch()} />
      )}

      {groupByMonth(list.days).map((group) => (
        <section key={group.label} className="flex flex-col gap-3">
          <Text variant="small" tone="secondary" as="h2">
            {group.label}
          </Text>
          <ul className="grid grid-cols-5 gap-x-2 gap-y-4">
            {group.items.map((day) => (
              <li key={day.date}>
                <DayDot
                  day={day}
                  isToday={day.date === list.today}
                  isSelected={day.date === selected}
                  onClick={(event) => void openDay(event, day.date)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {list.isFetchNextPageError ? (
        <HistoryError
          inline
          title="続きを読み込めませんでした。読み込んだDotはそのまま見られます。"
          error={list.error}
          onRetry={() => void list.fetchNextPage()}
        />
      ) : list.hasNextPage ? (
        <Button variant="secondary" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
          {list.isFetchingNextPage ? "読み込んでいます" : "さらに前のDotを読み込む"}
        </Button>
      ) : (
        <p className="text-small leading-small text-ink-secondary">これより前のDotはありません。</p>
      )}
    </div>
  );
};

type DayDotProps = {
  day: DaySummary;
  isToday: boolean;
  isSelected: boolean;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/**
 * 1日の丸。年月日を含む名前で、複数年でも同名の選択肢にしない。タップ領域は丸（48px）と補助テキストで44px以上。
 * 選択中は丸の外側の枠線と「選択中」の文字、フォーカスは破線の輪郭線で示し、色だけに頼らない。
 */
const DayDot = ({ day, isToday, isSelected, onClick }: DayDotProps) => {
  const notes = [isToday && "今日", day.dot_count > 1 && `${day.dot_count}件`, isSelected && "選択中"].filter(
    (note): note is string => typeof note === "string",
  );
  const name = [`${formatFullDate(day.date)}のDot`, ...notes].join("、");

  // 詳細から戻ると一覧は先頭から表示し直されるので、開いていた日の丸を画面の中央へ移して見えるようにする（D3）。
  // 表示した時だけ移す（続きを読み込んでも、表示中の丸は作り直されないので移り直さない）。
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (isSelected) ref.current?.scrollIntoView({ block: "center" });
  }, [isSelected]);

  return (
    <Link
      ref={ref}
      to="/dots/$date"
      params={{ date: day.date }}
      onClick={onClick}
      aria-label={name}
      aria-current={isSelected ? "true" : undefined}
      className="flex flex-col items-center gap-1 rounded-md py-1 focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-brand"
    >
      <span
        aria-hidden="true"
        // 白とbrandの比は約4.4:1で、小さい文字のAA（4.5:1）に届かない。大きな太字（WCAGの18.66px以上の太字、3:1）にする。
        className={[
          "flex size-8 items-center justify-center rounded-full bg-brand text-title leading-title font-bold text-surface",
          isSelected && "outline-2 outline-offset-2 outline-ink",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {dayOfMonth(day.date)}
      </span>
      {notes.map((note) => (
        <span key={note} aria-hidden="true" className="text-caption leading-caption text-ink-secondary">
          {note}
        </span>
      ))}
    </Link>
  );
};
