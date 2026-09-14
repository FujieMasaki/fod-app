import { createRootRoute, createRoute, createRouter, useNavigate } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header/app-header";
import { AppShell } from "@/components/app-shell/app-shell";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ScreenLayout } from "@/components/screen-layout/screen-layout";
import { HomeHero } from "@/features/home";
import { ProcessingIndicator } from "@/features/processing";
import { RecordingStage } from "@/features/recording";
import { ReflectionLetter } from "@/features/reflection";
import { useSession } from "@/features/session";
import { TodaysDotView } from "@/features/todays-dot";
import { Providers } from "@/providers";

function RootComponent() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}

function HomePage() {
  return (
    <ScreenLayout activeTab="home">
      <HomeHero />
    </ScreenLayout>
  );
}

function RecordPage() {
  return (
    <ScreenLayout>
      <RecordingStage />
    </ScreenLayout>
  );
}

function ProcessingPage() {
  return (
    <ScreenLayout>
      <ProcessingIndicator />
    </ScreenLayout>
  );
}

function DotPage() {
  const navigate = useNavigate();
  const { dotSession, hydrated } = useSession();

  return (
    <ScreenLayout>
      {!hydrated ? null : dotSession ? (
        <TodaysDotView session={dotSession} />
      ) : (
        <EmptyState onAction={() => navigate({ to: "/" })} />
      )}
    </ScreenLayout>
  );
}

function ReflectionPage() {
  const navigate = useNavigate();
  const { dotSession, hydrated } = useSession();

  return (
    <ScreenLayout
      activeTab="reflection"
      header={<AppHeader title="今日の振り返り" showBack />}
    >
      {!hydrated ? null : dotSession ? (
        <ReflectionLetter session={dotSession} />
      ) : (
        <EmptyState onAction={() => navigate({ to: "/" })} />
      )}
    </ScreenLayout>
  );
}

const rootRoute = createRootRoute({ component: RootComponent });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const recordRoute = createRoute({ getParentRoute: () => rootRoute, path: "/record", component: RecordPage });
const processingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/processing", component: ProcessingPage });
const dotRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dot", component: DotPage });
const reflectionRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reflection", component: ReflectionPage });

const routeTree = rootRoute.addChildren([
  indexRoute,
  recordRoute,
  processingRoute,
  dotRoute,
  reflectionRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
