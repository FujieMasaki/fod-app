# TASK-007 認証状態と利用開始・終了のFrontend接続 Implementation Plan

## 1. Status

実施中（2026-10-05）。

## 2. Goal

TASK-006で実装したRailsの認証（Devise + OmniAuth Google + CookieStore）を、Webから使えるようにする。
利用者は次のことができる。

- メールアドレス＋passwordで登録し、メールのリンクで確認してからloginする。Googleでもloginできる。
- password再設定・ロック解除・確認メールの再送を、メールのリンクから画面で行う。
- 今loginしているか、いつまで保たれるか、次に何をすればよいか（login・確認メール・再ログイン）が分かる。
- logoutする。7日の期限切れ・別タブでのlogoutの後は、録音・Dotの画面へ進めず、loginへ案内される。

後続のFrontend（TASK-010 / 011 / 012 / 014）が、CSRF・`401`・schema不正を毎回書かずに保護APIを
呼べる入口と、認証の終了・利用者の切り替わりを個人データのstateへ伝える境界を用意する。

## 3. Background

- TASK-001で、録音前ログイン・7日の固定期限・確認/再設定メール・Google衝突時の案内・ログイン画面での
  説明を採用した（[TASK-001 Plan §50–§56](2026-09-21-task-001-identity-design.md)）。
- TASK-005で、endpoint・schema・error codeとWebの扱いを契約にした（[`contracts/openapi.yaml`](../../contracts/openapi.yaml)、
  [`contracts/README.md`](../../contracts/README.md) §4・§5）。
- TASK-006でRails側を実装した（[TASK-006 Plan](2026-10-02-task-006-backend-identity.md)）。メールのリンクは
  SPAの`/confirmation`・`/password/reset`・`/unlock`（tokenはfragmentの`#token=`）、案内メールは`/login`・
  `/password/forgot`を指す（`apps/api/app/mailers/user_mailer.rb`）。Googleのcallbackは成功時に`return_to`、
  失敗時に`/login?auth_error=<理由>`へredirectする。
- 依存（TASK-001 / 005 / 006）はすべてDone。契約とRailsの実装は、このタスクの前提（Cookie session、
  `GET /api/v1/session`で状態とCSRF tokenを取る、`401`の2つのcode、Googleのform POST）を満たすことを確認した。

## 4. Current State

開始時点はmain `7a62614`（PR #53まで）。branchは`feat/task-007-frontend-identity`。

- Route: `/`・`/record`・`/processing`・`/dot`・`/reflection`（`apps/web/src/router.tsx`）。認証のguardはない。
- State: `SessionProvider`（`features/session`）が録音時間と現在のDot 1件を`fod.session.v1`（localStorage）へ
  保存・復元する。利用者を区別しない。`reset()`はあるがUIから呼ばれない。
- API: `createDot`（`features/processing`）が`VITE_DOT_API_URL`のときだけ本文なしPOSTを送る。それ以外はmock。
  Rails APIを呼ぶ通信関数・CSRFの扱い・`problem+json`の解釈はない。
- 契約のZod: `libs/api-contract/schemas.ts`に`Problem`・`Dot`・`Generation`がある。`Session`はない。
- 開発環境: Vite（5173）とRails（3000）は別origin。Viteにproxyはない。Railsは`forgery_protection_origin_check`で
  Originとrequestのhostを照合し、メールのリンクは`APP_BASE_URL`（既定`http://localhost:5173`）を指す。
- UI: CSS Modules。Tailwindは未導入（[design-system](../design-system.md)は新規UIの標準をTailwind CSS v4としている）。
  下部ナビの「設定」タブは非活性。
- Railsの`GET /api/v1/session`は、期限切れのsessionを破棄して未認証（`authenticated: false`）を返す。
  期限切れを`session_expired`で返すのは保護API（`authenticate_user!`）だけ。保護APIはまだない（TASK-008以降）。

## 5. Scope and Non-goals

### 対象

- 同一originでRailsを呼ぶ通信の入口（CSRF、`problem+json`、ネットワーク失敗・schema不正の区別）
- 認証状態の取得・保持と、login・logout・期限切れ・利用者の切り替わりの検出
- 認証の終了・切り替わりを、TanStack Queryのcacheと`SessionProvider`へ伝える境界
- 画面: ログイン、新規登録、メール確認、確認メールの再送、password再設定（依頼・設定）、ロック解除、
  アカウント（login中の利用者・期限・logout）
- 保護する画面のguard（`/record`・`/processing`・`/dot`・`/reflection`・`/settings`）
- 開発環境の同一origin（Viteのproxy）
- 新しい画面のためのTailwind CSS v4の導入（既存画面は移行しない）

### 対象外

- 退会の画面と状況画面（TASK-014）。`account_status=deletion_in_progress`のときは、保護する画面の代わりに
  「退会の手続き中」であることだけを示す。Railsの退会（TASK-013）も未実装で、現状は常に`active`。
- Dot・文字起こしの端末保持の整理（TASK-014）。`fod.session.v1`の読み取りをやめて起動時に消す変更
  （journaling §2で決定済み）は、当初TASK-014に回していたが、本タスクで行う（§13「起動時に残っていた
  ジャーナリング状態」。Codexの最終チェックで、別の利用者のDotが復元されることを再現されたため）。
- 録音画面に留まったままの再ログインと、memory内の音声の再送（TASK-010 / 011）。現在の録音は音声を
  後続へ渡さないため、失うデータはない。
- Google専用の利用者の再認証（`intent=reauthenticate`。使うのは退会のTASK-014）。
- メール/password変更（契約にない）。
- 本番の配信（Rails releaseへのReact同梱、SPA fallback）とGoogle OAuth client・メール配送の設定。

### 今回確定しない事項

- 実Google・実メール・HTTPSでの一連の動作（外部設定が必要。TASK-015）。

## 6. References and Documents to Update

- 参照
  - [AGENTS.md](../../AGENTS.md)、[frontend.md](../development/frontend.md)、[design-system](../design-system.md)
  - [product](../product.md) §2・§4「認証体験」、[journaling](../journaling.md) §2・§4「録音前認証と期限切れ」、
    [privacy](../privacy.md)、[architecture](../architecture.md)「認証詳細」
  - 契約（`contracts/`）、[TASK-001 Plan](2026-09-21-task-001-identity-design.md) §46・§50–§56、
    [TASK-006 Plan](2026-10-02-task-006-backend-identity.md)
  - [frontend review](../code-review/frontend/README.md)、[security](../code-review/frontend/security.md)
- 同じ変更で更新する文書
  - architecture: 実装済み（route・Provider・通信の入口・proxy）と「認証詳細」のWeb接続
  - journaling: §1の現行flow（ログインを経る）、§3（Railsに認証がある）、「録音前認証と期限切れ」の実装状況
  - product: §3の区分（Web接続を実装済みへ）
  - frontend.md: 保護APIの呼び方、認証の終了・切り替わりの購読、Tailwindの使い始め
  - design-system: 「既存実装との関係」（Tailwindを導入した範囲）
  - code-review/frontend: security.md §6・README §3の`fod.session.v1`（保存・復元をやめたこと）と、Cookieの
    書き直しの競合・切り替わりの照合のレビュー観点（再発防止）
  - privacy: `fod.session.v1`を起動時に消すようにしたこと
  - TASK-014: 完了条件のうち`fod.session.v1`の扱いを本タスクで済ませたこと

## 7. Proposed Approach

### 7-1. 通信の入口（`libs/api-client`）

- `apiRequest(path, { method, body, csrfToken, schema })`を置く。React stateを持たない。
  - `credentials: "same-origin"`、`cache: "no-store"`。bodyはJSON。`csrfToken`があれば`X-CSRF-Token`に付ける。
  - 成功は`schema`で検証する（`202`・`204`は本文なし）。
  - 失敗を`ApiError`の`kind`で区別する: `problem`（契約のProblemとして読めた）、`network`（届かない）、
    `schema`（成功・失敗のどちらも契約と合わない。古いタブの可能性）、`http`（契約にない失敗。proxyの502など）。
  - `title`・`detail`は画面に出さず、`code`で判定する（frontend.md §2）。

### 7-2. 認証状態（`features/auth`）

- `AuthProvider`が`GET /api/v1/session`をTanStack Queryで取得する（key `["auth", "session"]`）。
  状態は次の5つ。

  | 状態 | 条件 | 保護する画面 |
  | --- | --- | --- |
  | `checking` | 初回の取得中 | 表示しない（待つ） |
  | `unknown` | 取得に失敗した（ネットワーク・5xx・schema不正） | 表示しない。再試行を出す（未認証と同じに扱わない） |
  | `anonymous` | `authenticated: false` | ログインへ |
  | `authenticated` | `authenticated: true`・`account_status: active` | 表示する |
  | `deletion_in_progress` | `account_status: deletion_in_progress` | 「退会の手続き中」を示す（画面はTASK-014） |

- CSRF tokenは最新のSessionのresponseから取る（loginの成功responseでも置き換わる）。
- 保護APIの入口`request`（`useAuth().request`）を後続の機能へ公開する。
  - `403 csrf_invalid`なら、Sessionを取り直して1回だけ再送する（contracts/README §5）。
  - `401 unauthenticated`・`401 session_expired`なら、終了の理由を記録してSessionを取り直す。取り直した
    結果が未認証になれば、下の切り替わりの処理が走る。
- 期限切れの検出: Railsの`GET /api/v1/session`は期限切れを未認証として返すため、次の2つで期限切れと判断する。
  1. 保護APIが`session_expired`を返した。
  2. login中の`expires_at`を過ぎた時点でSessionを取り直し、未認証になった（timerで取り直す。表示の
     期限は案内用で、判断はserverの応答に従う）。
- 別タブのlogout・login: 画面へ戻ったとき（window focus）にSessionを取り直す。
- logout: `DELETE /api/v1/session`の前に個人データを画面から外す（下の切り替わりを先に通知する）。
  成功したらSessionを取り直し、ログイン画面へ「ログアウトしました」と出す。失敗したら「ログアウトを確認
  できませんでした」と示し、login中のまま再試行させる（serverで終わったと断定しない。TASK-001 Plan §20）。
  確認できるまでログイン画面へ進めない。
- Googleのlogin: Sessionの`csrf_token`を`authenticity_token`に入れたformを通常のsubmitで送る
  （`intent=sign_in`、`return_to`）。遷移の前に切り替わりを通知する（戻ってきたときはページの読み込み直しに
  なり、前後の利用者を比べられないため）。

### 7-3. 認証の終了・切り替わりの伝達（TASK-014との境界）

- `AuthProvider`は、確定した利用者（`authenticated`の`user.id`、未認証なら`null`）が前回と変わったら
  「切り替わり」を通知する。初回の確定（`checking`から）は通知しない。
  - A → 未認証（logout・期限切れ・別タブのlogout）、未認証 → A（login）、A → B（別タブで入れ替わった）。
  - logoutの開始とGoogleへの遷移の前にも通知する。
- 通知を受けたら次を行う。
  - TanStack Queryの`auth`以外のqueryを取り消して消す（前の利用者のresponseを再表示しない）。
  - `SessionProvider`が`reset()`する（録音時間と現在のDotを消す）。
  - 購読は`useAuth().subscribeIdentityChange(listener)`で公開する。TASK-014で端末の個人データ
    （`sessionStorage`の文字起こしなど）を足すときは、ここへ購読を足す。
- 通知はreact stateではなく購読の関数にする。切り替わりの瞬間に1回だけ実行したい処理で、表示のための
  値ではないため。

### 7-4. 画面とguard

- 保護する画面は`RequireAuth`で包む。`checking`は待ち、`unknown`は再試行、`anonymous`は
  `/login?redirect=<今のpath>`へ置き換え遷移、`deletion_in_progress`は案内を出す。
  `redirect`は保護する画面のpathの一覧に一致するものだけを使い、合わなければ`/`にする（open redirect対策）。
- `/`（Home）は公開のまま。マイクを押すと`/record`のguardでログインへ進み、成功すると`/record`へ戻る。
  Homeには未認証のときだけ「ログインすると話し始められます」とログインへのリンクを示す。
- ログイン画面: メール＋password、Google、新規登録・password再設定への導線。自分専用端末向けで7日保たれ、
  共有端末では使用後にlogoutすること（product §4「認証体験」）を示す。`auth_error`・終了の理由（`reason`）を
  enumで検証して文言に変える。`email_unconfirmed`なら確認メールの再送へ案内する。
- 新規登録・確認メールの再送・password再設定の依頼は、登録の有無にかかわらず同じ文言で受付を示す。
- メールのリンクの画面（確認・再設定・ロック解除）は、fragmentのtokenを読んだら`history.replaceState`で
  URLから消し、ボタンの操作でserverへ送る（メールのscannerがリンクを開いただけで確認・解除されないように）。
- アカウント（`/settings`）: login中のメールアドレス、login方法、保たれる期限（JST）、logout。下部ナビの
  「設定」を有効にする。
- 新しい画面はTailwind CSS v4で組む。既存の`--fod-*` tokenだけをTailwindのthemeに割り当て、既定の色・
  余白は消す（任意の値を画面へ足せないように）。既存画面のCSS Modulesとresetに影響しないよう、Tailwindの
  preflightは読み込まず、themeとutilitiesだけを使う。行間は`text-*`に組み込まず`leading-*`で指定する
  （Tailwindの`--text-*--line-height`は、repositoryのCSS custom propertyの命名検査に合わないため）。

### 7-5. 開発環境

- Viteの`server.proxy`で`/api`と`/auth`をRails（`http://localhost:3000`）へ送る。Hostを書き換えない
  （`changeOrigin: false`）。RailsのOrigin照合とGoogleのcallback URLが、browserの見ているorigin（5173）で
  揃うため。Railsのportは`FOD_API_PROXY_TARGET`で変えられるようにする。

## 8. Why This Approach

- 認証状態はserverの正本なので、TanStack Queryで扱う（frontend.md §2）。`SessionProvider`やlocalStorageに
  入れない。
- 期限切れを`GET /api/v1/session`が区別して返さないため、Rails・契約を変えずにWebで判断できる2つの契機を使う。
  契約を変える案（Sessionに`expired`を足す）は、enumの追加で古いWebを壊すため段階が要り、本タスクの範囲を
  超える。
- 通信の入口を`libs`（React非依存）と`features/auth`（CSRF・401の扱い）に分ける。TASK-008以降の各機能は
  `useAuth().request`だけを使えばよく、CSRFの再送・失効の検出を機能ごとに重複させない。
- Viteのproxyは、本番の同一origin配信（architecture）と同じ形を開発でも作る最小の手段。CORSを許可する案は
  本番と構成が変わり、Cookie・CSRFの検証が開発で素通りになる。

## 9. Data Flow

```text
起動 / 画面へ戻る / expires_at到来
  → AuthProvider: GET /api/v1/session（TanStack Query）
  → 状態（checking / unknown / anonymous / authenticated / deletion_in_progress）と csrf_token
  → 利用者が前回と違えば「切り替わり」を通知
       → Query cache（auth以外）を取り消して消す
       → SessionProvider.reset()（録音時間・現在のDot）
  → RequireAuth: 保護する画面を表示 / ログインへ置き換え遷移

ログイン画面 → POST /api/v1/session（X-CSRF-Token）
  → 成功: Sessionのcacheを置き換え → 切り替わり（未認証 → A）→ redirect先へ
  → 失敗: codeで文言（invalid_credentials / email_unconfirmed / rate_limited / validation_failed）

Google → form POST /auth/google_oauth2（authenticity_token・intent・return_to）
  → Google → /auth/google_oauth2/callback → return_to または /login?auth_error=...（ページの読み込み直し）

保護API（後続の機能）→ useAuth().request
  → 403 csrf_invalid: Sessionを取り直して1回だけ再送
  → 401: 終了の理由を記録 → Sessionを取り直す → 未認証なら切り替わり → RequireAuthがログインへ
```

source of truthは、認証状態・利用者・期限・CSRF tokenがRails（Cookie session）で、Webはその写しを
TanStack Queryに持つだけ。localStorageの値・URLの値は認証の根拠にしない。

## 10. Files to Change

レビュー対象は合計で約45ファイルになるため、3つのサブのPRに分ける（[PRの分割](../development/pull-requests.md)）。
統合ブランチは`feat/task-007-frontend-identity-integration`。

### PR 1/3: 認証状態と通信の入口（`feat/task-007-1-auth-state`、base 統合ブランチ）

| ファイル | 新規 / 変更 | 役割 |
| --- | --- | --- |
| `docs/implementation-plans/2026-10-05-task-007-frontend-identity.md` | 新規 | 本Plan |
| `docs/tasks/TASK-007-frontend-identity.md` | 変更 | 状態とPlanへのリンク（数えない） |
| `apps/web/vite.config.ts` | 変更 | `/api`・`/auth`のproxy |
| `apps/web/src/libs/api-contract/schemas.ts` | 変更 | `Session`のZod |
| `apps/web/src/libs/api-contract/schemas.test.ts` | 変更 | 契約のexamplesをZodで読む |
| `apps/web/src/libs/api-client/request.ts` | 新規 | 通信の入口 |
| `apps/web/src/libs/api-client/request.test.ts` | 新規 | 失敗の区別・CSRF header |
| `apps/web/src/features/auth/api.ts` | 新規 | session・登録・確認・再設定・解除の通信関数 |
| `apps/web/src/features/auth/auth-provider.tsx` | 新規 | 状態・CSRF・401・切り替わりの通知・logout |
| `apps/web/src/features/auth/auth-provider.test.tsx` | 新規 | 状態遷移・再送・切り替わり |
| `apps/web/src/features/auth/index.ts` | 新規 | 公開API |
| `apps/web/src/providers.tsx` | 変更 | `AuthProvider`の配置 |
| `apps/web/src/features/session/session-context.tsx` | 変更 | 切り替わりで`reset()`。`fod.session.v1`の復元をやめ起動時に消す |
| `apps/web/src/features/session/session-context.test.tsx` | 新規 | 切り替わりで消えること、起動時に復元せず消すこと |
| `apps/web/src/features/session/types.ts` | 変更 | `hydrated`の意味（復元をやめたため） |
| `apps/web/src/features/processing/components/processing-indicator/processing-indicator.tsx` | 変更 | 整理の途中で利用者が切り替わったら結果を捨てる（Codexの指摘で追加） |
| `apps/web/src/features/recording/components/recording-stage/recording-stage.tsx` | 変更 | 録音の途中で利用者が切り替わったら録音時間を残さない |
| `apps/web/src/features/recording/components/recording-stage/recording-stage.test.tsx` | 新規 | 上の確認 |
| `apps/web/src/features/processing/components/processing-indicator/processing-indicator.test.tsx` | 変更 | `SessionProvider`が`AuthProvider`を要るため包む。切り替わりで結果を捨てること |

レビュー対象 18。

### PR 2/3: ログイン・登録・guard・アカウント画面（`feat/task-007-2-sign-in-screens`、base PR 1）

| ファイル | 新規 / 変更 | 役割 |
| --- | --- | --- |
| `apps/web/package.json`（`pnpm-lock.yaml`は数えない） | 変更 | `tailwindcss`・`@tailwindcss/vite` |
| `apps/web/vite.config.ts` | 変更 | Tailwindのplugin |
| `apps/web/src/styles/tailwind.css` | 新規 | tokenだけのtheme |
| `apps/web/src/main.tsx` | 変更 | tailwind.cssの読み込み |
| `apps/web/src/features/auth/messages.ts` | 新規 | `ApiError`・`auth_error`・終了の理由から文言 |
| `apps/web/src/features/auth/messages.test.ts` | 新規 | 文言の対応・`redirect`の検証 |
| `apps/web/src/features/auth/components/auth-layout.tsx` | 新規 | 認証画面の骨格・入力欄・メッセージ |
| `apps/web/src/features/auth/components/sign-in-screen.tsx` | 新規 | ログイン |
| `apps/web/src/features/auth/components/google-sign-in-form.tsx` | 新規 | Googleのform POST |
| `apps/web/src/features/auth/components/sign-up-screen.tsx` | 新規 | 新規登録 |
| `apps/web/src/features/auth/components/require-auth.tsx` | 新規 | guard |
| `apps/web/src/features/auth/components/account-screen.tsx` | 新規 | アカウント・logout |
| `apps/web/src/features/auth/components/auth-screens.test.tsx` | 新規 | guardの状態ごとの表示・遷移、ログインの成功・失敗・未確認・auth_error・Googleのform、アカウントの期限・logoutの失敗 |
| `apps/web/src/features/auth/components/sign-in-prompt.tsx` | 新規 | Homeの未認証の案内 |
| `apps/web/src/features/auth/redirect.ts` | 新規 | `redirect`の許可一覧と検証 |
| `apps/web/src/features/auth/index.ts` | 変更 | 画面のexport |
| `apps/web/src/router.tsx` | 変更 | route追加・guard |
| `apps/web/src/components/bottom-navigation/bottom-navigation.tsx` | 変更 | 「設定」を有効に |

レビュー対象 18。

### PR 3/3: メールのリンクの画面と文書（`feat/task-007-3-account-recovery`、base PR 2）

| ファイル | 新規 / 変更 | 役割 |
| --- | --- | --- |
| `apps/web/src/features/auth/use-fragment-token.ts` | 新規 | fragmentのtokenを読んでURLから消す |
| `apps/web/src/features/auth/components/confirmation-screen.tsx` | 新規 | メール確認・確認メールの再送 |
| `apps/web/src/features/auth/components/password-forgot-screen.tsx` | 新規 | 再設定の依頼 |
| `apps/web/src/features/auth/components/password-reset-screen.tsx` | 新規 | 再設定 |
| `apps/web/src/features/auth/components/unlock-screen.tsx` | 新規 | ロック解除 |
| `apps/web/src/features/auth/components/token-screens.test.tsx` | 新規 | token画面の成功・期限切れ・不正・URLからの消去 |
| `apps/web/src/features/auth/components/sign-in-screen.tsx` | 変更 | password再設定への導線（routeがこのPRで増えるため） |
| `apps/web/src/features/auth/index.ts` | 変更 | export |
| `apps/web/src/router.tsx` | 変更 | route追加 |
| `docs/architecture.md`・`docs/journaling.md`・`docs/product.md`・`docs/development/frontend.md`・`docs/design-system.md` | 変更 | §6の現行文書 |
| 本Plan・`docs/tasks/TASK-007-frontend-identity.md` | 変更 | Completion Record・完了条件 |

レビュー対象 約16。

## 11. Libraries / APIs

- TanStack Query（既存）: Sessionの取得・再取得・cacheの消去。
- TanStack Router（既存）: guardの遷移、`redirect`・`auth_error`・`reason`のsearch param。
- Zod（既存）: Session・Problem・search paramの検証。
- **Tailwind CSS v4**（新規、`tailwindcss`・`@tailwindcss/vite`）: [design-system](../design-system.md)が新規UIの
  標準としている。既存のCSS Modulesで代替できるが、同文書が新規採用しない方針のため使わない。
- Fetch API・`history.replaceState`（Browser API）: 通信とfragmentのtokenの消去。

## 12. Alternatives Considered

- **mockで動かすときは認証を省く（環境変数で切り替える）**: 採らない。認証を外す経路が本番に残る危険があり、
  localStorageを本人性の根拠にしないという方針（journaling §4）と相反する。開発ではRailsを起動する。
- **TanStack Routerの`beforeLoad`でguardする**: router contextへ認証状態を渡し、状態が変わるたびに
  `router.invalidate()`が要る。Componentで包む方が、状態の変化（期限切れ・別タブ）にそのまま追従できる。
- **切り替わりをReactのstate（世代番号）で配る**: 受け取る側がeffectで差分を見ることになり、初回の確定と
  区別しにくい。通知は購読の関数にした（§7-3）。世代番号（`identityEpoch`）は通知の手段としてではなく、
  切り替わりの前に始めた処理の結果を捨てる照合のためだけに併せて公開する（§13）。
- **確認・解除のリンクを開いたら自動で送る**: メールのscannerがリンクを開くだけで確定し得る（TASK-001 Plan
  §52）。ボタンの操作で送る。

## 13. Risks / Things to Watch

- **期限切れの見逃し**: `expires_at`のtimerは、端末のsleepなどで遅れ得る。画面へ戻ったときの再取得と、保護APIの
  `401`で補う。表示の期限は案内であり、判断はserverに従う。
- **端末の時計のずれ**: 期限のtimerは端末の時計で決まる。時計が進んでいてserverがまだ認証済みと返したら、
  30秒ごとに確かめ直す。期限切れ（`expired`）か別の終了（`session_lost`）かの判定も端末の時計を使うため、
  ずれていると案内の文言だけが変わり得る（保護する画面を閉じる判断には影響しない）。
- **logout中の再取得（後続への申し送り）**: logoutの開始でQuery cacheを消しても、mount中の`useQuery`は
  DELETEが終わる前（Cookieが前の利用者のまま）に取り直し得る。今は個人データのqueryがないため影響はない。
  TASK-008以降で保護APIのqueryを足すときは、`status`が`authenticated`のときだけ`enabled`にするなどで防ぐ。
  切り替わりの前に始まった非同期処理（Dot生成のmutation、`request`のpromise）は止めない。終わった後に結果を
  stateへ書き戻すと前の利用者のデータが残るため、`useAuth().identityEpoch`（切り替わりごとに増える番号）を
  始めたときに控え、結果を保存・表示する前に比べて違えば捨てる。現在のDot生成（`ProcessingIndicator`）は
  これで捨て、Homeへ戻す。録音時間（`RecordingStage`）も、録音を始めたときの番号と比べて違えば残さない。
  TASK-010・011・014で足す処理も同じ照合をする。Mutation cacheも今は消していない。`removeQueries`はmount中の
  `useQuery`が持つ表示中のdataまでは消さないため、個人データのqueryは`status`で`enabled`を切るかguardでunmountする。
- **通信のtimeout**: `apiRequest`はtimeoutもAbortSignalも持たない。応答が止まるとlogin・logoutの送信中の表示が
  解けない。保護APIを足すTASK-008以降で、`signal`を通すかを決める。
- **featureをまたぐ依存**: `features/session`・`features/processing`・`features/recording`が`features/auth`の`index.ts`（`useAuth`）に
  依存する（逆向きはない）。認証の切り替わりを個人データのstateへ伝える境界（§7-3）を、各featureが購読・照合する
  ためで、frontend.md §1の「公開する最小APIを`index.ts`からexportする」形に収める。`features/auth`が他の
  featureの内部をimportする必要が出たら、境界の置き場所を見直す。
- **`libs/api-client`の位置づけ**: frontend.md §1が保留する「通信専用directory・repository層」ではなく、
  `libs/`の定義（Browser APIの小さいラッパー。React stateを持たない）に収まるfetchの薄い包みとして置く。
  endpointごとの通信関数は各featureに置く方針を変えない。
- **Cookieの書き直しの競合**: RailsのCookieStoreは、`GET /api/v1/session`も保護APIも、どの応答でもCookieを
  書き直す。login・logoutの前に送った通信の応答が後から届くと、Cookieが前の状態へ戻る（logoutが取り消される、
  loginしたのに未認証になる）。そのため次のようにする。
  - login・logoutの間は、取り直し（focus・再接続・期限のtimer）を始めない。`request`・`withCsrf`で新しく
    始める通信は、login・logoutが終わるまで待たせる。
  - login・logoutは、実行中の取り直しと`request`・`withCsrf`の応答を受け取ってから送る。重なって呼ばれたら
    順に実行する。offlineで止まった通信を待ち続けないよう、10秒で待ちきれなければ送らずに失敗にする
    （待ちきれなかった通信の応答が後から届くと、logoutの確認の後でもCookieを戻し得るため）。
  - login・logoutの間に保護APIが`401`を返しても、取り直しはlogin・logoutの後に回す。公開している`refresh`も、
    login・logoutの間に呼ばれたら終わってから取り直す。
  - focus・再接続での取り直しを止める判定は、stateではなくrefでその場で行い、refはlogin・logoutを呼んだ
    その場で立てる（次の描画やawaitの後に立てると、その間に始まった取り直しが待つ対象から漏れるため。Codexの
    5回目の指摘）。
  - 応答が返らない保護APIが残っていると、10秒待って失敗するため、そのたびにlogin・logoutが失敗する（再読み込み
    まで続き得る）。TASK-011で時間のかかる処理を`request`に載せるときは、pollingに分けて1回の通信を短く保つか、
    `signal`・timeoutを通す。
- **取り直しの失敗**: 前に認証済みを得ていても、最後の取り直しが失敗したら`unknown`にし、保護する画面を閉じて
  再試行を出す（未認証のcacheはそのまま）。画面へ戻ったときの通信の失敗でも録音画面が閉じるため、録音中の
  扱いはTASK-010で決める。offline（TanStack Queryの既定の`networkMode: "online"`）では取り直しが始まらず、
  起動時は`checking`のまま待つ。offlineの案内もTASK-010以降で扱う。
- **待たされた操作の利用者の照合**: `request`・`withCsrf`は呼ばれたときの利用者を控え、login・logoutを待った後に
  変わっていれば送らずに`Error("identity_changed")`を投げる。下の「再送」の照合も、この呼ばれたときの利用者で行う。
  認証状態がまだ分からないうちに呼ばれたもの（公開の画面の登録など）は照合しない。
- **起動時に残っていたジャーナリング状態**: 初回の確定では切り替わりを通知しないため、`fod.session.v1`を
  復元すると、起動時から別の利用者が認証済みの場合（Aの保存値が残った端末でBとして開く、複数タブで別のタブが
  Googleから戻った直後など）にguardを通って前の利用者のDotが表示された（Codexの最終チェックで再現）。
  journaling §2の決定（実サービス化では`fod.session.v1`の読み取りをやめ、起動時に削除する）どおり、
  `SessionProvider`は録音時間と現在のDotをmemoryにだけ持ち、起動時に`fod.session.v1`を消す。利用者の
  照合のために利用者のidを端末へ保存する案は、storageへ新しい個人の値を足すため採らなかった。代わりに、
  mockの体験で、再読み込みすると現在のDotが消える（Dotの正本はserverで、TASK-012の履歴から見直せるようになる）。
- **CSRF tokenの取り直しの後の再送**: `csrf_invalid`の後に取り直したSessionの利用者が、始めたときと違えば
  再送しない（Aとして始めた操作をBの認証で送らないため。journaling §4の「別Userへ元の録音を送信しない」）。
  - logoutの後はserverに確かめ、まだ認証済みなら1回だけ送り直し、それでも残れば失敗にする。
  - 別タブの通信と、`request`を通さない`fetch`は止められないため、完全には防げない（その場合も、logoutの
    確認で失敗として示す）。後続の機能はRails APIを必ず`request`・`withCsrf`から呼ぶ（frontend.md §2）。
- **切り替わりの通知の時機**: 個人データを消す通知は描画後のeffectで行うため、新しい利用者の状態で描画した
  1回だけ前の利用者の値が残り得る。そのため`identityEpoch`は描画の中で（前回の利用者と比べて）増やし、新しい
  利用者と同じcommitに入れる。`SessionProvider`は値を書いたときの番号と一緒に持ち、番号が違えば見せない。
  Dot生成の結果も、始めたときの番号と比べて捨てる（Codexの最終チェックで、Bの認証とAのDotが同じcommitに
  出ることを再現されたため）。個人データのqueryを足すTASK-008以降は、query keyに`user.id`か`identityEpoch`を
  含める。
- **logoutの失敗**: 個人データを外した後に失敗しても、ログイン画面へ進めない（別の利用者がloginして前の
  Cookieと混ざるのを防ぐ）。
- **Googleから戻った直後**: ページの読み込み直しで前の利用者と比べられないため、遷移の前に切り替わりを通知して
  消しておく。
- **open redirect**: `redirect`は許可した保護する画面のpathだけ。`return_to`もRailsが検証する（二重）。
- **tokenの漏えい**: fragmentはserverへ送られないが、URLに残るとbrowserの履歴・共有で漏れ得るため、読んだら
  消す。tokenを画面・ログに出さない。
- **Tailwindの影響**: preflightを読み込まないので既存画面のresetは変わらない。themeの既定値を消すので、
  token外の色・余白のclassは生成されない。
- **互換性**: 契約は変えない。Webが新しく読むのは既存の`Session`だけ。

## 14. Verification

### Manual

- Rails（`apps/api`）とVite（proxy）を起動し、`curl`でproxy越しに`GET/POST/DELETE /api/v1/session`・登録が
  同一originのCookie・CSRFで通ることを確かめる。
- 実browserでの、登録 → 確認メールのリンク → ログイン → 録音 → logout、期限切れ、別タブのlogout、再読込、
  Google（OAuth clientの設定が必要）は、人間の確認としてPRの「確認すること」に入れる。

### Automated

- `pnpm check`・`pnpm type-check`・`pnpm test`。
- Unit: `apiRequest`の失敗の区別、Sessionのexamples、文言の対応、`redirect`の検証。
- Component: `AuthProvider`（状態・CSRFの再送・`401`・切り替わり・logoutの失敗）、`SessionProvider`の`reset`、
  `RequireAuth`、ログイン・アカウント・token画面。

## 判断が必要な点（2026-10-05、PR 1/3の機械のレビューで停止）

PR 1/3（#65）のサブエージェントのレビューが3回続けてLGTMにならず、`pr-review-cycle`の止まる条件
（1回のサブエージェント段階で3回）に当たった。各回の指摘はすべて直した。

| 回 | Medium | 対応 |
| --- | --- | --- |
| 1 | 端末の時計が進んでいると、期限の前に取り直した後に次の取り直しが予約されない | 30秒ごとに確かめ直す（testで再現・修正を確認） |
| 2 | `apiRequest`の同一originの判定が、tab・改行を挟んだpathで外部URLになり得る（CSRF tokenの送り先） | URLとして解決したoriginで比べる |
| 3 | login直前に始まったSessionの取り直しが、login成功のcacheを未認証で上書きし得る | loginの結果を置いた後に新しいCookieで取り直す（実行中の取り直しは結果を捨てて止まる）。初めに入れた`cancelQueries`は、取り消しの際に取り直し前の値へ非同期に戻し、置いた結果を消すことがあった（testが間欠的に失敗して判明） |

各回のLowは直すか、§13へ申し送りとして書いた。指摘は回ごとに別の箇所で、同じ問題の繰り返しではない。

- 選択肢A（推奨）: 3回目の修正を入れた状態で、サブエージェントのレビューをもう1段階（最大3回）続ける。
- 選択肢B: PR 1/3の範囲（認証状態の扱い）を見直してから再開する。

**決定（2026-10-05、人間）: 選択肢A。**サブエージェントのレビューを新しい段階として再開した。
なお3回目の修正（取り直しを結果を捨てて止める）は、その後、取り消さずに応答を待つ方式へ変えた（取り消しても
fetchの通信は止まらず、Cookieが前の状態へ戻るのを防げないため。Codexの4回目）。

## 判断が必要な点（2026-10-05、PR 1/3のCodexの最終チェックで停止）

PR 1/3のCodexの最終チェックが5回続けてLGTMにならず、`pr-review-cycle`の止まる条件（4〜7のループが5回）に
当たった。各回の指摘はすべて直し、そのたびにサブエージェントのLGTMを得てからCodexへ戻した。

| 回 | 指摘（重大度） | 対応 |
| --- | --- | --- |
| 1 | 待ちきれない通信があってもlogoutする（High）／csrfの再送で利用者が変わっても送る（High） | 10秒で待ちきれなければ送らない／利用者を照合して再送しない |
| 2 | 取り直しの失敗で認証済みが残る（Medium）／login中の401で取り直しが先に送られる（Medium） | `unknown`にする／login・logoutの後に回す |
| 3 | 切り替わりの後に前の利用者の生成結果が戻る（High）／公開の`refresh`が排他を迂回する（Medium） | `identityEpoch`で照合して捨てる／排他の後に回す |
| 4 | 重なった取り直しの取り消しで、logoutが古い応答を待てない（High） | 取り消さずに共有する（`cancelRefetch: false`） |
| 5 | login・logoutを呼んだ直後のfocusで、取り直しが待つ対象から漏れる（High） | refでその場で判定する（停止の記録の時点では修正のみ。その後、選択肢Aの決定を受けてレビューした） |

指摘はすべて「CookieStoreがどの応答でもCookieを書き直す」ことから来る、通信の順序の競合（と、切り替わりの前の
結果の扱い）で、回ごとに別の経路が見つかっている。同じ問題の繰り返しではないが、収束していない。

- 選択肢A（推奨）: 5回目の修正をサブエージェントでレビューし、Codexの最終チェックをもう1段階（最大5回）続ける。
- 選択肢B: 競合をWebの順序の制御だけで防ぐのをやめ、server側で根本から防ぐ（例: logoutでUserの世代番号を
  上げ、古い世代のCookieを拒否する。TASK-001 Plan §54の「全端末logout」と同じ仕組み）。Backendの変更と契約の
  判断が要るため、別タスクにしてPR 1/3は今の対策で進める。
- 選択肢C: PR 1/3の範囲を見直してから再開する。

**決定（2026-10-05、人間）: 選択肢A。**5回目の修正をサブエージェントでレビューし、Codexの最終チェックを
新しい段階として再開した。

## 15. Definition of Done

- TASK-007の完了条件と必要な検証を満たし、検証できなかったものを理由とともに記録している。
- TypeScript error・lint・testがない。
- 関連する現行文書を更新している。

## 16. Completion Record

未記入。
