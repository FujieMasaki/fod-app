import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";

import { ErrorState } from "@/components/error-state/error-state";
import { Spinner, Text } from "@/design-system";
import { useQuery, useQueryClient, type QueryState } from "@tanstack/react-query";

import type { Session } from "@/libs/api-contract/schemas";
import { getSession } from "../api";
import { needsReload } from "../messages";
import { SESSION_QUERY_KEY, useAuth } from "../auth-provider";
import { safeRedirect } from "../redirect";
import { ReloadNotice } from "./auth-layout";

/**
 * 本人の録音・Dotを扱う画面のguard。serverで認証を確かめるまで中身を表示しない。
 * 取得の失敗（unknown）は未認証と同じには扱わず、再試行を出す（TASK-001 Plan §20）。
 * 期限切れ・別タブでのlogoutで状態が変わったときも、ここでログインへ移る。
 */
type RequireAuthProps = {
  children: ReactNode;
  /**
   * 中身が開いたときに副作用を始める画面（録音画面はマイクを開いて録音を、整理の画面は生成を始める）ならtrue。
   * - 開いたときにserverへ認証を確かめ直し、その応答で認証済みと分かるまで中身を出さない（マイクを開始する
   *   前・送る前にRailsで確かめる。journaling.md §4「録音前認証と期限切れ」）。
   * - 中身を出した後に認証済みでなくなったら、状態が戻っても中身を出し直さずHome（未認証ならログイン）へ移る。
   *   出し直すと、利用者の操作なしに録音や生成がもう一度始まるため（security.md §2）。
   */
  startsOnEnter?: boolean;
};

type SessionQueryState = Pick<QueryState<Session>, "status" | "fetchStatus" | "data">;

// sessionのqueryの今の状態から、副作用を始める画面の中身を出してよいかを決める。
// - ok: serverが認証済み（退会中でない）と返している
// - anonymous: 未認証と返している
// - lost: 取得に失敗した・退会中
// - busy: 取得中・offlineで一時停止中（まだ分からない）
// serverが最後に未認証・退会中と返していれば、次の取り直しの最中でも待たずにそれを使う（認証済みの判断だけを、
// 取り直しが終わるまで保留する）。
function liveVerdictOf(state: SessionQueryState | undefined): "ok" | "anonymous" | "lost" | "busy" {
  if (!state) return "busy";
  if (state.status === "success" && state.data) {
    if (!state.data.authenticated) return "anonymous";
    if (state.data.account_status !== "active") return "lost";
  }
  if (state.fetchStatus !== "idle") return "busy";
  if (state.status === "error") return "lost";
  return state.data ? "ok" : "busy";
}

// 副作用を始める画面で、中身を出すまで待つ上限。offlineで取り直しが止まったまま、回線が戻ったときに
// 利用者の操作なしに録音が始まらないよう、それまでに中身を出せなければHomeへ戻す（確かめ直しが済んだ
// 直後に別の取り直しが始まって止まった場合も含む）。
const VERIFY_TIMEOUT_MS = 10_000;

export function RequireAuth({ children, startsOnEnter = false }: RequireAuthProps) {
  if (startsOnEnter) return <EntryVerifiedGuard>{children}</EntryVerifiedGuard>;
  return <SessionGuard>{children}</SessionGuard>;
}

/**
 * 副作用を始める画面のguard。contextの状態はTanStack Queryの通知が届くまで前の値のことがあるため、使わない。
 * sessionのqueryの今の状態を、取得しない観測者（enabled: false）で購読して判断する。
 */
function EntryVerifiedGuard({ children }: { children: ReactNode }) {
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const live = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: getSession, enabled: false });
  // 入るときの確かめ直しの結果。確かめ直しが終わった時点のqueryの状態から決める。
  const [check, setCheck] = useState<"pending" | "verified" | "anonymous" | "unconfirmed">("pending");
  const [timedOut, setTimedOut] = useState(false);
  // 中身を一度出した（commitした）か。出した後の取り直しの間は中身を保つ（出し直しで録音・生成が始め直され
  // ないように）。捨てられる描画で立たないよう、commit後のeffectで立てる。
  const shownRef = useRef(false);
  // 一度離れると決めたら、状態が戻っても（画面の遷移が終わる前に戻っても）中身を出し直さない。
  const leftRef = useRef<"login" | "home" | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) setTimedOut(true);
    }, VERIFY_TIMEOUT_MS);
    const verify = async () => {
      await refresh();
      // 直接開いた・再読み込みしたときは、このeffectがAuthProviderの購読より先に動き、queryがまだ使われていない
      // 扱いのため、refreshは取得せずに返る。一度も取得が終わっていなければ、最初の取得を待つ（実行中なら共有する）。
      const state = queryClient.getQueryState<Session>(SESSION_QUERY_KEY);
      if (!state || state.dataUpdateCount + state.errorUpdateCount === 0) {
        await queryClient.fetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: getSession }).catch(() => undefined);
      }
    };
    void verify().finally(() => {
      if (!active) return;
      // offlineでは取り直しが一時停止（paused）したまま、refreshはすぐに返る。cacheで判断しない。
      const verdict = liveVerdictOf(queryClient.getQueryState<Session>(SESSION_QUERY_KEY));
      const result = verdict === "ok" ? "verified" : verdict === "anonymous" ? "anonymous" : "unconfirmed";
      setCheck((current) => (current === "pending" ? result : current));
    });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh, queryClient]);

  const verdict = liveVerdictOf(live);
  const showing =
    leftRef.current === null &&
    check === "verified" &&
    (verdict === "ok" || (verdict === "busy" && shownRef.current));
  useEffect(() => {
    if (showing) shownRef.current = true;
  }, [showing]);

  if (leftRef.current === null) {
    if (check === "anonymous" || (check === "verified" && verdict === "anonymous")) {
      leftRef.current = "login";
    } else if (
      check === "unconfirmed" ||
      (check === "verified" && verdict === "lost") ||
      (timedOut && !shownRef.current)
    ) {
      // 確かめ直しで認証済みと分からなかった、中身を出す前後に認証済みでなくなった、または上限までに中身を
      // 出せなかった。後の自動の取り直し（focus・再接続）で戻っても中身を出さず、利用者がもう一度始める。
      leftRef.current = "home";
    }
  }
  if (leftRef.current !== null) {
    return leftRef.current === "login" ? <Navigate to="/login" replace /> : <Navigate to="/" replace />;
  }
  if (showing) return children;
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner label="ログインの状態を確かめています" />
    </div>
  );
}

function SessionGuard({ children }: { children: ReactNode }) {
  const { status, endReason, refresh } = useAuth();
  const { pathname } = useLocation();
  // 取得の失敗の種類を見るだけの観測者（取得はしない）。schemaに合わない応答は古いタブの可能性がある。
  const { error } = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: getSession, enabled: false });

  switch (status) {
    case "authenticated":
      return children;
    case "checking":
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner label="ログインの状態を確かめています" />
        </div>
      );
    case "unknown":
      // 再試行しても直らないため、再読み込みを案内する（frontend.md「schema不正」）。
      if (needsReload(error)) {
        return (
          <div className="flex h-full flex-col justify-center">
            <ReloadNotice />
          </div>
        );
      }
      return (
        <ErrorState
          title="ログインの状態を確かめられませんでした。"
          // logoutの失敗の直後にここへ来ることがある（取り直しも失敗したとき）。共有端末で、logoutが済んだと
          // 思って離れないよう、済んでいない可能性も示す。
          description="通信できる状態で、もう一度お試しください。ログアウトの途中だった場合は、まだログアウトできていない可能性があります。"
          onRetry={() => void refresh()}
        />
      );
    case "deletion_in_progress":
      // 退会の状況画面はTASK-014。それまでは本人の録音・Dotの画面を開かない。
      return (
        <div className="flex h-full flex-col justify-center gap-2" role="status">
          <Text variant="title" as="h1">
            退会の手続き中です
          </Text>
          <Text variant="small" tone="secondary">
            手続きが終わるまで、録音やDotの画面は使えません。
          </Text>
        </div>
      );
    case "anonymous": {
      // このタブでlogoutした後は、同じ画面へ戻さない（次の人が使う場合を考える）。
      const redirect = endReason === "signed_out" ? "/" : safeRedirect(pathname);
      return <Navigate to="/login" search={redirect === "/" ? {} : { redirect }} replace />;
    }
  }
}
