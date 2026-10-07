import { useEffect, useState, type FormEvent } from "react";
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
import styles from "./sign-in-screen.module.css";

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
export const SignInScreen = ({ redirect, authError }: SignInScreenProps) => {
  const { status, endReason, acknowledgeEndReason, refresh, signIn, withCsrf } = useAuth();
  // 終了の理由は開いたときに1回だけ案内し、案内したら消す（古い案内が残り続けず、後の戻り先の判断も誤らないように）。
  // 開いている間に新しく理由が入った（状態を確かめ直したら未認証だった、など）ときも、取り込んでから消す。
  const [shownEndReason, setShownEndReason] = useState(endReason);
  useEffect(() => {
    if (endReason) setShownEndReason(endReason);
    acknowledgeEndReason();
  }, [endReason, acknowledgeEndReason]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resent, setResent] = useState(false);
  // 確認メールの再送は、未確認と分かったときに送ったメールアドレスへ頼む（後で入力欄を書き換えても変わらない）。
  const [submittedEmail, setSubmittedEmail] = useState("");

  // login済み（成功直後を含む）なら戻り先へ進む。
  if (status === "authenticated" || status === "deletion_in_progress") {
    return <Navigate to={redirect} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResent(false);
    setSubmittedEmail(email);
    try {
      await signIn({ email, password });
    } catch (caught) {
      setError(caught);
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setSubmitting(true);
    try {
      await withCsrf((csrfToken) => resendConfirmation(csrfToken, submittedEmail));
      setResent(true);
      setError(null);
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const fields = fieldErrors(error);
  const unconfirmed = isProblem(error, "email_unconfirmed");

  return (
    <AuthScreen
      title="ログイン"
      lead="自分専用の端末向けです。ログインは7日間保たれます。共有の端末では、使い終わったらログアウトしてください。"
    >
      {shownEndReason && <FormMessage tone="info">{endReasonMessage(shownEndReason)}</FormMessage>}
      {status === "unknown" && (
        // logoutの失敗の後などに状態を確かめられないまま開いた場合。済んでいると思わせない（RequireAuthと同じ案内）。
        <div className={styles.messageWithAction}>
          <FormMessage tone="error">
            ログインの状態を確かめられませんでした。ログアウトの途中だった場合は、まだログアウトできていない可能性があります。
          </FormMessage>
          <Button variant="ghost" onClick={() => void refresh()}>
            状態を確かめ直す
          </Button>
        </div>
      )}
      {authError && <FormMessage tone="error">{authErrorMessage(authError)}</FormMessage>}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
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
          <div className={styles.messageWithAction}>
            <FormMessage tone="error">{errorMessage(error)}</FormMessage>
            <Button variant="ghost" onClick={handleResend} disabled={submitting}>
              確認メールを送り直す
            </Button>
          </div>
        )}
        {resent && (
          <FormMessage tone="info">
            確認が済んでいない登録があれば、確認のメールを送ります。届いたメールのリンクから確認してから、ログインしてください。
          </FormMessage>
        )}
        <Button type="submit" fullWidth disabled={submitting || status === "checking"}>
          ログイン
        </Button>
      </form>

      <GoogleSignInForm returnTo={redirect} disabled={submitting} />

      <div className={styles.links}>
        <TextLink to="/signup">はじめての方は新規登録</TextLink>
        <TextLink to="/password/forgot">パスワードを忘れた場合</TextLink>
      </div>
    </AuthScreen>
  );
};
