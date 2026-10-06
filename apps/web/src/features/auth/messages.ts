import { isApiError } from "@/libs/api-client/request";
import type { Problem } from "@/libs/api-contract/schemas";
import type { EndReason } from "./auth-provider";

/**
 * 認証の画面に出す文言。serverの`title`・`detail`は出さず、`code`から決める（frontend.md §2）。
 * 登録の有無やロックの有無が分かる文言にしない（契約のcreateSession・createRegistration）。
 */

export const RELOAD_MESSAGE = "画面が古くなっている可能性があります。再読み込みしてから、もう一度お試しください。";

const GENERIC_MESSAGE = "うまくいきませんでした。時間をおいて、もう一度お試しください。";

/** 画面ごとに文言を変えたいcode（tokenの期限切れなど）は、呼び出し側が`overrides`で渡す */
export const errorMessage = (error: unknown, overrides: Partial<Record<Problem["code"], string>> = {}): string => {
  if (!isApiError(error)) return GENERIC_MESSAGE;
  if (error.kind === "network") return "通信できませんでした。接続を確かめて、もう一度お試しください。";
  if (error.kind === "schema") return RELOAD_MESSAGE;
  const problem = error.problem;
  if (!problem) return GENERIC_MESSAGE;

  const override = overrides[problem.code];
  if (override) return override;

  switch (problem.code) {
    case "rate_limited":
      return `試行が多すぎます。${Math.ceil(problem.retry_after_seconds / 60)}分ほど待ってから、もう一度お試しください。`;
    case "csrf_invalid":
      return RELOAD_MESSAGE;
    case "invalid_credentials":
      return "メールアドレスまたはパスワードが違います。";
    case "email_unconfirmed":
      return "メールアドレスの確認が済んでいません。届いたメールのリンクから確認してください。";
    case "validation_failed":
      return "入力内容を確かめてください。";
    case "token_invalid":
      return "このリンクは使えません。使用済みか、正しくないリンクです。";
    case "token_expired":
      return "このリンクの有効期限が切れています。";
    default:
      return GENERIC_MESSAGE;
  }
};

/** 再読み込みで直る失敗か（古いタブ・CSRF tokenの不一致） */
export const needsReload = (error: unknown): boolean => {
  return isApiError(error) && (error.kind === "schema" || error.problem?.code === "csrf_invalid");
};

const FIELD_MESSAGES: Record<string, string> = {
  required: "入力してください。",
  too_long: "長すぎます。",
  invalid_format: "形式が正しくありません。",
  not_allowed: "使えない値です。",
};

/** `validation_failed`の項目ごとの文言。passwordの`out_of_range`は8文字未満のとき（契約のNewCredentials） */
export const fieldErrors = (error: unknown): Record<string, string> => {
  if (!isApiError(error) || error.problem?.code !== "validation_failed") return {};
  const result: Record<string, string> = {};
  for (const { field, code } of error.problem.errors) {
    result[field] =
      code === "out_of_range" && field === "password"
        ? "8文字以上で入力してください。"
        : (FIELD_MESSAGES[code] ?? "入力内容を確かめてください。");
  }
  return result;
};

/** Googleのcallbackが付ける`auth_error`（contracts/README.md §5） */
const AUTH_ERROR_MESSAGES = {
  google_email_conflict:
    "このメールアドレスは、メールアドレスとパスワードで登録されています。メールアドレスでログインしてください。",
  google_reauthentication_mismatch: "ログイン中のアカウントとは別のGoogleアカウントが選ばれました。",
  rate_limited: "試行が多すぎます。しばらく待ってから、もう一度お試しください。",
  google_auth_failed: "ログインできませんでした。普段のログイン方法で、もう一度お試しください。",
} as const;

export type AuthErrorReason = keyof typeof AUTH_ERROR_MESSAGES;

/** 未知の値は共通の失敗として扱う（URLから来る値のため） */
export const parseAuthError = (value: unknown): AuthErrorReason | undefined => {
  if (value === undefined) return undefined;
  return typeof value === "string" && Object.hasOwn(AUTH_ERROR_MESSAGES, value)
    ? (value as AuthErrorReason)
    : "google_auth_failed";
};

export const authErrorMessage = (reason: AuthErrorReason): string => {
  return AUTH_ERROR_MESSAGES[reason];
};

export const endReasonMessage = (reason: EndReason): string => {
  switch (reason) {
    case "signed_out":
      return "ログアウトしました。";
    case "expired":
      return "ログインの期限（7日）が過ぎました。もう一度ログインしてください。";
    case "session_lost":
      return "ログインが必要です。もう一度ログインしてください。";
  }
};
