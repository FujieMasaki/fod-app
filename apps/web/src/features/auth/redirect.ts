/**
 * ログイン後に戻る画面。URLのsearch param（`redirect`）から来るため、許可した画面のpathとだけ
 * 文字列全体で照合し、それ以外は`/`にする（open redirect対策。TASK-007 Plan §7-4）。
 * - `/record`は録音前の案内へ戻す。開いても案内を出すだけで、マイクは利用者が「録音を始める」を押した後に
 *   だけ要求するため、ログインから戻った直後に（Googleから戻った直後は利用者の操作が一度もないまま）録音が
 *   始まることはない（journaling §4「録音前認証と期限切れ」・security.md §2。TASK-010）。
 * - `/processing`は録音の直後にだけ意味があるため戻り先にしない。
 * - 日の詳細（`/dots/<日付>`）は一覧（`/dots`）へ戻す。日付の検証は履歴の画面に任せ、ここではURLの値を
 *   戻り先へそのまま使わない（TASK-012）。
 */
const REDIRECT_PATHS = ["/record", "/dot", "/day", "/dots", "/reflection", "/settings"] as const;

const DAY_DETAIL_PATH = /^\/dots\/[0-9-]+$/;

export type RedirectPath = (typeof REDIRECT_PATHS)[number] | "/";

export const safeRedirect = (value: unknown): RedirectPath => {
  if (typeof value === "string" && DAY_DETAIL_PATH.test(value)) return "/dots";
  return REDIRECT_PATHS.find((path) => path === value) ?? "/";
};
