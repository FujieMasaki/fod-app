import { useState, type FormEvent } from "react";
import { Navigate } from "@tanstack/react-router";

import { Button } from "@/design-system";
import { isProblem } from "@/libs/api-client/request";
import { resendConfirmation } from "../api";
import { useAuth } from "../auth-provider";
import {
  authErrorMessage,
  endReasonMessage,
  errorMessage,
  fieldErrors,
  needsReload,
  type AuthErrorReason,
} from "../messages";
import type { RedirectPath } from "../redirect";
import { AuthScreen, FormMessage, ReloadNotice, TextField, TextLink } from "./auth-layout";
import { GoogleSignInForm } from "./google-sign-in-form";

type SignInScreenProps = {
  /** ログイン後に戻る画面（safeRedirectで検証済み） */
  redirect: RedirectPath;
  /** Googleのcallbackが付けた失敗の理由（parseAuthErrorで検証済み） */
  authError?: AuthErrorReason;
};

/**
 * メールアドレス＋password、またはGoogleでログインする。
 * 自分専用端末向けで7日保たれ、共有端末では使用後にlogoutすることを示す（product.md §4「認証体験」）。
 */
export function SignInScreen({ redirect, authError }: SignInScreenProps) {
  const { status, endReason, signIn, withCsrf } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resent, setResent] = useState(false);

  // login済み（成功直後を含む）なら戻り先へ進む。
  if (status === "authenticated" || status === "deletion_in_progress") {
    return <Navigate to={redirect} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResent(false);
    try {
      await signIn({ email, password });
    } catch (caught) {
      setError(caught);
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setSubmitting(true);
    try {
      await withCsrf((csrfToken) => resendConfirmation(csrfToken, email));
      setResent(true);
      setError(null);
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  const fields = fieldErrors(error);
  const unconfirmed = isProblem(error, "email_unconfirmed");

  return (
    <AuthScreen
      title="ログイン"
      lead="自分専用の端末向けです。ログインは7日間保たれます。共有の端末では、使い終わったらログアウトしてください。"
    >
      {endReason && <FormMessage tone="info">{endReasonMessage(endReason)}</FormMessage>}
      {authError && <FormMessage tone="error">{authErrorMessage(authError)}</FormMessage>}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <TextField
          label="メールアドレス"
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fields.email}
        />
        <TextField
          label="パスワード"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fields.password}
        />
        {needsReload(error) ? (
          <ReloadNotice />
        ) : (
          error !== null && !unconfirmed && <FormMessage tone="error">{errorMessage(error)}</FormMessage>
        )}
        {unconfirmed && (
          <div className="flex flex-col gap-2">
            <FormMessage tone="error">{errorMessage(error)}</FormMessage>
            <Button variant="ghost" onClick={handleResend} disabled={submitting}>
              確認メールを送り直す
            </Button>
          </div>
        )}
        {resent && (
          <FormMessage tone="info">
            確認のメールを送りました。届いたメールのリンクから確認してから、ログインしてください。
          </FormMessage>
        )}
        <Button type="submit" fullWidth disabled={submitting || status === "checking"}>
          ログイン
        </Button>
      </form>

      <GoogleSignInForm returnTo={redirect} />

      <div className="flex flex-col items-start gap-2">
        <TextLink to="/signup">はじめての方は新規登録</TextLink>
      </div>
    </AuthScreen>
  );
}
