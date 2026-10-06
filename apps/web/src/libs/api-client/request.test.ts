import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";

import { apiRequest, createApiError, isApiError, isProblem, type ApiError } from "./request";

// fetchを差し替え、Rails APIの応答（契約の形）を模す。実serverには接続しない。
const mockFetch = (response: Response | Error) => {
  const fetchMock = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const problemResponse = (status: number, body: unknown) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("同一originのCookieとCSRF tokenを付け、cacheしない", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));

    await apiRequest("/api/v1/session", { method: "DELETE", csrfToken: "token-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/session",
      expect.objectContaining({
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: expect.objectContaining({ "X-CSRF-Token": "token-1" }),
      }),
    );
  });

  it("bodyをJSONで送る", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 202 }));

    await apiRequest("/api/v1/registration", { method: "POST", body: { email: "a@example.com" } });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBe('{"email":"a@example.com"}');
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("成功の本文をschemaで検証して返す", async () => {
    mockFetch(Response.json({ value: 1 }));

    await expect(apiRequest("/x", { schema: z.object({ value: z.number() }) })).resolves.toEqual({ value: 1 });
  });

  it("成功でも契約と合わない本文はschemaの失敗にする", async () => {
    mockFetch(Response.json({ value: "1" }));

    const error = await apiRequest("/x", { schema: z.object({ value: z.number() }) }).catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect((error as ApiError).kind).toBe("schema");
  });

  it("契約のProblemはcodeで判定できる", async () => {
    mockFetch(
      problemResponse(401, {
        type: "urn:focus-on-dot:problem:session_expired",
        title: "x",
        status: 401,
        code: "session_expired",
      }),
    );

    const error = await apiRequest("/x").catch((e: unknown) => e);
    expect(isProblem(error, "session_expired")).toBe(true);
    expect(isProblem(error, "unauthenticated")).toBe(false);
  });

  it("未知のcodeのProblemはschemaの失敗にする（古いタブの可能性）", async () => {
    mockFetch(problemResponse(400, { type: "x", title: "x", status: 400, code: "brand_new_code" }));

    const error = await apiRequest("/x").catch((e: unknown) => e);
    expect((error as ApiError).kind).toBe("schema");
  });

  it("problem+jsonでない失敗はhttpにする", async () => {
    mockFetch(new Response("Bad Gateway", { status: 502, headers: { "Content-Type": "text/html" } }));

    const error = await apiRequest("/x").catch((e: unknown) => e);
    expect((error as ApiError).kind).toBe("http");
    expect((error as ApiError).status).toBe(502);
  });

  it("同一originのpath以外は送らない", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));

    await expect(apiRequest("https://evil.example/x", { csrfToken: "t" })).rejects.toThrow(TypeError);
    await expect(apiRequest("//evil.example/x", { csrfToken: "t" })).rejects.toThrow(TypeError);
    await expect(apiRequest("/\\evil.example/x", { csrfToken: "t" })).rejects.toThrow(TypeError);
    await expect(apiRequest("/\t/evil.example/x", { csrfToken: "t" })).rejects.toThrow(TypeError);
    await expect(apiRequest("/\n/evil.example/x", { csrfToken: "t" })).rejects.toThrow(TypeError);
    // `.`・`..`を挟むと、originは同じままpathnameが`//evil.example/x`になる
    await expect(apiRequest("/.//evil.example/x", { csrfToken: "t" })).rejects.toThrow(TypeError);
    await expect(apiRequest("/..//evil.example/x", { csrfToken: "t" })).rejects.toThrow(TypeError);
    await expect(apiRequest("/a/..//evil.example/x", { csrfToken: "t" })).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("届かなければnetworkにし、messageに応答の内容を入れない", async () => {
    mockFetch(new TypeError("Failed to fetch"));

    const error = await apiRequest("/x").catch((e: unknown) => e);
    expect((error as ApiError).kind).toBe("network");
    expect((error as ApiError).message).toBe("api_network");
  });
});

describe("isApiError", () => {
  it("createApiErrorで作った失敗だけを通し、ほかのErrorは通さない", () => {
    const error = createApiError("problem", {
      status: 422,
      problem: { type: "x", title: "x", status: 422, code: "token_invalid" },
    });
    expect(isApiError(error)).toBe(true);
    expect(error).toBeInstanceOf(Error);
    // messageにresponseの本文（title・detail）を入れない
    expect(error.message).toBe("api_problem:token_invalid");
    expect(isApiError(new Error("api_network"))).toBe(false);
    expect(isApiError(Object.assign(new Error("x"), { name: "ApiError" }))).toBe(false);
    // 名前と形を似せても、createApiErrorで作っていなければ通さない
    expect(isApiError(Object.assign(new Error("api_network"), { name: "ApiError", kind: "network" }))).toBe(false);
    expect(isApiError({ name: "ApiError", kind: "network" })).toBe(false);
  });
});

describe("apiRequestの型", () => {
  // 呼び出しの型だけを確かめる（実行はしない）。型検査（tsc）で失敗する。
  it("schemaを渡したときだけ本文の型を返し、渡さないときは本文を返さない", () => {
    const typeOnly = async () => {
      const schema = z.object({ id: z.string() });
      expectTypeOf(apiRequest("/api/v1/session", { schema })).toEqualTypeOf<Promise<{ id: string }>>();
      expectTypeOf(apiRequest("/api/v1/session")).toEqualTypeOf<Promise<void>>();
      // @ts-expect-error schemaを渡さない結果は、本文として使えない
      const body: { id: string } = await apiRequest("/api/v1/session");
      return body;
    };
    expect(typeof typeOnly).toBe("function");
  });
});
