import { describe, expect, it } from "vitest";

import { createApiError } from "@/libs/api-client/request";
import type { Problem } from "@/libs/api-contract/schemas";
import { authErrorMessage, errorMessage, fieldErrors, needsReload, parseAuthError } from "./messages";
import { safeRedirect } from "./redirect";

const problemError = (problem: Problem) => {
  return createApiError("problem", { status: problem.status, problem });
};

const base = { type: "x", title: "serverの文言", detail: "serverの詳細" };

describe("errorMessage", () => {
  it("serverのtitle・detailを出さず、codeから文言を決める", () => {
    const message = errorMessage(problemError({ ...base, status: 401, code: "invalid_credentials" }));
    expect(message).toBe("メールアドレスまたはパスワードが違います。");
    expect(message).not.toContain("server");
  });

  it("rate_limitedは待つ時間を分で示す", () => {
    const error = problemError({ ...base, status: 429, code: "rate_limited", retry_after_seconds: 61 });
    expect(errorMessage(error)).toContain("2分ほど");
  });

  it("画面ごとの文言で上書きできる", () => {
    const error = problemError({ ...base, status: 422, code: "token_expired" });
    expect(errorMessage(error, { token_expired: "期限切れ" })).toBe("期限切れ");
  });

  it("古いタブの可能性があれば再読み込みを案内する", () => {
    expect(needsReload(createApiError("schema"))).toBe(true);
    expect(needsReload(problemError({ ...base, status: 403, code: "csrf_invalid" }))).toBe(true);
    expect(needsReload(createApiError("network"))).toBe(false);
  });
});

describe("fieldErrors", () => {
  it("passwordが短いときは8文字以上を案内する", () => {
    const error = problemError({
      ...base,
      status: 422,
      code: "validation_failed",
      errors: [
        { field: "password", code: "out_of_range" },
        { field: "email", code: "invalid_format" },
      ],
    });
    expect(fieldErrors(error)).toEqual({ password: "8文字以上で入力してください。", email: "形式が正しくありません。" });
  });
});

describe("auth_error", () => {
  it("既知の理由はそのまま、未知の値は共通の失敗にする", () => {
    expect(parseAuthError("google_email_conflict")).toBe("google_email_conflict");
    expect(parseAuthError("<script>")).toBe("google_auth_failed");
    expect(parseAuthError("toString")).toBe("google_auth_failed");
    expect(parseAuthError(undefined)).toBeUndefined();
    expect(authErrorMessage("google_email_conflict")).toContain("メールアドレスでログイン");
  });
});

describe("safeRedirect", () => {
  it("許可した画面だけを戻り先にし、それ以外は/にする", () => {
    expect(safeRedirect("/dot")).toBe("/dot");
    expect(safeRedirect("/day")).toBe("/day");
    expect(safeRedirect("/dots")).toBe("/dots");
    // 日の詳細は一覧へ戻す（URLの日付を戻り先へそのまま使わない）
    expect(safeRedirect("/dots/2026-09-28")).toBe("/dots");
    expect(safeRedirect("/dots/2026-09-28/x")).toBe("/");
    expect(safeRedirect("/dots/2026-09-28\n")).toBe("/");
    // 録音画面は開くとすぐ録音を始めるため、ログインの後に自動で戻さない
    expect(safeRedirect("/record")).toBe("/");
    expect(safeRedirect("/processing")).toBe("/");
    expect(safeRedirect("//evil.example")).toBe("/");
    expect(safeRedirect("https://evil.example/dot")).toBe("/");
    expect(safeRedirect("/dot\n")).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
  });
});
