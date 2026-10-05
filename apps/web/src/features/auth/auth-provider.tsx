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

import type { z } from "zod";

import { ApiError, apiRequest, isProblem, type ApiRequestOptions } from "@/libs/api-client/request";
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

type RequestOptions = Omit<ApiRequestOptions, "csrfToken">;

/** 保護APIの入口。schemaを渡したときだけ本文を返す（apiRequestと同じ） */
type AuthorizedRequest = {
  <T>(path: string, options: RequestOptions & { schema: z.ZodType<T> }): Promise<T>;
  (path: string, options?: RequestOptions & { schema?: undefined }): Promise<void>;
};

type AuthContextValue = {
  status: AuthStatus;
  user: SessionUser | null;
  /** 認証成功から7日の期限（案内用。判断はserverの応答に従う） */
  expiresAt: string | null;
  /** Googleのform POSTに入れるCSRF token。取得できていなければnull */
  csrfToken: string | null;
  endReason: EndReason | null;
  /** 終了の理由を案内し終えたら呼ぶ（古い案内が残り続けず、次の戻り先の判断にも使われないように） */
  acknowledgeEndReason: () => void;
  /** 認証状態を取り直す（login・logoutの間に呼ばれたら、終わってから取り直す） */
  refresh: () => Promise<void>;
  /**
   * 利用者が切り替わるたびに増える番号。時間のかかる処理は始めたときの値を控え、結果を表示・保存する前に
   * 今の値と比べる。違えば切り替わりの前に始めた処理なので、結果を捨てる（前の利用者の結果を見せない）。
   */
  identityEpoch: number;
  /**
   * 状態を変える操作を、最新のCSRF tokenで実行する。`csrf_invalid`ならtokenを取り直して1回だけ再送し、
   * `401`なら認証の終了として扱ってから投げ直す。login・logoutの間に呼ばれたら終わるまで待ち、その間に
   * 利用者が変わっていたら送らずに`Error("identity_changed")`を投げる（`request`も同じ）。
   */
  withCsrf: <T>(operation: (csrfToken: string) => Promise<T>) => Promise<T>;
  /** 保護APIを呼ぶ入口（後続の機能はこれを使う） */
  request: AuthorizedRequest;
  signIn: (credentials: Credentials) => Promise<void>;
  /**
   * 失敗したら投げる。serverで終わったと確認できるまでlogin中のまま。投げるのは`ApiError`（通信の失敗・
   * 実行中の通信を待ちきれなかった）か、送り直しても認証が残ったときの`Error("sign_out_unconfirmed")`。
   * 画面はどちらも「確かめられなかった」として扱う。
   */
  signOut: () => Promise<void>;
  /** ページ遷移を伴うlogin（Google）の前に呼ぶ。前の利用者の個人データを先に消す */
  prepareExternalSignIn: () => void;
  /**
   * 認証の終了・利用者の切り替わりを購読する。個人データを持つstate（SessionProvider、TASK-014の
   * 端末データ）はここで消す。戻り値で購読をやめる。同じ切り替わりで複数回呼ばれ得る（logoutの開始と
   * 完了など）ため、購読者は何度呼ばれても同じ結果になるようにする。
   */
  subscribeIdentityChange: (listener: () => void) => () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// setTimeoutの上限（約24.8日）。7日の期限はこれに収まるが、端末の時刻がずれていても溢れないようにする。
const MAX_TIMER_MS = 2_147_483_647;
// 端末の時計では期限を過ぎたのにserverがまだ認証済みと返したとき、次に確かめるまでの間隔。
const EXPIRY_RECHECK_MS = 30_000;
// login・logoutの前に、実行中の通信の応答を待つ上限。offlineで止まった通信を待ち続けないため。
const SETTLE_TIMEOUT_MS = 10_000;
// serverがloginを拒んだと読み取れる失敗。これ以外（通信・schema）はloginが済んだか分からない。
const LOGIN_REJECTIONS = [
  "invalid_credentials",
  "email_unconfirmed",
  "validation_failed",
  "rate_limited",
  "csrf_invalid",
] as const;

/** 認証済みなら利用者のid、未認証ならnull、まだ分からなければundefined */
function identityOf(session: Session | undefined): string | null | undefined {
  if (!session) return undefined;
  return session.authenticated ? session.user.id : null;
}

function deriveStatus(session: Session | undefined, isError: boolean): AuthStatus {
  if (!session) return isError ? "unknown" : "checking";
  if (!session.authenticated) return "anonymous";
  // 取り直しに失敗したら、前に得た認証済みのまま保護する画面を見せ続けない（確かめられない状態にする）。
  // 未認証のcacheは、失敗しても安全側なのでそのまま使う。
  if (isError) return "unknown";
  return session.account_status === "deletion_in_progress" ? "deletion_in_progress" : "authenticated";
}

// 認証状態のquery以外（前の利用者のresponse）を取り消して消す。
function clearPrivateQueries(queryClient: QueryClient) {
  const predicate = ({ queryKey }: { queryKey: readonly unknown[] }) =>
    JSON.stringify(queryKey) !== JSON.stringify(SESSION_QUERY_KEY);
  void queryClient.cancelQueries({ predicate });
  queryClient.removeQueries({ predicate });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // login・logoutの送信中は、ほかの通信を始めない。RailsのCookieStoreはどの応答でもCookieを書き直すため
  // （`GET /api/v1/session`も保護APIも）、login・logoutの前に送った通信の応答が後から届くと、Cookieが前の
  // 状態へ戻る（logoutが取り消される、loginしたのに未認証になる）。
  const [authBusy, setAuthBusy] = useState(false);
  const authBusyRef = useRef(false);
  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: getSession,
    // 別タブでのlogout・loginを、画面へ戻ったときに検出する。login・logoutの間は止める。stateではなくrefで
    // その場で判定する（stateだと次の描画まで反映されず、その間に始まった取り直しが待つ対象から漏れるため）。
    refetchOnWindowFocus: () => !authBusyRef.current,
    refetchOnReconnect: () => !authBusyRef.current,
    staleTime: 0,
  });
  const session = sessionQuery.data;
  const status = deriveStatus(session, sessionQuery.isError);
  const authenticatedSession = session?.authenticated ? session : null;
  const [endReason, setEndReason] = useState<EndReason | null>(null);

  // 実行中の保護API（request・withCsrf）。login・logoutはこれらの応答を受け取り終えてから送る。
  const inflightRef = useRef(new Set<Promise<unknown>>());
  // 実行中のlogin・logout。重なって呼ばれたら順に実行する（先に終わった側が排他を解かないように）。
  const exclusiveRef = useRef<Promise<unknown> | null>(null);

  // 確定した利用者（認証済みならid、未認証ならnull、まだ分からなければundefined）。
  const identity = authenticatedSession ? authenticatedSession.user.id : status === "anonymous" ? null : undefined;

  // 利用者が切り替わるたびに増える番号。切り替わりの前に始めた処理の結果や、前の利用者の端末の値を捨てるために使う。
  // 描画の後のeffectで増やすと、新しい利用者と古い番号が同じ描画に出て、前の利用者のDotが1回描画され得る。
  // そのため、描画の中で前回の利用者と比べて増やす（Reactの「描画の中でstateを調整する」形。同じcommitに入る）。
  // 初回の確定（まだ分からない状態から）では増やさない。
  const [epochState, setEpochState] = useState<{ identity: string | null | undefined; epoch: number }>({
    identity: undefined,
    epoch: 0,
  });
  let identityEpoch = epochState.epoch;
  if (identity !== undefined && identity !== epochState.identity) {
    const next = { identity, epoch: epochState.epoch + (epochState.identity === undefined ? 0 : 1) };
    setEpochState(next);
    identityEpoch = next.epoch;
  }

  const listenersRef = useRef(new Set<() => void>());
  // 認証以外のqueryを消し、購読者（端末の個人データ）へ伝える。
  const clearPrivateState = useCallback(() => {
    clearPrivateQueries(queryClient);
    for (const listener of listenersRef.current) listener();
  }, [queryClient]);
  // 利用者が変わる前に呼ぶ（logoutの開始・Googleへの遷移）。番号も増やす。
  const notifyIdentityChange = useCallback(() => {
    setEpochState((current) => ({ ...current, epoch: current.epoch + 1 }));
    clearPrivateState();
  }, [clearPrivateState]);

  const subscribeIdentityChange = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // 確定した利用者が前回と変わったら、終了の理由を決めて個人データを消す。初回の確定（checkingから）は通知しない。
  // 番号は上の描画の中で既に増えている。
  const previousRef = useRef<{ identity: string | null; expiresAt: string | null } | undefined>(undefined);
  // このタブでlogoutしている間に未認証へ変わったら、理由はlogoutにする（描画の順序に依らないように）。
  const signingOutRef = useRef(false);
  useEffect(() => {
    if (identity === undefined) return;
    const previous = previousRef.current;
    previousRef.current = { identity, expiresAt: authenticatedSession?.expires_at ?? null };
    if (!previous || previous.identity === identity) return;

    if (identity === null) {
      // serverは期限切れを未認証として返すため、期限を過ぎていれば期限切れと判断する。
      const expired = previous.expiresAt !== null && Date.parse(previous.expiresAt) <= Date.now();
      const reason = signingOutRef.current ? "signed_out" : expired ? "expired" : "session_lost";
      setEndReason((current) => current ?? reason);
    } else {
      setEndReason(null);
    }
    clearPrivateState();
  }, [identity, authenticatedSession?.expires_at, clearPrivateState]);

  // login・logoutの間に呼ばれたら、終わるまで待ってから取り直す（その応答がCookieを戻し得るため）。
  // 実行中の取り直しは取り消さずに共有する（cancelRefetch: false）。取り消してもfetchの通信は止まらず、
  // isFetchingだけが0になるため、login・logoutがその応答を待てなくなる。
  const refresh = useCallback(async () => {
    while (exclusiveRef.current) await exclusiveRef.current.catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }, { cancelRefetch: false });
  }, [queryClient]);

  // serverが認証の終了を返した。取り直しが失敗しても保護する画面を閉じられるよう、先に未認証として置く。
  const markEnded = useCallback(
    (reason: EndReason) => {
      // もともと未認証なら、終わった認証はないので理由を残さない（ログイン画面の案内を誤らせない）。
      const current = queryClient.getQueryData<Session>(SESSION_QUERY_KEY);
      if (current?.authenticated) {
        setEndReason(reason);
        queryClient.setQueryData<Session>(SESSION_QUERY_KEY, { authenticated: false, csrf_token: current.csrf_token });
      }
      // login・logoutの間は取り直さない（その応答がCookieを戻し得るため）。login・logoutが終わった後に取り直す。
      if (!authBusyRef.current) void refresh();
    },
    [queryClient, refresh],
  );

  // 期限の時刻に取り直す。端末のsleepなどで遅れても、画面へ戻ったときの取り直しと保護APIの401で補う。
  // 端末の時計がserverより進んでいると期限の前に取り直してしまい、まだ認証済みが返る。そのときは
  // 取り直すたびに（dataUpdatedAtが変わる）、間隔を空けて予約し直す。
  // 取り直しが失敗したとき（errorUpdatedAtが変わる）も予約し直す。
  const expiresAt = authenticatedSession?.expires_at ?? null;
  const sessionUpdatedAt = sessionQuery.dataUpdatedAt;
  const sessionErrorAt = sessionQuery.errorUpdatedAt;
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    const wait = remaining > 0 ? Math.min(remaining + 1000, MAX_TIMER_MS) : EXPIRY_RECHECK_MS;
    const timer = setTimeout(() => {
      if (!authBusyRef.current) void refresh();
    }, wait);
    return () => clearTimeout(timer);
  }, [expiresAt, sessionUpdatedAt, sessionErrorAt, authBusy, refresh]);

  // login・logoutの間は取り直しとほかの通信を止め、送る前に実行中の通信の応答を受け取り終える
  // （上のauthBusyの理由）。offlineで止まった通信を待ち続けないよう、待つ時間には上限を置く。
  const runExclusively = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const previous = exclusiveRef.current;
      // 呼ばれたその場で取り直しを止める（awaitの後に立てると、その間に始まった取り直しが待つ対象から漏れる）。
      authBusyRef.current = true;
      setAuthBusy(true);
      const run = (async () => {
        await previous?.catch(() => undefined);
        const pending: Promise<unknown>[] = [...inflightRef.current];
        // 実行中の取り直しがあればその応答を待つ（実行中ならfetchQueryは新しく送らず、同じ応答を待つ）。
        // offlineで一時停止している取り直し（paused）も、onlineへ戻ると送られるため待つ対象に含める。
        const sessionFetch = queryClient.getQueryState(SESSION_QUERY_KEY)?.fetchStatus ?? "idle";
        if (sessionFetch !== "idle") {
          pending.push(queryClient.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: getSession }));
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const settled = await Promise.race([
          Promise.allSettled(pending).then(() => true),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), SETTLE_TIMEOUT_MS);
          }),
        ]);
        clearTimeout(timer);
        // 待ちきれなかった通信の応答は、後から届いてCookieを戻し得る。送らずに失敗にする（利用者が再試行する）。
        if (!settled) throw new ApiError("network");
        return operation();
      })();
      exclusiveRef.current = run;
      return run.finally(() => {
        if (exclusiveRef.current !== run) return;
        exclusiveRef.current = null;
        authBusyRef.current = false;
        setAuthBusy(false);
      });
    },
    [queryClient],
  );

  const currentCsrfToken = useCallback(async () => {
    const cached = queryClient.getQueryData<Session>(SESSION_QUERY_KEY);
    if (cached) return cached.csrf_token;
    return (await queryClient.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: getSession })).csrf_token;
  }, [queryClient]);

  const withCsrf = useCallback(
    async <T,>(operation: (csrfToken: string) => Promise<T>, calledAs?: string | null): Promise<T> => {
      // 401を受けたときに、始めたときの利用者と今の利用者を比べるために控える。
      let startedAsRef: string | null | undefined = calledAs;
      try {
        const csrfToken = await currentCsrfToken();
        // 始めたときの利用者。再送の前に変わっていたら送らない（Aとして始めた操作をBの認証で送らないため）。
        // 呼び出し側がlogin・logoutを待つ前の利用者を渡したときは、それを使う。
        const startedAs = calledAs !== undefined ? calledAs : identityOf(queryClient.getQueryData<Session>(SESSION_QUERY_KEY));
        startedAsRef = startedAs;
        try {
          return await operation(csrfToken);
        } catch (error) {
          if (!isProblem(error, "csrf_invalid")) throw error;
          const fresh = await queryClient.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: getSession, staleTime: 0 });
          if (identityOf(fresh) !== startedAs) throw error;
          return await operation(fresh.csrf_token);
        }
      } catch (error) {
        if (isProblem(error, "session_expired", "unauthenticated")) {
          // 前の利用者として送った通信の401で、既に切り替わった後の利用者を未認証にしない（取り直して確かめるだけにする）。
          const stillSameUser =
            startedAsRef === undefined ||
            identityOf(queryClient.getQueryData<Session>(SESSION_QUERY_KEY)) === startedAsRef;
          if (!stillSameUser) void refresh();
          else markEnded(isProblem(error, "session_expired") ? "expired" : "session_lost");
        }
        throw error;
      }
    },
    [currentCsrfToken, markEnded, queryClient, refresh],
  );

  // 後続の機能へ公開する入口。login・logoutの間は始めずに待ち、実行中のものはlogin・logoutが待てるよう数える。
  // 待っている間に利用者が変わったら送らない（Aとして呼んだ操作をBの認証で送らないため。journaling §4）。
  const trackedWithCsrf = useCallback(
    async <T,>(operation: (csrfToken: string) => Promise<T>): Promise<T> => {
      const calledAs = identityOf(queryClient.getQueryData<Session>(SESSION_QUERY_KEY));
      while (exclusiveRef.current) await exclusiveRef.current.catch(() => undefined);
      // まだ認証状態が分からないうちに呼ばれたもの（公開の画面の登録など）は照合しない。
      if (calledAs !== undefined && identityOf(queryClient.getQueryData<Session>(SESSION_QUERY_KEY)) !== calledAs) {
        throw new Error("identity_changed");
      }
      const running = withCsrf(operation, calledAs);
      inflightRef.current.add(running);
      try {
        return await running;
      } finally {
        inflightRef.current.delete(running);
      }
    },
    [queryClient, withCsrf],
  );

  const request = useCallback(
    <T,>(path: string, options: RequestOptions & { schema?: z.ZodType<T> } = {}) =>
      trackedWithCsrf((csrfToken) =>
        // overloadの実装側。schemaの有無による戻り値の違いは、AuthorizedRequestの型で呼び出し側へ示す。
        apiRequest(path, { ...options, csrfToken } as ApiRequestOptions & { schema: z.ZodType<T> }),
      ),
    [trackedWithCsrf],
  ) as AuthorizedRequest;

  const signIn = useCallback(
    async (credentials: Credentials) => {
      // 排他を解く前にloginの結果を置く（待たされていた通信が、login前の無効なtokenで送られないように）。
      try {
        await runExclusively(async () => {
          const next = await withCsrf((csrfToken) => createSession(csrfToken, credentials));
          queryClient.setQueryData(SESSION_QUERY_KEY, next);
        });
      } catch (error) {
        // 応答を読めない失敗（通信・schema）では、serverでloginが済んだかが分からないため確かめ直す。
        if (!isProblem(error, ...LOGIN_REJECTIONS)) void refresh();
        throw error;
      }
      // 新しいCookieで取り直して確かめる。login前に始まった取り直しはlogin前に受け取り終えている
      // （runExclusively）。cancelQueriesは取り消しの際に取り直し前の値へ非同期に戻し、置いたloginの結果を
      // 消し得るので使わない。
      void refresh();
    },
    [queryClient, refresh, runExclusively, withCsrf],
  );

  const signOut = useCallback(async () => {
    // serverの応答を待たずに、前の利用者の個人データを画面から外す。
    notifyIdentityChange();
    const confirmSignedOut = () =>
      queryClient.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: getSession, staleTime: 0 });
    signingOutRef.current = true;
    try {
      await runExclusively(async () => {
        try {
          await withCsrf((csrfToken) => deleteSession(csrfToken));
        } catch (error) {
          // 別タブのlogoutや期限切れで既に終わっていると、古いCSRF tokenのDELETEはcsrf_invalidになり、取り直した
          // Sessionは未認証になる（withCsrfが取り直してcacheを置き換える）。serverで終わっているので成功とする。
          const current = queryClient.getQueryData<Session>(SESSION_QUERY_KEY);
          if (isProblem(error, "csrf_invalid") && current && !current.authenticated) return;
          throw error;
        }
        // 確かめる取り直しで未認証になると、保護する画面はすぐにログインへ移る。その描画の時点で理由が
        // logoutになっているよう、先に置く（失敗したら下のcatchで消す）。
        setEndReason("signed_out");
        // serverで終わったことを確かめる。まだ認証済みなら1回だけ送り直し、それでも残れば失敗にする
        // （共有端末で、logoutしたつもりのCookieを残さないため。TASK-001 Plan §20）。
        if (!(await confirmSignedOut()).authenticated) return;
        await withCsrf((csrfToken) => deleteSession(csrfToken));
        if ((await confirmSignedOut()).authenticated) throw new Error("sign_out_unconfirmed");
      });
    } catch (error) {
      // 終わったと断定せず、login中のまま状態を確かめ直す。
      setEndReason(null);
      void refresh();
      throw error;
    } finally {
      signingOutRef.current = false;
    }
    setEndReason("signed_out");
  }, [notifyIdentityChange, queryClient, refresh, runExclusively, withCsrf]);

  const acknowledgeEndReason = useCallback(() => setEndReason(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: authenticatedSession?.user ?? null,
      expiresAt,
      csrfToken: session?.csrf_token ?? null,
      endReason,
      acknowledgeEndReason,
      refresh,
      identityEpoch,
      withCsrf: trackedWithCsrf,
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
      acknowledgeEndReason,
      refresh,
      identityEpoch,
      trackedWithCsrf,
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
