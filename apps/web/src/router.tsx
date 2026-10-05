import { createRootRoute, createRoute, createRouter, useNavigate } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header/app-header";
import { AppShell } from "@/components/app-shell/app-shell";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ScreenLayout } from "@/components/screen-layout/screen-layout";
import {
  AccountScreen,
  RequireAuth,
  SignInPrompt,
  SignInScreen,
  SignUpScreen,
  parseAuthError,
  safeRedirect,
} from "@/features/auth";
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
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <HomeHero />
        </div>
        <SignInPrompt />
      </div>
    </ScreenLayout>
  );
}

// 録音前にserverで認証を確かめる（journaling.md §4「録音前認証と期限切れ」）。
function RecordPage() {
  return (
    <ScreenLayout>
      <RequireAuth startsOnEnter>
        <RecordingStage />
      </RequireAuth>
    </ScreenLayout>
  );
}

function ProcessingPage() {
  return (
    <ScreenLayout>
      <RequireAuth startsOnEnter>
        <ProcessingIndicator />
      </RequireAuth>
    </ScreenLayout>
  );
}

function DotPage() {
  const navigate = useNavigate();
  const { dotSession, hydrated } = useSession();

  return (
    <ScreenLayout>
      <RequireAuth>
        {!hydrated ? null : dotSession ? (
          <TodaysDotView session={dotSession} />
        ) : (
          <EmptyState onAction={() => navigate({ to: "/" })} />
        )}
      </RequireAuth>
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
      <RequireAuth>
        {!hydrated ? null : dotSession ? (
          <ReflectionLetter session={dotSession} />
        ) : (
          <EmptyState onAction={() => navigate({ to: "/" })} />
        )}
      </RequireAuth>
    </ScreenLayout>
  );
}

function SettingsPage() {
  return (
    <ScreenLayout activeTab="settings">
      <RequireAuth>
        <AccountScreen />
      </RequireAuth>
    </ScreenLayout>
  );
}

function LoginPage() {
  const search = loginRoute.useSearch();
  return (
    <ScreenLayout>
      <SignInScreen redirect={safeRedirect(search.redirect)} authError={parseAuthError(search.auth_error)} />
    </ScreenLayout>
  );
}

function SignUpPage() {
  return (
    <ScreenLayout>
      <SignUpScreen />
    </ScreenLayout>
  );
}

const rootRoute = createRootRoute({ component: RootComponent });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const recordRoute = createRoute({ getParentRoute: () => rootRoute, path: "/record", component: RecordPage });
const processingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/processing", component: ProcessingPage });
const dotRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dot", component: DotPage });
const reflectionRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reflection", component: ReflectionPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });
// searchの値はURLから来るため、ここでは文字列かどうかだけを見て、画面へ渡す前に検証する。
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): { redirect?: string; auth_error?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    auth_error: typeof search.auth_error === "string" ? search.auth_error : undefined,
  }),
});
const signUpRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signup", component: SignUpPage });

const routeTree = rootRoute.addChildren([
  indexRoute,
  recordRoute,
  processingRoute,
  dotRoute,
  reflectionRoute,
  settingsRoute,
  loginRoute,
  signUpRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
