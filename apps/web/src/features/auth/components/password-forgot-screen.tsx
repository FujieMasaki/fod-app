import { useState, type FormEvent } from "react";

import { Button } from "@/design-system";
import { requestPasswordReset } from "../api";
import { useAuth } from "../auth-provider";
import { errorMessage, fieldErrors, needsReload } from "../messages";
import { AuthScreen, FormMessage, ReloadNotice, TextField, TextLink } from "./auth-layout";

/**
 * password再設定のメールを頼む。登録の有無・Google専用かどうかにかかわらず同じ受付を示す
 * （契約のrequestPasswordReset）。
 */
export const PasswordForgotScreen = () => {
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
      await withCsrf((csrfToken) => requestPasswordReset(csrfToken, email));
      setAccepted(true);
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
          該当するアカウントがある場合、パスワード再設定のメールを送りました。リンクの有効期限は6時間です。
          何度か送った場合は、最新のメールのリンクを使ってください。
        </FormMessage>
        <TextLink to="/login">ログインへ</TextLink>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="パスワードの再設定" lead="登録したメールアドレスに、再設定のリンクを送ります。">
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
          error={fieldErrors(error).email}
        />
        {needsReload(error) ? (
          <ReloadNotice />
        ) : (
          error !== null && <FormMessage tone="error">{errorMessage(error)}</FormMessage>
        )}
        <Button type="submit" fullWidth disabled={submitting}>
          再設定のメールを送る
        </Button>
      </form>
      <TextLink to="/login">ログインへ戻る</TextLink>
    </AuthScreen>
  );
};
