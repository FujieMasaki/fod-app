import { useState, type FormEvent } from "react";

import { Button } from "@/design-system";
import { isProblem } from "@/libs/api-client/request";
import { resetPassword } from "../api";
import { useAuth } from "../auth-provider";
import { errorMessage, fieldErrors, needsReload } from "../messages";
import { useFragmentToken } from "../use-fragment-token";
import { AuthScreen, FormMessage, ReloadNotice, TextField, TextLink } from "./auth-layout";

const TOKEN_MESSAGES = {
  token_invalid: "このリンクは使えません。使用済みか、正しくないリンクです。最新のメールのリンクを使うか、送り直してください。",
  token_expired: "このリンクの有効期限（6時間）が過ぎています。再設定のメールを送り直してください。",
};

/**
 * 再設定メールのリンク（`/password/reset#token=`）。成功してもloginはしないので、ログインへ案内する
 * （契約のresetPassword）。
 */
export function PasswordResetScreen() {
  const token = useFragmentToken();
  const { withCsrf, refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  // 再設定でserverは既存のCookieを無効にする。login中だった場合に古い認証済みが残らないよう、送った後は成否に
  // かかわらず取り直す（取り直しの失敗は再設定の成否に関わらないため、案内は出す）。refreshは実行中の取得を
  // 共有するため、1回目で再設定の前に始まった取得を終わらせ、2回目で再設定の後に始まる取得の結果を置く。
  async function refreshAfterReset() {
    await refresh().catch(() => undefined);
    await refresh().catch(() => undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await withCsrf((csrfToken) => resetPassword(csrfToken, token, password));
      await refreshAfterReset();
      setDone(true);
    } catch (caught) {
      // 失敗に見えても、serverでは済んでいることがある（応答だけを失った、再試行がtoken_invalidになった）。
      await refreshAfterReset();
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
