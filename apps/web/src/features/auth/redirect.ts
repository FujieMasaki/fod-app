/**
 * ログイン後に戻る画面。URLのsearch param（`redirect`）から来るため、許可した画面のpathとだけ
 * 文字列全体で照合し、それ以外は`/`にする（open redirect対策。TASK-007 Plan §7-4）。
 * - `/record`は戻り先にしない。録音画面は開くとすぐマイクを要求して録音を始めるため、ログインから戻った
 *   だけで（Googleから戻った直後は利用者の操作が一度もないまま）録音が始まってしまう。Homeへ戻し、利用者が
 *   マイクを押して始める（マイクは利用者の操作の後にだけ要求する。journaling §4・security.md §2）。
 *   録音の説明の段階（TASK-010）ができたら、そこへ戻す。
 * - `/processing`は録音の直後にだけ意味があるため戻り先にしない。
 */
const REDIRECT_PATHS = ["/dot", "/reflection", "/settings"] as const;

export type RedirectPath = (typeof REDIRECT_PATHS)[number] | "/";

export function safeRedirect(value: unknown): RedirectPath {
  return REDIRECT_PATHS.find((path) => path === value) ?? "/";
}
