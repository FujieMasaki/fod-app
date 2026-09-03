"use client";

import { useRouter } from "next/navigation";
import { ScreenLayout } from "@/components/screen-layout/screen-layout";
import { EmptyState } from "@/components/empty-state/empty-state";
import { TodaysDotView } from "@/features/todays-dot";
import { useSession } from "@/features/session";

export default function DotPage() {
  const router = useRouter();
  const { dotSession, hydrated } = useSession();

  return (
    <ScreenLayout>
      {!hydrated ? null : dotSession ? (
        <TodaysDotView session={dotSession} />
      ) : (
        <EmptyState onAction={() => router.push("/")} />
      )}
    </ScreenLayout>
  );
}
