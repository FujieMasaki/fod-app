import { useState } from "react";

import { Button } from "@/design-system";
import { isProblem } from "@/libs/api-client/request";
import { unlockAccount } from "../api";
import { useAuth } from "../auth-provider";
import { errorMessage, needsReload } from "../messages";
import { REOPEN_LINK_MESSAGE, useFragmentToken } from "../use-fragment-token";
import { AuthScreen, FormMessage, TextLink } from "./auth-layout";

const INVALID_MESSAGE =
  "このリンクは使えません。使用済みか、正しくないリンクです。直前に解除した場合は、そのままログインできます。ロックは1時間で自動でも解除されます。";

/**
 * ロック解除メールのリンク（`/unlock#token=`）。解除してもloginはしないので、ログインへ案内する
 * （契約のunlockAccount。期限切れは返さない）。
 */
export function UnlockScreen() {
  const token = useFragmentToken();
  const { withCsrf } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [unlocked, setUnlocked] = useState(false);

  async function handleUnlock() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await withCsrf((csrfToken) => unlockAccount(csrfToken, token));
      setUnlocked(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  if (unlocked) {
    return (
      <AuthScreen title="ロックを解除しました">
        <FormMessage tone="info">ログインしてください。</FormMessage>
        <TextLink to="/login">ログインへ</TextLink>
      </AuthScreen>
    );
  }

  if (!token || isProblem(error, "token_invalid")) {
    return (
      <AuthScreen title="ロックの解除">
        <FormMessage tone="error">{INVALID_MESSAGE}</FormMessage>
        <TextLink to="/login">ログインへ</TextLink>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="ロックの解除" lead="ログインの失敗が続いたため、アカウントをロックしています。">
      {needsReload(error) ? (
        <FormMessage tone="error">{REOPEN_LINK_MESSAGE}</FormMessage>
      ) : (
        error !== null && <FormMessage tone="error">{errorMessage(error)}</FormMessage>
      )}
      <Button fullWidth onClick={handleUnlock} disabled={submitting}>
        ロックを解除する
      </Button>
    </AuthScreen>
  );
}
