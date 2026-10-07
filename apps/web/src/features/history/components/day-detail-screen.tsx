import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { Button, Text } from "@/design-system";
import { formatFullDate, isCalendarDate, timeLabels } from "../date-format";
import { useDayDetail } from "../hooks/use-history";
import { DotContent, HistoryError, HistoryLoading, LINK_CLASS, isInvalidDate } from "./history-status";
import styles from "./day-detail-screen.module.css";

/**
 * 日の詳細: 日付をキーに、その時点でゴミ箱の外にある同日のDotを振り返る（dot-history §2「詳細」）。
 * `date`はURLから来るため、実在する暦日でなければ通信しない。日付ごとに中身を作り直し、選んだ録音を別の日へ持ち越さない。
 */
export const DayDetailScreen = ({ date }: { date: string }) => {
  if (!isCalendarDate(date)) return <InvalidDate />;
  return <DayDetail key={date} date={date} />;
};

const InvalidDate = () => {
  return (
    <div className={styles.invalidDate} role="alert">
      <p className={styles.text}>この日付のDotは開けません。</p>
      <Link to="/dots" className={LINK_CLASS}>
        過去のDotの一覧へ
      </Link>
    </div>
  );
};

const DayDetail = ({ date }: { date: string }) => {
  const detail = useDayDetail(date);
  // 利用者が選んだ録音。未選択なら先頭（最新）を表示する。
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const heading = (
    <Text variant="title" as="h1">
      {formatFullDate(date)}
    </Text>
  );

  if (detail.isPending) {
    return (
      <div className={styles.root}>
        {heading}
        <HistoryLoading label="この日のDotを読み込んでいます" />
      </div>
    );
  }
  if (detail.isError && detail.dots.length === 0) {
    if (isInvalidDate(detail.error)) return <InvalidDate />;
    return (
      <div className={styles.root}>
        {heading}
        <HistoryError title="この日のDotを読み込めませんでした。" error={detail.error} onRetry={() => void detail.refetch()}>
          <Link to="/dots" className={LINK_CLASS}>
            過去のDotの一覧へ
          </Link>
        </HistoryError>
      </div>
    );
  }
  if (detail.empty) {
    // 取得失敗とは分ける（role="status"）。一覧と今日はuseDayDetailが取り直す。
    return (
      <div className={styles.root}>
        {heading}
        <div className={styles.message} role="status">
          <p className={styles.text}>この日に振り返れるDotはありません。</p>
          <p className={styles.note}>
            ゴミ箱へ移したか、削除した可能性があります。
          </p>
          <Link to="/dots" className={LINK_CLASS}>
            過去のDotの一覧へ
          </Link>
        </div>
      </div>
    );
  }

  const labels = timeLabels(detail.dots);
  const shown = selectedId === null ? detail.dots[0] : detail.dots.find((dot) => dot.id === selectedId);
  // 選んでいた録音が取り直しで無くなったら、残りが1件でも時刻を出して選び直せるようにする（D10）。
  const several = detail.dots.length > 1 || detail.hasNextPage || shown === undefined;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {heading}
        {several && <p className={styles.note}>この日の記録 {detail.dots.length}件{detail.hasNextPage && "（続きあり）"}</p>}
      </div>

      {detail.isRefetchError && (
        <HistoryError inline title="この日の最新の内容を読み込めませんでした。" error={detail.error} onRetry={() => void detail.refetch()} />
      )}

      {several && (
        <div role="group" aria-label="録音した時刻" className={styles.times}>
          {detail.dots.map((dot) => {
            const pressed = dot.id === shown?.id;
            return (
              <button
                key={dot.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => setSelectedId(dot.id)}
                className={styles.timeButton}
              >
                {labels.get(dot.id)}
                {pressed && "（表示中）"}
              </button>
            );
          })}
        </div>
      )}

      {detail.isFetchNextPageError ? (
        <HistoryError
          inline
          title="この日の続きを読み込めませんでした。"
          error={detail.error}
          onRetry={() => void detail.fetchNextPage()}
        />
      ) : (
        detail.hasNextPage && (
          <Button variant="secondary" onClick={() => void detail.fetchNextPage()} disabled={detail.isFetchingNextPage}>
            {detail.isFetchingNextPage ? "読み込んでいます" : "この日の続きを読み込む"}
          </Button>
        )
      )}

      {shown ? (
        <DotContent dot={shown} timeLabel={labels.get(shown.id)!} />
      ) : (
        // 取り直した後に、選んでいた録音が無くなった。別の録音を代わりに表示しない。
        <p role="status" className={styles.text}>
          選んでいた記録は見つかりませんでした。上の時刻から選んでください。
        </p>
      )}
    </div>
  );
};
