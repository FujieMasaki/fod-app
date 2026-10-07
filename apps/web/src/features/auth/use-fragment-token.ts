import { useEffect, useState } from "react";

// 古いタブの可能性（csrf・schemaの不一致）を示すときの案内。tokenはURLから消してあるため、再読み込みではなく
// メールのリンクを開き直してもらう。
export const REOPEN_LINK_MESSAGE =
  "画面が古くなっている可能性があります。メールのリンクをもう一度開いてから、お試しください。";

// 契約のTokenOnly・PasswordReset（token: maxLength 256）
const MAX_TOKEN_LENGTH = 256;

const readToken = (): string | null => {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  return token && token.length <= MAX_TOKEN_LENGTH ? token : null;
};

/**
 * メールのリンク（確認・password再設定・ロック解除）のtokenを、URLのfragment（`#token=`）から読む。
 * fragmentはserverへ送られないが、URLに残るとタブの履歴や共有から漏れ得るため、読んだらアドレスバーとタブの
 * 履歴のentryから消す（browserの閲覧履歴には残り得るが、tokenは1回だけ使え、期限がある）。
 * tokenは画面に出さず、利用者の操作でだけserverへ送る（メールのscannerがリンクを開いただけで
 * 確定しないように。TASK-007 Plan §7-4）。
 */
export const useFragmentToken = (): string | null => {
  const [token] = useState(readToken);

  useEffect(() => {
    if (!window.location.hash) return;
    // routerが持つhistory.stateを保ったまま、URLのfragmentだけを消す。
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }, []);

  return token;
};
