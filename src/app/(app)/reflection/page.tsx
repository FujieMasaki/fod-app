"use client";

import { useRouter } from "next/navigation";
import { ScreenLayout } from "@/components/screen-layout/screen-layout";
import { AppHeader } from "@/components/app-header/app-header";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ReflectionLetter } from "@/features/reflection";
import { useSession } from "@/features/session";

export default function ReflectionPage() {
  const router = useRouter();
  const { dotSession, hydrated } = useSession();

  return (
    <ScreenLayout
      activeTab="reflection"
      header={<AppHeader title="今日の振り返り" showBack />}
    >
      {!hydrated ? null : dotSession ? (
        <ReflectionLetter session={dotSession} />
      ) : (
        <EmptyState onAction={() => router.push("/")} />
      )}
    </ScreenLayout>
  );
}
