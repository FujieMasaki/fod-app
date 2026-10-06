import { Link, useNavigate } from "@tanstack/react-router";

import { Button, Dot, Text } from "@/design-system";
import { dayOfMonth, formatFullDate, timeLabels } from "../date-format";
import { useToday } from "../hooks/use-history";
import { DotContent, HistoryError, HistoryLoading, LINK_CLASS } from "./history-status";

/**
 * Day: 今日（serverが決めたAsia/Tokyoの暦日）のDotのうち最新の1件を大きく表示する。
 * 今日の記録が無ければ未記録と録音への導線を示し、過去のDotを今日の記録として表示しない（dot-history §2「Day」）。
 */
export const DayScreen = () => {
  const navigate = useNavigate();
  const today = useToday();

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-1">
        <Text variant="title" as="h1">
          今日のDot
        </Text>
        {today.data && <p className="text-small leading-small text-ink-secondary">{formatFullDate(today.data.date)}</p>}
      </div>

      {today.isPending ? (
        <HistoryLoading label="今日のDotを読み込んでいます" />
      ) : today.isError ? (
        <HistoryError title="今日のDotを読み込めませんでした。" error={today.error} onRetry={() => void today.refetch()} />
      ) : !("latest_dot" in today.data) ? (
        <div className="flex flex-col gap-3">
          <p className="text-body leading-body text-ink">まだ今日のDotはありません。</p>
          <p className="text-small leading-small text-ink-secondary">今日をひとつ、話すことから始まります。</p>
          <Button variant="primary" onClick={() => navigate({ to: "/record" })}>
            話す
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 今日を大きな丸で示す。丸の大きさ・色に気持ちや評価の意味は持たせない（dot-history §1） */}
          <div className="flex justify-center" aria-hidden="true">
            <Dot size={120}>
              <span className="text-title leading-title">{dayOfMonth(today.data.date)}</span>
            </Dot>
          </div>
          <DotContent
            dot={today.data.latest_dot}
            timeLabel={timeLabels([today.data.latest_dot]).get(today.data.latest_dot.id)!}
          />
          {today.data.dot_count > 1 && (
            <Link to="/dots/$date" params={{ date: today.data.date }} className={LINK_CLASS}>
              今日の記録をすべて見る（{today.data.dot_count}件）
            </Link>
          )}
        </div>
      )}

      <Link to="/dots" className={LINK_CLASS}>
        過去のDotを見る
      </Link>
    </div>
  );
};
