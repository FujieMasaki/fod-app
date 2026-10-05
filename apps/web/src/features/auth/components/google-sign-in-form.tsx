import type { FormEvent } from "react";

import { Button } from "@/design-system";
import { useAuth } from "../auth-provider";
import type { RedirectPath } from "../redirect";

/**
 * Googleログインの開始（契約のstartGoogleAuth）。JSON APIではなく通常のform POSTで送り、
 * browserがGoogleへ遷移する。CSRF tokenは`authenticity_token`に入れる。
 * 戻ってきたときはページの読み込み直しになり前後の利用者を比べられないため、送る前に前の利用者の
 * 個人データを消す（TASK-007 Plan §7-2）。
 */
export function GoogleSignInForm({ returnTo, disabled = false }: { returnTo: RedirectPath; disabled?: boolean }) {
  const { csrfToken, prepareExternalSignIn } = useAuth();
  // メールでのloginなどを送っている間は送らない。応答の途中でCookieが新しくなると、formのtokenが古いまま
  // になり、Railsが403のJSONを返して画面がそのJSONへ移ってしまうため。
  const blocked = disabled || !csrfToken;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (blocked) {
      event.preventDefault();
      return;
    }
    prepareExternalSignIn();
  }

  return (
    <form method="post" action="/auth/google_oauth2" onSubmit={handleSubmit}>
      <input type="hidden" name="authenticity_token" value={csrfToken ?? ""} />
      <input type="hidden" name="intent" value="sign_in" />
      <input type="hidden" name="return_to" value={returnTo} />
      <Button type="submit" variant="secondary" fullWidth disabled={blocked}>
        Googleでログイン
      </Button>
    </form>
  );
}
