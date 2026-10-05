import { useAuth } from "../auth-provider";
import { TextLink } from "./auth-layout";

/** Homeで、未認証のときだけ次の操作（ログイン）を示す。録音はログインしてから始める（journaling.md §4） */
export function SignInPrompt() {
  const { status } = useAuth();
  if (status !== "anonymous") return null;

  return (
    <div className="flex flex-col items-center gap-1 pb-6 text-center">
      <p className="text-small leading-small text-ink-secondary">話し始めるには、ログインしてください。</p>
      {/* ログイン後はHomeへ戻り、利用者がマイクを押して録音を始める（redirect.ts） */}
      <TextLink to="/login">
        ログイン・新規登録
      </TextLink>
    </div>
  );
}
