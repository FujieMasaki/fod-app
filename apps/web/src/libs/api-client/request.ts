import type { z } from "zod";

import { problemSchema, type Problem } from "@/libs/api-contract/schemas";

/**
 * 同一originのRails APIを呼ぶ入口。React stateを持たない。
 * 認証のCookieはbrowserが付ける。CSRF tokenと、失効時の扱いは呼び出し側（features/auth）が決める。
 */

/**
 * 失敗の種類。画面はこれで安全な表示を選ぶ（frontend.md §2）。
 * - problem: 契約のProblemとして読めた。`problem.code`で判定し、`title`・`detail`は表示しない
 * - network: serverへ届かなかった・応答を受け取れなかった
 * - schema: 応答が契約と合わない。古いタブの可能性があるため再読み込みを案内する
 * - http: 契約にない失敗（proxyの502など）
 */
export type ApiErrorKind = "problem" | "network" | "schema" | "http";

export type ApiError = Error & {
  readonly name: "ApiError";
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly problem?: Problem;
};

export const createApiError = (
  kind: ApiErrorKind,
  options: { status?: number; problem?: Problem } = {},
): ApiError =>
  // messageにresponseの本文を入れない（ログや画面へ出さないため）。
  Object.assign(new Error(options.problem ? `api_problem:${options.problem.code}` : `api_${kind}`), {
    name: "ApiError" as const,
    kind,
    status: options.status,
    problem: options.problem,
  });

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof Error && error.name === "ApiError" && "kind" in error;

export const isProblem = (error: unknown, ...codes: Problem["code"][]): error is ApiError & { problem: Problem } => {
  return isApiError(error) && error.problem !== undefined && codes.includes(error.problem.code);
};

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/** 送り方。成功時の本文を検証するschemaは、本文のない成功（202・204）では省く */
export type ApiRequestOptions = {
  method?: Method;
  body?: unknown;
  csrfToken?: string;
};

// schemaを渡したときだけ本文を返す（渡し忘れて`undefined`を別の型として受け取らないように）。
type ApiRequest = {
  <T>(path: string, options: ApiRequestOptions & { schema: z.ZodType<T> }): Promise<T>;
  (path: string, options?: ApiRequestOptions & { schema?: undefined }): Promise<void>;
};

export const apiRequest: ApiRequest = async <T>(
  path: string,
  options: ApiRequestOptions & { schema?: z.ZodType<T> } = {},
): Promise<T | void> => {
  const url = sameOriginUrl(path);
  const { method = "GET", body, csrfToken, schema } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      // APIはredirectしない。redirectに従うとCSRF tokenのheaderを別のoriginへ持ち越し得るため、失敗にする。
      redirect: "error",
    });
  } catch {
    throw createApiError("network");
  }

  if (!response.ok) throw await toError(response);

  if (!schema) return;
  const json = await readJson(response);
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw createApiError("schema", { status: response.status });
  return parsed.data;
};

/**
 * 同一originのpathだけを送る（CSRF tokenを外部へ送らないため）。文字列の先頭だけで判定すると、
 * `//host`・`/\\host`や、URLの解析で取り除かれるtab・改行を挟んだ形を見逃すため、URLとして解決してから
 * originを比べる。さらに、解決したpathnameが`//`で始まるものも拒否する（`/.//host`のように`.`・`..`を
 * 挟んだ形はoriginが同じまま、pathnameが`//host`になり、fetchが別のhostとして解決し直すため）。
 */
const sameOriginUrl = (path: string): string => {
  const url = new URL(path, window.location.origin);
  if (!path.startsWith("/") || url.origin !== window.location.origin || url.pathname.startsWith("//")) {
    throw new TypeError("apiRequest: same-origin path only");
  }
  return `${url.pathname}${url.search}`;
};

const toError = async (response: Response): Promise<ApiError> => {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/problem+json")) {
    return createApiError("http", { status: response.status });
  }
  const parsed = problemSchema.safeParse(await readJson(response));
  if (!parsed.success) return createApiError("schema", { status: response.status });
  return createApiError("problem", { status: response.status, problem: parsed.data });
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    // 本文を読めないことも、契約と合わない応答として扱う。
    return undefined;
  }
};
