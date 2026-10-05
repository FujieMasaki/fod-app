import { useState, type FormEvent } from "react";

import { Button } from "@/design-system";
import { ApiError, isProblem } from "@/libs/api-client/request";
import { resetPassword } from "../api";
import { useAuth } from "../auth-provider";
import { errorMessage, fieldErrors, needsReload } from "../messages";
import { REOPEN_LINK_MESSAGE, useFragmentToken } from "../use-fragment-token";
import { AuthScreen, FormMessage, TextField, TextLink } from "./auth-layout";

const TOKEN_MESSAGES = {
  token_invalid:
    "このリンクは使えません。使用済みか、正しくないリンクです。直前に再設定した場合は、新しいパスワードでログインできます。そうでなければ、最新のメールのリンクを使うか、送り直してください。",
  token_expired: "このリンクの有効期限（6時間）が過ぎています。再設定のメールを送り直してください。",
};

// 再設定が行われなかったと分かる失敗。これ以外の失敗（通信・serverのerror・再試行のtoken_invalid）は、serverで
// 済んでいる（応答だけを失った）ことがある。
const NOT_APPLIED_CODES = ["validation_failed", "token_expired", "rate_limited", "csrf_invalid"] as const;

// 再設定が済んだか分からない失敗（応答を失った・serverのerror・失敗の応答の形が契約と合わない）。
function outcomeUnknown(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.kind === "network" || error.kind === "http" || error.kind === "schema" || isProblem(error, "internal_error"))
  );
}

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
  const { withCsrf, endSessionAfterCredentialChange } = useAuth();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await withCsrf((csrfToken) => resetPassword(csrfToken, token, password));
      // 再設定でserverは既存のCookieを無効にする。login中だった場合に古い認証済みを残さない。
      endSessionAfterCredentialChange();
      setDone(true);
    } catch (caught) {
      // 失敗に見えても、serverでは済んでいることがある（応答だけを失った、再試行がtoken_invalidになった）。
      if (mayHaveReset(caught)) endSessionAfterCredentialChange();
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
        <div className="flex flex-col items-start gap-2">
          {token && <TextLink to="/login">ログインへ</TextLink>}
          <TextLink to="/password/forgot">再設定のメールを送り直す</TextLink>
        </div>
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
        {outcomeUnknown(error) ? (
          // 応答を失っただけで、再設定は済んでいることがある。送り直すとtokenが使用済みになるため、先にログインを示す。
          <div className="flex flex-col gap-2">
            <FormMessage tone="error">
              再設定できたか確かめられませんでした。済んでいることがあるため、まず新しいパスワードでログインできるか
              お試しください。ログインできなければ、もう一度再設定してください。
            </FormMessage>
            <TextLink to="/login">ログインへ</TextLink>
          </div>
        ) : needsReload(error) ? (
          // 古いタブの可能性。tokenはURLから消してあるため、再読み込みではなくメールのリンクを開き直す。
          <FormMessage tone="error">{REOPEN_LINK_MESSAGE}</FormMessage>
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
