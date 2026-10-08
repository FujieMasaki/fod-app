import type { useAuth } from "@/features/auth";
import { recordingAttemptSchema, type RecordingAttempt } from "@/libs/api-contract/schemas";

/**
 * 録音の通信関数（契約のgeneration tagのうち録音開始）。失敗はApiErrorで投げる。
 * 認証のCookie・CSRF・`401`の扱いをAuth Providerに集めるため、`useAuth().request`を受け取って呼ぶ（frontend.md §2）。
 */

type AuthorizedRequest = ReturnType<typeof useAuth>["request"];

/**
 * 録音attemptを発行する。serverが受理した時刻が`started_at`になる。マイクを開いた後、録音を始める直前に呼び、
 * 成功した直後に録音を始める（TASK-010 Plan §7-2）。返り値はmemoryにだけ置き、storageへ書かない。
 * 録り直し・画面を離れる・利用者が切り替わったら捨て、別の録音に使わない。
 */
export const createRecordingAttempt = (request: AuthorizedRequest): Promise<RecordingAttempt> => {
  return request("/api/v1/recording_attempts", { method: "POST", schema: recordingAttemptSchema });
};
