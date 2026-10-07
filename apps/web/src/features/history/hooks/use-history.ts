import { useCallback, useEffect } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { isApiError, isProblem, useAuth } from "@/features/auth";
import { getDay, getToday, listDays } from "../api";
import { isCalendarDate } from "../date-format";

/**
 * 履歴のquery。正本はserverで、ここではcacheと取得の状態だけを持つ（frontend.md §2）。
 * 本文はquery cacheにだけ置き、認証の終了・利用者の切り替わりでAuth Providerが消す。
 *
 * query keyには利用者のidを含める。Auth Providerがcacheを消すのは切り替わりを描画した後のeffectで、
 * 表示中の画面のobserverは消されたqueryの結果を持ち続けるため、keyが同じだと切り替わった後も前の利用者の
 * Dotが見え得る。keyが変われば、切り替わりの描画で前の利用者の結果を使わない。
 */

const historyKey = (userId: string | null) => ["history", userId] as const;
const todayKey = (userId: string | null) => [...historyKey(userId), "today"] as const;
const daysKey = (userId: string | null) => [...historyKey(userId), "days"] as const;
const dayKey = (userId: string | null, date: string) => [...historyKey(userId), "day", date] as const;

// 通信の途中で切れた・proxyの失敗のような一時的なものだけ1回やり直す。serverが理由を返した失敗
// （cursor_invalid・validation_failedなど）と、契約と合わない応答は、やり直しても直らない。
const retryTransient = (failureCount: number, error: unknown): boolean => {
  return failureCount < 1 && isApiError(error) && (error.kind === "network" || error.kind === "http");
};

const useUserId = (): string | null => useAuth().user?.id ?? null;

/** Day: 今日の最新のDot。今日の記録が無いことは`dot_count: 0`で返り、取得失敗とは別 */
export const useToday = () => {
  const { request } = useAuth();
  const userId = useUserId();
  return useQuery({
    queryKey: todayKey(userId),
    queryFn: () => getToday(request),
    enabled: userId !== null,
    retry: retryTransient,
  });
};

/**
 * serverがcursorを解釈できなかったら（`cursor_invalid`）、契約どおり先頭から取り直す。
 * TanStack Queryの取り直しは2ページ目以降のcursorを新しいpageから計算し直すため、通常は起こらない。
 * 古い画面のまま続きを読み込んだ・serverのcursorの形式が変わった、といった場合への備え。
 */
const useRestartOnInvalidCursor = (queryKey: readonly unknown[], error: unknown) => {
  const queryClient = useQueryClient();
  const serializedKey = JSON.stringify(queryKey);
  useEffect(() => {
    if (isProblem(error, "cursor_invalid")) {
      void queryClient.resetQueries({ queryKey: JSON.parse(serializedKey) as unknown[], exact: true });
    }
  }, [error, queryClient, serializedKey]);
};

/**
 * 日単位の一覧。続きはserverの`next_cursor`でたどる（`null`なら終わり）。
 * 続きの取得に失敗しても取得済みのpagesは残る（`isFetchNextPageError`で区別する）。
 */
export const useDayList = () => {
  const { request } = useAuth();
  const userId = useUserId();
  const queryKey = daysKey(userId);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => listDays(request, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: userId !== null,
    retry: retryTransient,
  });
  useRestartOnInvalidCursor(queryKey, query.error);
  const pages = query.data?.pages;
  return {
    ...query,
    /** serverが決めた今日（「今日」のラベルに使う）。最初のpageの値を使う */
    today: pages?.[0]?.today ?? null,
    days: pages?.flatMap((page) => page.items) ?? [],
  };
};

/**
 * 日の詳細。日付をキーにし、その時点でゴミ箱の外にある同日のDotを新しい順に取得する。
 * 日付ごとにqueryを分けるので、素早く別の日へ切り替えても前の日の応答を今の日として表示しない。
 * 0件（一覧の取得後にその日のDotがすべてゴミ箱へ移った・完全削除された）なら、一覧と今日を取り直す。
 */
export const useDayDetail = (date: string) => {
  const { request } = useAuth();
  const userId = useUserId();
  const refreshHistory = useRefreshHistory();
  const queryKey = dayKey(userId, date);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getDay(request, date, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    // URL由来の日付は画面でも確かめるが、ここでも実在する暦日でなければ通信しない。
    enabled: userId !== null && isCalendarDate(date),
    retry: retryTransient,
  });
  useRestartOnInvalidCursor(queryKey, query.error);
  const dots = query.data?.pages.flatMap((page) => page.dots) ?? [];
  const empty = query.isSuccess && dots.length === 0 && !query.hasNextPage;

  // 0件と分かった取得ごとに1回取り直す（dataUpdatedAtが変わったときだけ）。
  const { dataUpdatedAt } = query;
  useEffect(() => {
    if (empty) void refreshHistory();
  }, [empty, dataUpdatedAt, refreshHistory]);

  return { ...query, dots, empty };
};

/**
 * 一覧と今日を取り直す。一覧の画面が閉じていても（非活性のqueryでも）すぐ取り直し、戻ったときに古い丸を見せない。
 */
export const useRefreshHistory = () => {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: daysKey(userId), refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: todayKey(userId), refetchType: "all" }),
    ]);
  }, [queryClient, userId]);
};
