import { useState } from "react";

import { Button, Text } from "@/design-system";
import { useAuth, type SessionUser } from "../auth-provider";
import { errorMessage, needsReload } from "../messages";
import { AuthScreen, FormMessage, ReloadNotice } from "./auth-layout";

const METHOD_LABELS: Record<SessionUser["sign_in_methods"][number], string> = {
  password: "メールアドレスとパスワード",
  google: "Google",
};

const expiryFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * login中の利用者・ログインが保たれる期限・logout。RequireAuthの内側で使う。
 * 期限は案内用で、実際の判断はserverが行う（TASK-001 Plan §51）。
 */
export const AccountScreen = () => {
  const { user, expiresAt, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (caught) {
      setError(caught);
      setSigningOut(false);
    }
  };

  if (!user) return null;

  return (
    <AuthScreen title="アカウント">
      <dl className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-small leading-small text-ink-tertiary">ログイン中のアカウント</dt>
          <dd className="text-body leading-body text-ink break-all">{user.email}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-small leading-small text-ink-tertiary">ログインの方法</dt>
          <dd className="text-body leading-body text-ink">
            {user.sign_in_methods.map((method) => METHOD_LABELS[method]).join("、")}
          </dd>
        </div>
        {expiresAt && (
          <div className="flex flex-col gap-1">
            <dt className="text-small leading-small text-ink-tertiary">ログインの期限</dt>
            <dd className="text-body leading-body text-ink">{expiryFormat.format(new Date(expiresAt))}まで</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-col gap-3">
        <Text variant="small" tone="secondary">
          共有の端末では、使い終わったらログアウトしてください。ほかの端末のログインは、それぞれの期限まで続きます。
        </Text>
        {error !== null &&
          (needsReload(error) ? (
            <ReloadNotice />
          ) : (
            <FormMessage tone="error">
              ログアウトできたか確かめられませんでした。{errorMessage(error)}
            </FormMessage>
          ))}
        <Button variant="secondary" fullWidth onClick={handleSignOut} disabled={signingOut}>
          ログアウト
        </Button>
      </div>
    </AuthScreen>
  );
};
