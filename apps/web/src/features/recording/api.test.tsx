import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AuthProvider, isApiError, isProblem, useAuth } from "@/features/auth";
import { createRecordingAttempt } from "./api";

// Rails APIの応答（契約の形）をfetchの差し替えで模す。`METHOD path`ごとの応答。送ったheaderも記録する。
type Reply = { status: number; body?: unknown };

const signedIn = {
  status: 200,
  body: {
    authenticated: true,
    csrf_token: "t1",
    expires_at: "2026-10-12T03:00:00Z",
    account_status: "active",
    user: {
      id: "0f8e6a8c-3d0e-4b8e-9a51-5b2d7a1c9e10",
      email: "user@example.com",
      email_confirmed: true,
      sign_in_methods: ["password"],
    },
  },
};

const attempt = {
  id: "6b1f0c2e-7a4d-4c1b-8e2f-3a9d5c7b1e04",
  attempt_token: "eyJfcmFpbHMiOnsiZGF0YSI6ImV4YW1wbGUifX0=--example",
  started_at: "2026-09-28T13:04:05Z",
  expires_at: "2026-09-28T15:04:05Z",
};

const mockApi = (routes: Record<string, Reply>) => {
  const sent: { key: string; headers: Record<string, string>; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${path}`;
      sent.push({ key, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body });
      const reply = routes[key];
      if (!reply) throw new Error(`unexpected request: ${key}`);
      const type = reply.status >= 400 ? "application/problem+json" : "application/json";
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": type } });
    }),
  );
  return sent;
};

const renderAuth = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe("authenticated"));
  return result.current;
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("createRecordingAttempt", () => {
  it("CSRF tokenを付けて本文なしで発行を求め、契約の形のattemptを返す。storageへは書かない", async () => {
    const sent = mockApi({
      "GET /api/v1/session": signedIn,
      "POST /api/v1/recording_attempts": { status: 201, body: attempt },
    });
    const auth = await renderAuth();

    await expect(createRecordingAttempt(auth.request)).resolves.toEqual(attempt);

    const post = sent.find((s) => s.key === "POST /api/v1/recording_attempts");
    expect(post?.headers["X-CSRF-Token"]).toBe("t1");
    expect(post?.body).toBeUndefined();
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("契約と合わない応答はschemaの失敗にする", async () => {
    mockApi({
      "GET /api/v1/session": signedIn,
      "POST /api/v1/recording_attempts": { status: 201, body: { ...attempt, started_at: "2026-09-28 13:04:05" } },
    });
    const auth = await renderAuth();

    const error = await createRecordingAttempt(auth.request).catch((e: unknown) => e);

    expect(isApiError(error) && error.kind).toBe("schema");
  });

  it("発行できなかったら、codeで判定できる失敗を投げる（退会の手続き中など）", async () => {
    mockApi({
      "GET /api/v1/session": signedIn,
      "POST /api/v1/recording_attempts": {
        status: 409,
        body: {
          type: "urn:focus-on-dot:problem:account_deletion_in_progress",
          title: "x",
          status: 409,
          code: "account_deletion_in_progress",
        },
      },
    });
    const auth = await renderAuth();

    const error = await createRecordingAttempt(auth.request).catch((e: unknown) => e);

    expect(isProblem(error, "account_deletion_in_progress")).toBe(true);
  });
});
