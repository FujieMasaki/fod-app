import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";

import { ErrorState } from "@/components/error-state/error-state";
import { Spinner, Text } from "@/design-system";
import { useAuth } from "../auth-provider";
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

export function RequireAuth({ children, startsOnEnter = false }: RequireAuthProps) {
  const { status, endReason, refresh } = useAuth();
  const { pathname } = useLocation();
  const [verified, setVerified] = useState(!startsOnEnter);
  const shownRef = useRef(false);
  // 一度離れると決めたら、状態が戻っても（画面の遷移が終わる前に戻っても）中身を出し直さない。
  const leftRef = useRef<"login" | "home" | null>(null);

  useEffect(() => {
    if (!startsOnEnter) return;
    let active = true;
    // 取り直しが終わってから中身を出す。失敗・未認証なら、状態がunknown・anonymousになって下の分岐が扱う。
    void refresh().finally(() => {
      if (active) setVerified(true);
    });
    return () => {
      active = false;
    };
  }, [startsOnEnter, refresh]);

  // 副作用を始める画面を一度出した後に認証済みでなくなったら、中身を出し直さずに離れる。
  if (startsOnEnter && shownRef.current && status !== "authenticated" && leftRef.current === null) {
    leftRef.current = status === "anonymous" ? "login" : "home";
  }
  if (leftRef.current !== null) {
    return leftRef.current === "login" ? <Navigate to="/login" replace /> : <Navigate to="/" replace />;
  }

  switch (status) {
    case "authenticated":
      if (!verified) {
        return (
          <div className="flex h-full items-center justify-center">
            <Spinner label="ログインの状態を確かめています" />
          </div>
        );
      }
      shownRef.current = true;
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
