import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, apiRequest, isProblem } from "./request";

// fetchを差し替え、Rails APIの応答（契約の形）を模す。実serverには接続しない。
function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function problemResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

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
    expect(error).toBeInstanceOf(ApiError);
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("届かなければnetworkにし、messageに応答の内容を入れない", async () => {
    mockFetch(new TypeError("Failed to fetch"));

    const error = await apiRequest("/x").catch((e: unknown) => e);
    expect((error as ApiError).kind).toBe("network");
    expect((error as ApiError).message).toBe("api_network");
  });
});
