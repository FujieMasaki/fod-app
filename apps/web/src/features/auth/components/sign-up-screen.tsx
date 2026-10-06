import { useState, type FormEvent } from "react";

import { Button } from "@/design-system";
import { createRegistration } from "../api";
import { useAuth } from "../auth-provider";
import { errorMessage, fieldErrors, needsReload } from "../messages";
import { AuthScreen, FormMessage, ReloadNotice, TextField, TextLink } from "./auth-layout";

/**
 * メールアドレス＋passwordで登録する。登録済みかどうかにかかわらず同じ受付を示す
 * （契約のcreateRegistration。登録済みならログイン方法の案内メールが届く）。
 */
export const SignUpScreen = () => {
  const { withCsrf } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [accepted, setAccepted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await withCsrf((csrfToken) => createRegistration(csrfToken, { email, password }));
      setAccepted(true);
      setPassword("");
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  if (accepted) {
    return (
      <AuthScreen title="メールを送りました">
        <FormMessage tone="info">
          入力したメールアドレス宛てに、手続きのメールを送りました。メールのリンクから確認を済ませてから、
          ログインしてください。リンクはメールに書かれた期限まで使えます（最初に送ってから24時間で、送り直しても延びません）。すでに登録済みの場合は、ログイン方法の案内が届きます。
        </FormMessage>
        <TextLink to="/login">ログインへ</TextLink>
      </AuthScreen>
    );
  }

  const fields = fieldErrors(error);
  // 項目の横に出せない失敗（項目ごとでない失敗と、emailとpassword以外の項目）は、共通の文言で示す
  const fieldNames = Object.keys(fields);
  const showGeneralError =
    error !== null && (fieldNames.length === 0 || fieldNames.some((field) => field !== "email" && field !== "password"));

  return (
    <AuthScreen title="新規登録" lead="登録したメールアドレスに確認のメールを送ります。">
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
          showGeneralError && <FormMessage tone="error">{errorMessage(error)}</FormMessage>
        )}
        <Button type="submit" fullWidth disabled={submitting}>
          登録する
        </Button>
      </form>
      <TextLink to="/login">登録済みの方はログイン</TextLink>
    </AuthScreen>
  );
};
