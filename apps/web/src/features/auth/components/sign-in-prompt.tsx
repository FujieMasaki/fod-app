import { useAuth } from "../auth-provider";
import { TextLink } from "./auth-layout";
import styles from "./sign-in-prompt.module.css";

/** Homeで、未認証のときだけ次の操作（ログイン）を示す。録音はログインしてから始める（journaling.md §4） */
export const SignInPrompt = () => {
  const { status } = useAuth();
  if (status !== "anonymous") return null;

  return (
    <div className={styles.prompt}>
      <p className={styles.message}>話し始めるには、ログインしてください。</p>
      {/* ログイン後はHomeへ戻り、利用者がマイクを押して録音を始める（redirect.ts） */}
      <TextLink to="/login">
        ログイン・新規登録
      </TextLink>
    </div>
  );
};
