import { useCallback, useEffect } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { getDay, getToday, listDays } from "../api";

/**
 * 履歴のquery。正本はserverで、ここではcacheと取得の状態だけを持つ（frontend.md §2）。
 * 本文はquery cacheにだけ置き、認証の終了・利用者の切り替わりでAuth Providerが消す。
 */

const HISTORY_QUERY_KEY = ["history"] as const;
const TODAY_QUERY_KEY = [...HISTORY_QUERY_KEY, "today"] as const;
const DAYS_QUERY_KEY = [...HISTORY_QUERY_KEY, "days"] as const;
const dayQueryKey = (date: string) => [...HISTORY_QUERY_KEY, "day", date] as const;

/** Day: 今日の最新のDot。今日の記録が無いことは`dot_count: 0`で返り、取得失敗とは別 */
export const useToday = () => {
  const { request } = useAuth();
  return useQuery({ queryKey: TODAY_QUERY_KEY, queryFn: () => getToday(request) });
};

/**
 * 日単位の一覧。続きはserverの`next_cursor`でたどる（`null`なら終わり）。
 * 続きの取得に失敗しても取得済みのpagesは残る（`isFetchNextPageError`で区別する）。
 */
export const useDayList = () => {
  const { request } = useAuth();
  const query = useInfiniteQuery({
    queryKey: DAYS_QUERY_KEY,
    queryFn: ({ pageParam }) => listDays(request, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
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
  const refreshHistory = useRefreshHistory();
  const query = useInfiniteQuery({
    queryKey: dayQueryKey(date),
    queryFn: ({ pageParam }) => getDay(request, date, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
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
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: DAYS_QUERY_KEY, refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: TODAY_QUERY_KEY, refetchType: "all" }),
    ]);
  }, [queryClient]);
};
