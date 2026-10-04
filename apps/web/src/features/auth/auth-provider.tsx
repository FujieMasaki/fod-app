import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { apiRequest, isProblem } from "@/libs/api-client/request";
import type { Session } from "@/libs/api-contract/schemas";
import { createSession, deleteSession, getSession, type Credentials } from "./api";

/**
 * 認証状態の正本はRailsのCookie session。ここではその写しをTanStack Queryに持ち、
 * 画面のguard・CSRF token・失効の検出・利用者の切り替わりの通知を担う（TASK-007 Plan §7-2・§7-3）。
 * localStorageやURLの値を認証の根拠にしない。
 */

export const SESSION_QUERY_KEY = ["auth", "session"] as const;

/**
 * - checking: 初回の取得中
 * - unknown: 取得に失敗した。未認証と同じには扱わず、保護する画面を閉じて再試行させる
 * - anonymous / authenticated: serverの応答どおり
 * - deletion_in_progress: 退会を受理済み（画面はTASK-014）
 */
export type AuthStatus = "checking" | "unknown" | "anonymous" | "authenticated" | "deletion_in_progress";

/**
 * このタブで認証が終わった理由。ログイン画面の案内に使う。
 * - signed_out: このタブでlogoutした
 * - expired: 7日の期限が切れた
 * - session_lost: それ以外（別タブでのlogout、serverが未認証と返した）
 */
export type EndReason = "signed_out" | "expired" | "session_lost";

export type SessionUser = Extract<Session, { authenticated: true }>["user"];

type RequestOptions<T> = Omit<NonNullable<Parameters<typeof apiRequest<T>>[1]>, "csrfToken">;

type AuthContextValue = {
  status: AuthStatus;
  user: SessionUser | null;
  /** 認証成功から7日の期限（案内用。判断はserverの応答に従う） */
  expiresAt: string | null;
  /** Googleのform POSTに入れるCSRF token。取得できていなければnull */
  csrfToken: string | null;
  endReason: EndReason | null;
  /** 認証状態を取り直す */
  refresh: () => Promise<void>;
  /**
   * 状態を変える操作を、最新のCSRF tokenで実行する。`csrf_invalid`ならtokenを取り直して1回だけ再送し、
   * `401`なら認証の終了として扱ってから投げ直す。
   */
  withCsrf: <T>(operation: (csrfToken: string) => Promise<T>) => Promise<T>;
  /** 保護APIを呼ぶ入口（後続の機能はこれを使う） */
  request: <T = undefined>(path: string, options?: RequestOptions<T>) => Promise<T>;
  signIn: (credentials: Credentials) => Promise<void>;
  /** 失敗したら投げる。serverで終わったと確認できるまでlogin中のまま */
  signOut: () => Promise<void>;
  /** ページ遷移を伴うlogin（Google）の前に呼ぶ。前の利用者の個人データを先に消す */
  prepareExternalSignIn: () => void;
  /**
   * 認証の終了・利用者の切り替わりを購読する。個人データを持つstate（SessionProvider、TASK-014の
   * 端末データ）はここで消す。戻り値で購読をやめる。
   */
  subscribeIdentityChange: (listener: () => void) => () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// setTimeoutの上限（約24.8日）。7日の期限はこれに収まるが、端末の時刻がずれていても溢れないようにする。
const MAX_TIMER_MS = 2_147_483_647;

function deriveStatus(session: Session | undefined, isError: boolean): AuthStatus {
  if (!session) return isError ? "unknown" : "checking";
  if (!session.authenticated) return "anonymous";
  return session.account_status === "deletion_in_progress" ? "deletion_in_progress" : "authenticated";
}

// 認証以外のquery（前の利用者のresponse）を取り消して消す。
function clearPrivateQueries(queryClient: QueryClient) {
  const predicate = ({ queryKey }: { queryKey: readonly unknown[] }) => queryKey[0] !== SESSION_QUERY_KEY[0];
  void queryClient.cancelQueries({ predicate });
  queryClient.removeQueries({ predicate });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: getSession,
    // 別タブでのlogout・loginを、画面へ戻ったときに検出する。
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const session = sessionQuery.data;
  const status = deriveStatus(session, sessionQuery.isError);
  const authenticatedSession = session?.authenticated ? session : null;
  const [endReason, setEndReason] = useState<EndReason | null>(null);

  const listenersRef = useRef(new Set<() => void>());
  const notifyIdentityChange = useCallback(() => {
    clearPrivateQueries(queryClient);
    for (const listener of listenersRef.current) listener();
  }, [queryClient]);

  const subscribeIdentityChange = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // 確定した利用者が前回と変わったら通知する。初回の確定（checkingから）は通知しない。
  const identity = authenticatedSession ? authenticatedSession.user.id : status === "anonymous" ? null : undefined;
  const previousRef = useRef<{ identity: string | null; expiresAt: string | null } | undefined>(undefined);
  useEffect(() => {
    if (identity === undefined) return;
    const previous = previousRef.current;
    previousRef.current = { identity, expiresAt: authenticatedSession?.expires_at ?? null };
    if (!previous || previous.identity === identity) return;

    if (identity === null) {
      // serverは期限切れを未認証として返すため、期限を過ぎていれば期限切れと判断する。
      const expired = previous.expiresAt !== null && Date.parse(previous.expiresAt) <= Date.now();
      setEndReason((current) => current ?? (expired ? "expired" : "session_lost"));
    } else {
      setEndReason(null);
    }
    notifyIdentityChange();
  }, [identity, authenticatedSession?.expires_at, notifyIdentityChange]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  }, [queryClient]);

  // serverが認証の終了を返した。取り直しが失敗しても保護する画面を閉じられるよう、先に未認証として置く。
  const markEnded = useCallback(
    (reason: EndReason) => {
      setEndReason(reason);
      queryClient.setQueryData<Session>(SESSION_QUERY_KEY, (current) =>
        current ? { authenticated: false, csrf_token: current.csrf_token } : current,
      );
      void refresh();
    },
    [queryClient, refresh],
  );

  // 期限の時刻に取り直す。端末のsleepなどで遅れても、画面へ戻ったときの取り直しと保護APIの401で補う。
  const expiresAt = authenticatedSession?.expires_at ?? null;
  useEffect(() => {
    if (!expiresAt) return;
    const delay = Math.min(Math.max(Date.parse(expiresAt) - Date.now(), 0) + 1000, MAX_TIMER_MS);
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [expiresAt, refresh]);

  const currentCsrfToken = useCallback(async () => {
    const cached = queryClient.getQueryData<Session>(SESSION_QUERY_KEY);
    if (cached) return cached.csrf_token;
    return (await queryClient.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: getSession })).csrf_token;
  }, [queryClient]);

  const withCsrf = useCallback(
    async <T,>(operation: (csrfToken: string) => Promise<T>): Promise<T> => {
      try {
        try {
          return await operation(await currentCsrfToken());
        } catch (error) {
          if (!isProblem(error, "csrf_invalid")) throw error;
          const fresh = await queryClient.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: getSession, staleTime: 0 });
          return await operation(fresh.csrf_token);
        }
      } catch (error) {
        if (isProblem(error, "session_expired")) markEnded("expired");
        else if (isProblem(error, "unauthenticated")) markEnded("session_lost");
        throw error;
      }
    },
    [currentCsrfToken, markEnded, queryClient],
  );

  const request = useCallback(
    <T = undefined,>(path: string, options: RequestOptions<T> = {}) =>
      withCsrf((csrfToken) => apiRequest<T>(path, { ...options, csrfToken })),
    [withCsrf],
  );

  const signIn = useCallback(
    async (credentials: Credentials) => {
      const next = await withCsrf((csrfToken) => createSession(csrfToken, credentials));
      queryClient.setQueryData(SESSION_QUERY_KEY, next);
    },
    [queryClient, withCsrf],
  );

  const signOut = useCallback(async () => {
    // serverの応答を待たずに、前の利用者の個人データを画面から外す。
    notifyIdentityChange();
    try {
      await withCsrf((csrfToken) => deleteSession(csrfToken));
    } catch (error) {
      // 終わったと断定せず、login中のまま状態を確かめ直す（TASK-001 Plan §20）。
      void refresh();
      throw error;
    }
    markEnded("signed_out");
  }, [markEnded, notifyIdentityChange, refresh, withCsrf]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: authenticatedSession?.user ?? null,
      expiresAt,
      csrfToken: session?.csrf_token ?? null,
      endReason,
      refresh,
      withCsrf,
      request,
      signIn,
      signOut,
      prepareExternalSignIn: notifyIdentityChange,
      subscribeIdentityChange,
    }),
    [
      status,
      authenticatedSession,
      expiresAt,
      session?.csrf_token,
      endReason,
      refresh,
      withCsrf,
      request,
      signIn,
      signOut,
      notifyIdentityChange,
      subscribeIdentityChange,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth は AuthProvider の内側で使用してください。");
  return context;
}
