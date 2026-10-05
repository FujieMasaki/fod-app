import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/design-system";
import { ApiError, isProblem } from "@/libs/api-client/request";
import type { Session } from "@/libs/api-contract/schemas";
import { resetPassword } from "../api";
import { SESSION_QUERY_KEY, useAuth } from "../auth-provider";
import { errorMessage, fieldErrors, needsReload } from "../messages";
import { useFragmentToken } from "../use-fragment-token";
import { AuthScreen, FormMessage, ReloadNotice, TextField, TextLink } from "./auth-layout";

const TOKEN_MESSAGES = {
  token_invalid: "このリンクは使えません。使用済みか、正しくないリンクです。最新のメールのリンクを使うか、送り直してください。",
  token_expired: "このリンクの有効期限（6時間）が過ぎています。再設定のメールを送り直してください。",
};

// 再設定が行われなかったと分かる失敗。これ以外の失敗（通信・serverのerror・再試行のtoken_invalid）は、serverで
// 済んでいる（応答だけを失った）ことがある。
const NOT_APPLIED_CODES = ["validation_failed", "token_expired", "rate_limited", "csrf_invalid"] as const;

function mayHaveReset(error: unknown): boolean {
  // 利用者が切り替わっていて送らなかった（withCsrfの`identity_changed`）
  if (error instanceof Error && !(error instanceof ApiError) && error.message === "identity_changed") return false;
  return !isProblem(error, ...NOT_APPLIED_CODES);
}

/**
 * 再設定メールのリンク（`/password/reset#token=`）。成功してもloginはしないので、ログインへ案内する
 * （契約のresetPassword）。
 */
export function PasswordResetScreen() {
  const token = useFragmentToken();
  const { withCsrf, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  // 再設定でserverは既存のCookieを無効にする。login中だった場合に古い認証済みが残らないよう、再設定が済んだ
  // かもしれないとき（成功・応答を失った・再試行がtoken_invalid）は、通信を待たずにその場で未認証として置き、
  // 個人データを消す（取り直しが返らない・offlineで止まっても、完了の案内と入力の消去を止めない）。
  // その後の取り直しはbackgroundで行う。再設定の前に始まった取得が後から前の利用者の認証済みを返したら、
  // 無効になったCookieの古い結果なので、もう一度未認証として置いてから取り直す。
  function endSessionAfterReset() {
    const current = queryClient.getQueryData<Session>(SESSION_QUERY_KEY);
    if (!current?.authenticated) return;
    const endedUserId = current.user.id;
    const setAnonymous = (csrfToken: string) =>
      queryClient.setQueryData<Session>(SESSION_QUERY_KEY, { authenticated: false, csrf_token: csrfToken });
    setAnonymous(current.csrf_token);
    void (async () => {
      await refresh().catch(() => undefined);
      const after = queryClient.getQueryData<Session>(SESSION_QUERY_KEY);
      if (after?.authenticated && after.user.id === endedUserId) {
        setAnonymous(after.csrf_token);
        await refresh().catch(() => undefined);
      }
    })();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await withCsrf((csrfToken) => resetPassword(csrfToken, token, password));
      endSessionAfterReset();
      setDone(true);
    } catch (caught) {
      // 失敗に見えても、serverでは済んでいることがある（応答だけを失った、再試行がtoken_invalidになった）。
      if (mayHaveReset(caught)) endSessionAfterReset();
      setError(caught);
    } finally {
      setSubmitting(false);
      setPassword("");
    }
  }

  if (done) {
    return (
      <AuthScreen title="パスワードを再設定しました">
        <FormMessage tone="info">新しいパスワードでログインしてください。</FormMessage>
        <TextLink to="/login">ログインへ</TextLink>
      </AuthScreen>
    );
  }

  if (!token || isProblem(error, "token_invalid", "token_expired")) {
    return (
      <AuthScreen title="パスワードの再設定">
        <FormMessage tone="error">
          {token ? errorMessage(error, TOKEN_MESSAGES) : "リンクが正しくありません。メールのリンクを開き直してください。"}
        </FormMessage>
        <TextLink to="/password/forgot">再設定のメールを送り直す</TextLink>
      </AuthScreen>
    );
  }

  const fields = fieldErrors(error);

  return (
    <AuthScreen title="新しいパスワード">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <TextField
          label="新しいパスワード"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="8文字以上（文字の種類は問いません）"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fields.password}
        />
        {needsReload(error) ? (
          <ReloadNotice />
        ) : (error instanceof ApiError && (error.kind === "network" || error.kind === "http")) ||
          isProblem(error, "internal_error") ? (
          // 応答を失っただけで、再設定は済んでいることがある。送り直すとtokenが使用済みになるため、先にログインを示す。
          <div className="flex flex-col gap-2">
            <FormMessage tone="error">
              再設定できたか確かめられませんでした。済んでいることがあるため、まず新しいパスワードでログインできるか
              お試しください。ログインできなければ、もう一度再設定してください。
            </FormMessage>
            <TextLink to="/login">ログインへ</TextLink>
          </div>
        ) : (
          error !== null && !fields.password && <FormMessage tone="error">{errorMessage(error)}</FormMessage>
        )}
        <Button type="submit" fullWidth disabled={submitting}>
          再設定する
        </Button>
      </form>
    </AuthScreen>
  );
}
