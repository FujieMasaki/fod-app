import { createRootRoute, createRoute, createRouter, useNavigate, useRouter } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header/app-header";
import { AppShell } from "@/components/app-shell/app-shell";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ScreenLayout } from "@/components/screen-layout/screen-layout";
import {
  AccountScreen,
  ConfirmationScreen,
  PasswordForgotScreen,
  PasswordResetScreen,
  RequireAuth,
  SignInPrompt,
  SignInScreen,
  SignUpScreen,
  UnlockScreen,
  parseAuthError,
  safeRedirect,
} from "@/features/auth";
import { DayDetailScreen, DayListScreen, DayScreen, isCalendarDate } from "@/features/history";
import { HomeHero } from "@/features/home";
import { ProcessingIndicator } from "@/features/processing";
import { RecordingStage } from "@/features/recording";
import { ReflectionLetter } from "@/features/reflection";
import { useSession } from "@/features/session";
import { TodaysDotView } from "@/features/todays-dot";
import { Providers } from "@/providers";

const RootComponent = () => {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
};

const HomePage = () => {
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
};

// 録音前にserverで認証を確かめる（journaling.md §4「録音前認証と期限切れ」）。
const RecordPage = () => {
  return (
    <ScreenLayout>
      <RequireAuth startsOnEnter>
        <RecordingStage />
      </RequireAuth>
    </ScreenLayout>
  );
};

const ProcessingPage = () => {
  return (
    <ScreenLayout>
      <RequireAuth startsOnEnter>
        <ProcessingIndicator />
      </RequireAuth>
    </ScreenLayout>
  );
};

const DotPage = () => {
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
};

const ReflectionPage = () => {
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
};

// serverに保存したDotのDay・一覧・日の詳細（dot-history.md §2）。mockの/dot・/reflectionとは別の画面。
const DayPage = () => {
  return (
    <ScreenLayout activeTab="dot">
      <RequireAuth>
        <DayScreen />
      </RequireAuth>
    </ScreenLayout>
  );
};

const DayListPage = () => {
  const navigate = useNavigate();
  const { selected } = dayListRoute.useSearch();
  return (
    <ScreenLayout activeTab="dot" header={<AppHeader title="過去のDot" showBack onBack={() => navigate({ to: "/day" })} />}>
      <RequireAuth>
        <DayListScreen selected={selected} />
      </RequireAuth>
    </ScreenLayout>
  );
};

const DayDetailPage = () => {
  const router = useRouter();
  const navigate = useNavigate();
  const { date } = dayDetailRoute.useParams();
  // 来た画面（一覧・Day）へ戻る。URLを直接開いた場合は一覧へ。
  const back = () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: "/dots" }));
  return (
    <ScreenLayout activeTab="dot" header={<AppHeader title="Dotを振り返る" showBack onBack={back} />}>
      <RequireAuth>
        <DayDetailScreen date={date} />
      </RequireAuth>
    </ScreenLayout>
  );
};

const SettingsPage = () => {
  return (
    <ScreenLayout activeTab="settings">
      <RequireAuth>
        <AccountScreen />
      </RequireAuth>
    </ScreenLayout>
  );
};

const LoginPage = () => {
  const search = loginRoute.useSearch();
  return (
    <ScreenLayout>
      <SignInScreen redirect={safeRedirect(search.redirect)} authError={parseAuthError(search.auth_error)} />
    </ScreenLayout>
  );
};

const SignUpPage = () => {
  return (
    <ScreenLayout>
      <SignUpScreen />
    </ScreenLayout>
  );
};

// メールのリンクの画面。パスはRailsのメール（apps/api/app/mailers/user_mailer.rb）と揃える。
const ConfirmationPage = () => {
  return (
    <ScreenLayout>
      <ConfirmationScreen />
    </ScreenLayout>
  );
};

const PasswordForgotPage = () => {
  return (
    <ScreenLayout>
      <PasswordForgotScreen />
    </ScreenLayout>
  );
};

const PasswordResetPage = () => {
  return (
    <ScreenLayout>
      <PasswordResetScreen />
    </ScreenLayout>
  );
};

const UnlockPage = () => {
  return (
    <ScreenLayout>
      <UnlockScreen />
    </ScreenLayout>
  );
};

const rootRoute = createRootRoute({ component: RootComponent });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const recordRoute = createRoute({ getParentRoute: () => rootRoute, path: "/record", component: RecordPage });
const processingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/processing", component: ProcessingPage });
const dotRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dot", component: DotPage });
const reflectionRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reflection", component: ReflectionPage });
const dayRoute = createRoute({ getParentRoute: () => rootRoute, path: "/day", component: DayPage });
// URLから来る値は、実在する暦日だけを画面へ渡す（それ以外は選択なしとして扱う）。
const dayListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dots",
  component: DayListPage,
  validateSearch: (search: Record<string, unknown>): { selected?: string } => ({
    selected: isCalendarDate(search.selected) ? search.selected : undefined,
  }),
});
// dateは画面が実在する暦日か確かめてから使う（違えば通信せずに知らせる）。
const dayDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dots/$date", component: DayDetailPage });
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
const confirmationRoute = createRoute({ getParentRoute: () => rootRoute, path: "/confirmation", component: ConfirmationPage });
const passwordForgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/password/forgot",
  component: PasswordForgotPage,
});
const passwordResetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/password/reset",
  component: PasswordResetPage,
});
const unlockRoute = createRoute({ getParentRoute: () => rootRoute, path: "/unlock", component: UnlockPage });

const routeTree = rootRoute.addChildren([
  indexRoute,
  recordRoute,
  processingRoute,
  dotRoute,
  reflectionRoute,
  dayRoute,
  dayListRoute,
  dayDetailRoute,
  settingsRoute,
  loginRoute,
  signUpRoute,
  confirmationRoute,
  passwordForgotRoute,
  passwordResetRoute,
  unlockRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
