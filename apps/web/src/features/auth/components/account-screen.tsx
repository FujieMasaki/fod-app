import { useState } from "react";

import { Button, Text } from "@/design-system";
import { useAuth, type SessionUser } from "../auth-provider";
import { errorMessage, needsReload } from "../messages";
import { AuthScreen, FormMessage, ReloadNotice } from "./auth-layout";
import styles from "./account-screen.module.css";

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
      <dl className={styles.details}>
        <div className={styles.detail}>
          <dt className={styles.term}>ログイン中のアカウント</dt>
          <dd className={`${styles.value} ${styles.email}`}>{user.email}</dd>
        </div>
        <div className={styles.detail}>
          <dt className={styles.term}>ログインの方法</dt>
          <dd className={styles.value}>
            {user.sign_in_methods.map((method) => METHOD_LABELS[method]).join("、")}
          </dd>
        </div>
        {expiresAt && (
          <div className={styles.detail}>
            <dt className={styles.term}>ログインの期限</dt>
            <dd className={styles.value}>{expiryFormat.format(new Date(expiresAt))}まで</dd>
          </div>
        )}
      </dl>

      <div className={styles.signOut}>
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
