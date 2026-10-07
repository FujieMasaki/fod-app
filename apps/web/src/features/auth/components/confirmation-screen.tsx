import { useState, type FormEvent } from "react";

import { Button } from "@/design-system";
import { isProblem } from "@/libs/api-client/request";
import { confirmEmail, resendConfirmation } from "../api";
import { useAuth } from "../auth-provider";
import { errorMessage, fieldErrors, needsReload } from "../messages";
import { REOPEN_LINK_MESSAGE, useFragmentToken } from "../use-fragment-token";
import { AuthScreen, FormMessage, ReloadNotice, TextField, TextLink } from "./auth-layout";
import styles from "./confirmation-screen.module.css";

const TOKEN_MESSAGES = {
  token_invalid: "このリンクは使えません。使用済みか、正しくないリンクです。確認が済んでいれば、そのままログインできます。",
  token_expired: "このリンクの有効期限（24時間）が過ぎています。確認のメールを送り直してください。",
};

/**
 * 確認メールのリンク（`/confirmation#token=`）。確認してもloginはしないので、ログインへ案内する
 * （契約のconfirmEmail）。リンクが使えなければ、確認メールの再送を出す。
 */
export const ConfirmationScreen = () => {
  const token = useFragmentToken();
  const { withCsrf } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await withCsrf((csrfToken) => confirmEmail(csrfToken, token));
      setConfirmed(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmed) {
    return (
      <AuthScreen title="メールアドレスを確認しました">
        <FormMessage tone="info">ログインしてください。</FormMessage>
        <TextLink to="/login">ログインへ</TextLink>
      </AuthScreen>
    );
  }

  const tokenRejected = isProblem(error, "token_invalid", "token_expired");

  if (!token || tokenRejected) {
    return (
      <AuthScreen title="確認のメールを送り直す">
        {tokenRejected ? (
          <FormMessage tone="error">{errorMessage(error, TOKEN_MESSAGES)}</FormMessage>
        ) : (
          <FormMessage tone="error">
            リンクが正しくありません。メールのリンクをもう一度開くか、確認のメールを送り直してください。
          </FormMessage>
        )}
        <ResendConfirmationForm />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="メールアドレスの確認" lead="ボタンを押すと、このメールアドレスの確認が済みます。">
      {needsReload(error) ? (
        <FormMessage tone="error">{REOPEN_LINK_MESSAGE}</FormMessage>
      ) : (
        error !== null && <FormMessage tone="error">{errorMessage(error)}</FormMessage>
      )}
      <Button fullWidth onClick={handleConfirm} disabled={submitting}>
        メールアドレスを確認する
      </Button>
    </AuthScreen>
  );
};

/** 登録の有無にかかわらず同じ受付を示す（契約のresendConfirmation） */
const ResendConfirmationForm = () => {
  const { withCsrf } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [accepted, setAccepted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await withCsrf((csrfToken) => resendConfirmation(csrfToken, email));
      setAccepted(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  if (accepted) {
    return (
      <FormMessage tone="info">
        該当するアカウントがある場合、確認のメールを送りました。メールのリンクから確認してください。
      </FormMessage>
    );
  }

  return (
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
        error={fieldErrors(error).email}
      />
      {needsReload(error) ? (
        <ReloadNotice />
      ) : (
        error !== null && <FormMessage tone="error">{errorMessage(error)}</FormMessage>
      )}
      <Button type="submit" fullWidth disabled={submitting}>
        確認のメールを送る
      </Button>
    </form>
  );
};
