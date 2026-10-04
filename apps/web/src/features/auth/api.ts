import { apiRequest } from "@/libs/api-client/request";
import { sessionSchema, type Session } from "@/libs/api-contract/schemas";

/**
 * 認証の通信関数（契約のsession tag）。失敗はApiErrorで投げる。
 * 状態を変える操作はCSRF tokenが必須で、呼び出し側（AuthProvider）が最新のtokenを渡す。
 */

export type Credentials = { email: string; password: string };

export function getSession(): Promise<Session> {
  return apiRequest("/api/v1/session", { schema: sessionSchema });
}

export function createSession(csrfToken: string, credentials: Credentials): Promise<Session> {
  return apiRequest("/api/v1/session", { method: "POST", csrfToken, body: credentials, schema: sessionSchema });
}

export function deleteSession(csrfToken: string): Promise<void> {
  return apiRequest("/api/v1/session", { method: "DELETE", csrfToken });
}

export function createRegistration(csrfToken: string, credentials: Credentials): Promise<void> {
  return apiRequest("/api/v1/registration", { method: "POST", csrfToken, body: credentials });
}

export function resendConfirmation(csrfToken: string, email: string): Promise<void> {
  return apiRequest("/api/v1/confirmation", { method: "POST", csrfToken, body: { email } });
}

export function confirmEmail(csrfToken: string, token: string): Promise<void> {
  return apiRequest("/api/v1/confirmation", { method: "PATCH", csrfToken, body: { token } });
}

export function requestPasswordReset(csrfToken: string, email: string): Promise<void> {
  return apiRequest("/api/v1/password", { method: "POST", csrfToken, body: { email } });
}

export function resetPassword(csrfToken: string, token: string, password: string): Promise<void> {
  return apiRequest("/api/v1/password", { method: "PATCH", csrfToken, body: { token, password } });
}

export function unlockAccount(csrfToken: string, token: string): Promise<void> {
  return apiRequest("/api/v1/unlock", { method: "PATCH", csrfToken, body: { token } });
}
