/**
 * ログイン後に戻る画面。URLのsearch param（`redirect`）から来るため、許可した画面のpathとだけ
 * 文字列全体で照合し、それ以外は`/`にする（open redirect対策。TASK-007 Plan §7-4）。
 * `/processing`は録音の直後にだけ意味があるため戻り先にしない。
 */
const REDIRECT_PATHS = ["/record", "/dot", "/reflection", "/settings"] as const;

export type RedirectPath = (typeof REDIRECT_PATHS)[number] | "/";

export function safeRedirect(value: unknown): RedirectPath {
  return REDIRECT_PATHS.find((path) => path === value) ?? "/";
}
