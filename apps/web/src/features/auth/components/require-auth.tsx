import type { ReactNode } from "react";
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
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, endReason, refresh } = useAuth();
  const { pathname } = useLocation();

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
