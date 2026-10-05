import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";

import { ErrorState } from "@/components/error-state/error-state";
import { Spinner, Text } from "@/design-system";
import { useQueryClient } from "@tanstack/react-query";

import { SESSION_QUERY_KEY, useAuth } from "../auth-provider";
import { safeRedirect } from "../redirect";

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

// 副作用を始める画面で、入るときの確かめ直しを待つ上限。offlineで取り直しが止まったまま、回線が戻った
// ときに利用者の操作なしに録音が始まらないよう、待ちきれなければHomeへ戻す。
const VERIFY_TIMEOUT_MS = 10_000;

export function RequireAuth({ children, startsOnEnter = false }: RequireAuthProps) {
  const { status, endReason, refresh } = useAuth();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  // 入るときの確かめ直しが終わったか（startsOnEnterのとき）。"timeout"なら待ちきれなかった。
  const [check, setCheck] = useState<"pending" | "done" | "timeout">(startsOnEnter ? "pending" : "done");
  // 一度離れると決めたら、状態が戻っても（画面の遷移が終わる前に戻っても）中身を出し直さない。
  const leftRef = useRef<"login" | "home" | null>(null);

  useEffect(() => {
    if (!startsOnEnter) return;
    let active = true;
    const timer = setTimeout(() => {
      if (active) setCheck((current) => (current === "pending" ? "timeout" : current));
    }, VERIFY_TIMEOUT_MS);
    void refresh().finally(() => {
      if (!active) return;
      // offlineでは取り直しが一時停止（paused）したまま、refreshはすぐに返る。cacheの認証済みで中身を出さないよう、
      // 確かめられなかったとして扱う。
      const paused = queryClient.getQueryState(SESSION_QUERY_KEY)?.fetchStatus === "paused";
      setCheck((current) => (current === "pending" ? (paused ? "timeout" : "done") : current));
    });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [startsOnEnter, refresh, queryClient]);

  if (startsOnEnter && leftRef.current === null) {
    if (check === "timeout") {
      leftRef.current = "home";
    } else if (check === "done" && status !== "authenticated") {
      // 入るときの確かめ直しで認証済みと分からなかった、または中身を出した後に認証済みでなくなった。
      // どちらも、後の自動の取り直し（focus・再接続）で戻っても中身を出さず、利用者がもう一度始める。
      leftRef.current = status === "anonymous" ? "login" : "home";
    }
  }
  if (leftRef.current !== null) {
    return leftRef.current === "login" ? <Navigate to="/login" replace /> : <Navigate to="/" replace />;
  }
  if (startsOnEnter && check === "pending") {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="ログインの状態を確かめています" />
      </div>
    );
  }

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
