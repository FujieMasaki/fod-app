/**
 * ログイン後に戻る画面。URLのsearch param（`redirect`）から来るため、許可した画面のpathとだけ
 * 文字列全体で照合し、それ以外は`/`にする（open redirect対策。TASK-007 Plan §7-4）。
 * - `/record`は戻り先にしない。録音画面は開くとすぐマイクを要求して録音を始めるため、ログインから戻った
 *   だけで（Googleから戻った直後は利用者の操作が一度もないまま）録音が始まってしまう。Homeへ戻し、利用者が
 *   マイクを押して始める（マイクは利用者の操作の後にだけ要求する。journaling §4・security.md §2）。
 *   録音の説明の段階（TASK-010）ができたら、そこへ戻す。
 * - `/processing`は録音の直後にだけ意味があるため戻り先にしない。
 * - 日の詳細（`/dots/<日付>`）は一覧（`/dots`）へ戻す。日付の検証は履歴の画面に任せ、ここではURLの値を
 *   戻り先へそのまま使わない（TASK-012）。
 */
const REDIRECT_PATHS = ["/dot", "/day", "/dots", "/reflection", "/settings"] as const;

const DAY_DETAIL_PATH = /^\/dots\/[0-9-]+$/;

export type RedirectPath = (typeof REDIRECT_PATHS)[number] | "/";

export const safeRedirect = (value: unknown): RedirectPath => {
  if (typeof value === "string" && DAY_DETAIL_PATH.test(value)) return "/dots";
  return REDIRECT_PATHS.find((path) => path === value) ?? "/";
};
