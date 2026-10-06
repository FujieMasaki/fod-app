import type { ReactNode } from "react";

import { Button, Spinner, Text } from "@/design-system";
import { isApiError, isProblem } from "@/features/auth";
import { formatDuration } from "@/utils/format-duration";
import type { Dot } from "@/libs/api-contract/schemas";

/**
 * 履歴の3画面で共通に使う、読み込み中・失敗・Dotの本文の表示。serverの`title`・`detail`は出さず、
 * 失敗の種類から文言を決める（frontend.md §2）。
 */

export const HistoryLoading = ({ label }: { label: string }) => {
  return (
    <div className="flex justify-center py-8">
      <Spinner label={label} />
    </div>
  );
};

/** 再試行しても直らず、再読み込みで直る失敗か（応答が契約と合わない＝古いタブの可能性） */
const needsReload = (error: unknown): boolean => isApiError(error) && error.kind === "schema";

const errorDescription = (error: unknown): string => {
  if (needsReload(error)) return "画面が古くなっている可能性があります。再読み込みしてください。";
  if (isApiError(error) && error.kind === "network") return "通信できませんでした。接続を確かめて、もう一度お試しください。";
  // メールアドレスの確認が済んでいない利用者は、Dotを扱えない（契約のForbidden）。
  if (isProblem(error, "email_unconfirmed")) {
    return "メールアドレスの確認が済んでいません。届いたメールのリンクから確認してください。";
  }
  return "時間をおいて、もう一度お試しください。";
};

/** 日付の形が契約に合わない（URLを直接書き換えた場合など） */
export const isInvalidDate = (error: unknown): boolean => isProblem(error, "validation_failed");

type HistoryErrorProps = {
  title: string;
  error: unknown;
  onRetry: () => void;
  /** 画面全体の失敗ならfalse。取得済みの表示を残したまま、その場に小さく出すならtrue */
  inline?: boolean;
  children?: ReactNode;
};

export const HistoryError = ({ title, error, onRetry, inline = false, children }: HistoryErrorProps) => {
  const reload = needsReload(error);
  return (
    <div role="alert" className={inline ? "flex flex-col gap-2 py-2" : "flex flex-col gap-3 py-6"}>
      <p className={inline ? "text-small leading-small text-ink" : "text-body leading-body text-ink"}>{title}</p>
      <p className="text-small leading-small text-ink-secondary">{errorDescription(error)}</p>
      <div className="flex flex-col gap-2">
        {reload ? (
          <Button variant="secondary" onClick={() => window.location.reload()}>
            再読み込み
          </Button>
        ) : (
          <Button variant="secondary" onClick={onRetry}>
            もう一度読み込む
          </Button>
        )}
        {children}
      </div>
    </div>
  );
};

/** Dotの本文。`sentence`・`summary`は空文字があり得る（契約）ので、無いことを文字で示すか省く */
export const DotContent = ({ dot, timeLabel }: { dot: Dot; timeLabel: string }) => {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small leading-small text-ink-secondary">
        {timeLabel}に話した記録・話した長さ {formatDuration(dot.duration_seconds)}
      </p>
      {dot.sentence ? (
        <Text variant="sentence" as="p">
          {dot.sentence}
        </Text>
      ) : (
        <p className="text-body leading-body text-ink-tertiary">一文はありません。</p>
      )}
      {dot.summary && (
        <Text variant="body" tone="secondary" as="p">
          {dot.summary}
        </Text>
      )}
    </div>
  );
};
