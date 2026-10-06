import type { useAuth } from "@/features/auth";
import {
  dayDetailSchema,
  dayListSchema,
  todaySchema,
  type DayDetail,
  type DayList,
  type Today,
} from "@/libs/api-contract/schemas";

/**
 * 履歴の通信関数（契約のhistory tag）。失敗はApiErrorで投げる。
 * 認証のCookie・CSRF・`401`の扱いをAuth Providerに集めるため、`useAuth().request`を受け取って呼ぶ（frontend.md §2）。
 */

type AuthorizedRequest = ReturnType<typeof useAuth>["request"];

// cursorはserverが返した値をそのまま渡す（Webは中身を解釈しない）。
const withCursor = (path: string, cursor: string | null): string => {
  return cursor === null ? path : `${path}?${new URLSearchParams({ cursor })}`;
};

export const getToday = (request: AuthorizedRequest): Promise<Today> => {
  return request("/api/v1/days/today", { schema: todaySchema });
};

export const listDays = (request: AuthorizedRequest, cursor: string | null): Promise<DayList> => {
  return request(withCursor("/api/v1/days", cursor), { schema: dayListSchema });
};

/** `date`は呼び出し側で`isCalendarDate`を確かめた値だけを渡す */
export const getDay = (request: AuthorizedRequest, date: string, cursor: string | null): Promise<DayDetail> => {
  return request(withCursor(`/api/v1/days/${encodeURIComponent(date)}`, cursor), { schema: dayDetailSchema });
};
