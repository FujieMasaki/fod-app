"use client";

import { useEffect, useState } from "react";

export type MicPermission = "granted" | "denied" | "prompt" | "unknown";

/** マイク権限の状態を監視する（UI で無理に急かさないための補助情報）。 */
export function useMicrophonePermission(): MicPermission {
  const [state, setState] = useState<MicPermission>("unknown");

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const permissions = typeof navigator !== "undefined" ? navigator.permissions : undefined;
    if (!permissions?.query) return;

    permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        status = result;
        setState(result.state as MicPermission);
        result.onchange = () => setState(result.state as MicPermission);
      })
      .catch(() => setState("unknown"));

    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  return state;
}
