# Implementation Plan: 画面のスナップショット比較（VRT）を導入する（TASK-020）

## 1. Status

保留（2026-10-08）。ツール・実行環境・APIの用意・フォント・対象と許容値に複数の有力案があり、
[TASK-020](../tasks/TASK-020-visual-regression-test.md)の指示どおり、選択肢と推奨を整理して人間の判断を待つ。
判断の後に、7〜16を確定した内容で書き直して実装する。

## 2. Goal

主要な画面のスクリーンショットを基準画像と比べ、意図しない見た目の変化を機械で検出する。人間のレビューで
見る項目を「意図した変化が良いか」に絞る。

## 3. Background

- [design-system.md](../design-system.md)は静けさ・可読性を重視しており、UI変更は人間のレビューガイドで目視している。
- 余白・色・書体の小さな崩れはunit / component test（jsdom）では検出できない。
- [frontend.md](../development/frontend.md)の「4. テスト」はE2E基盤を保留にしている。VRTのためのPlaywrightは、
  その判断とは分ける。

## 4. Current State

- frontendはVite + React + TanStack Router（`apps/web/src/router.tsx`）。testはVitest + jsdomのみで、実ブラウザのtestはない。
- 画面: `/`（ホーム）、`/login`・`/signup`等の認証画面、`/record`（録音。`RequireAuth startsOnEnter`）、
  `/processing`、`/dot`・`/reflection`（端末内のsession）、`/day`（今日のDay）、`/dots`（過去の一覧）、
  `/dots/$date`（日の詳細）、`/settings`。
- 認証は`GET /api/v1/session`（`features/auth/api.ts`）、履歴は`/api/v1/days/today`・`/api/v1/days`・
  `/api/v1/days/:date`（`features/history/api.ts`）。応答はZodのschema（`libs/api-contract/schemas.ts`）で検証する。
  開発時はViteが`/api/`・`/auth/`をRailsへproxyする。
- フォントは`index.html`からGoogle Fonts（Zen Kaku Gothic New / Zen Old Mincho、`display=swap`）を読む。
  実行ごとにネットワークの状態で描画が変わりうる。
- 動きはframer-motionとCSSのanimation（ripple・spinner・waveform等）。挨拶文（`utils/generate-greeting.ts`）と
  Dayの日付は現在時刻に依存する。
- CIはGitHub Actionsの`ubuntu-latest`（`.github/workflows/ci.yml`）。Docker・Playwrightは未導入。

## 5. Scope and Non-goals

- 対象: VRTの基盤（ツール・設定・実行コマンド・CIのジョブ）、主要な画面の基準画像、更新手順、
  `pr-review-cycle`・`human-review-artifact`への差分画像の受け渡し手順、frontend.mdの「4. テスト」の更新。
- 対象外: E2E（操作の一連の流れの検証）基盤の導入判断、dark mode（現在ないため。導入したときに加える）、
  Storybook等のComponent単位のカタログ。
- 未決定: 「未決定事項」のQ1〜Q4。

## 6. References and Documents to Update

- 参照: [design-system.md](../design-system.md)、[frontend.md](../development/frontend.md)「4. テスト」、
  [privacy.md](../privacy.md)、[architecture.md](../architecture.md)、[PRの分割](../development/pull-requests.md)、
  [mizchi「AIコーディングのループと形式手法」](https://zenn.dev/mizchi/articles/ai-coding-loop-formal)。
- 更新: frontend.md「4. テスト」、`.claude/skills/pr-review-cycle/SKILL.md`、
  `.claude/skills/human-review-artifact/SKILL.md`、README（実行コマンドを載せる場合）。

## 7. Proposed Approach

推奨案（Q1〜Q4がすべてA）で進める場合の手順。判断の結果に合わせて書き直す。

1. `apps/web`にPlaywright（`@playwright/test`、バージョン固定）を入れ、`apps/web/vrt/`にVRTの設定とspecを置く。
   Vitestの対象（`src/**`）と分ける。
2. 実行環境を公式のPlaywrightコンテナ（`mcr.microsoft.com/playwright:v<固定>-noble`）に固定し、
   ローカル（macOS）もCIも同じコンテナで`pnpm vrt`を実行する。Chromiumだけを対象にする。
3. 認証・APIは`page.route`で`/api/v1/*`を固定のfixtureに差し替える。fixtureは架空のテスト用データで、
   契約のschemaで検証してから返す（契約から外れたfixtureで基準画像を作らないため）。
4. フォントは`fonts.googleapis.com`・`fonts.gstatic.com`への要求を`page.route`で止め、repositoryに置いた
   同じ書体のファイル（SIL Open Font License）を返す。撮影前に`document.fonts.ready`を待つ。
5. 不安定な要素を止める: `page.clock`で時刻を固定、`reducedMotion: "reduce"`と`toHaveScreenshot`の
   `animations: "disabled"`、caretを隠す、locale・timezoneを`ja-JP`・`Asia/Tokyo`に固定。
6. マイクは`/record`の録音前の状態だけを撮る。`navigator.mediaDevices.getUserMedia`を初期化scriptで
   差し替え、実際のマイクには触れない。
7. 基準画像を`apps/web/vrt/__screenshots__/`にgitで保存する。更新は`pnpm vrt:update`。
8. CIに`VRT`ジョブを足す（web変更時だけ）。失敗したらPlaywrightのHTML report（期待・実際・差分の画像）を
   artifactとして上げる。
9. `pr-review-cycle`・`human-review-artifact`に、UI変更でVRTの差分が出たときに差分画像（またはCIのartifactのリンク）を
   人間のレビューガイドへ載せ、「意図した変化か」を確認項目にする手順を加える。
10. frontend.md「4. テスト」にVRTの対象・更新手順と、PlaywrightはVRTのためでE2E基盤の保留とは別であることを書く。

## 8. Why This Approach

判断の後に記載する（推奨の理由は「未決定事項」の各Qを参照）。

## 9. Data Flow

アプリのデータフローは変えない。VRTの流れは次のとおり。

```text
pnpm vrt（コンテナ内）
↓
Vite dev server（または preview）
↓
Playwright（Chromium）→ page.route が /api/v1/* と Google Fonts を固定の応答に差し替え
↓
toHaveScreenshot が基準画像（apps/web/vrt/__screenshots__/）と比較
↓
一致: 成功 / 不一致: 失敗し、HTML report に期待・実際・差分の画像
```

## 10. Files to Change

推奨案での見積もり。合計20以下のため1つのPR（ブランチ`test/task-020-visual-regression`、base `main`）。

- 新規: `apps/web/playwright.config.ts`、`apps/web/vrt/*.spec.ts`（1〜2）、`apps/web/vrt/fixtures/*`（API・フォント）、
  `scripts/vrt.sh`（コンテナで実行する入口）
- 変更: `apps/web/package.json`、`package.json`、`.github/workflows/ci.yml`、`eslint.config.*`（必要な場合）、
  `docs/development/frontend.md`、`.claude/skills/pr-review-cycle/SKILL.md`、`.claude/skills/human-review-artifact/SKILL.md`、
  本Plan、タスクファイル
- 数えない: lockfile、基準画像（生成物）

## 11. Libraries / APIs

判断の後に記載する（候補: `@playwright/test`のスクリーンショット比較）。

## 12. Alternatives Considered

「未決定事項」の各Qに記載した。

## 13. Risks / Things to Watch

- コンテナとローカルのPlaywrightのバージョンがずれると、ブラウザのバイナリが合わず実行できない。
  `@playwright/test`とイメージのタグを同じ番号に固定する。
- 基準画像はバイナリのため、リポジトリが少しずつ大きくなる。画面と幅の数を絞る。
- `package.json`・lockfile・CI・frontend.md「4. テスト」・`pr-review-cycle`はTASK-019・TASK-021・TASK-022も変える
  （[タスク索引](../tasks/README.md)）。先にマージされた変更とのコンフリクトに注意する。

## 14. Verification

### Manual

- 余白か色を意図的に変え、VRTが失敗して差分画像で変化を確認できること。
- `pnpm vrt:update`で更新した後、VRTが通ること。
- 同じコミットで連続3回実行して一致すること。
- 基準画像に実在の個人データ・音声由来の内容がないこと（目視）。

### Automated

- CIのVRTジョブ、既存の`pnpm check`・`pnpm type-check`・`pnpm test`。

## 15. Definition of Done

- タスクの確認可能な完了条件をすべて満たす。
- 既存のlint / type-check / testが通る。
- 実装内容を人間が説明できる。

## 16. Completion Record

- 状態: 2026-10-08 保留（下記の判断待ち）。
- 実装差異: なし（未実装）。
- 検証結果: 未実施（判断待ちのため）。
- 関連: [TASK-020](../tasks/TASK-020-visual-regression-test.md)。

## 未決定事項

既定値で決めたこと（質問しない）:

- 基準画像の保存場所は`apps/web/vrt/__screenshots__/`（git管理）、更新は`pnpm vrt:update`、比較は`pnpm vrt`。
- ブラウザはChromiumのみ（MVPの利用環境を広く比べるより、見た目の回帰を安定して検出することを優先）。
- locale `ja-JP`・timezone `Asia/Tokyo`、時刻は固定、animationは無効、基準画像のデータは架空のfixtureだけ。

### Q1. ツールと実行環境（OS）の固定

- 決めること: VRTに使うツールと、macOSとLinuxのフォント描画の差をなくす方法。
- 止まるもの: 依存の追加・CIのジョブ・実行コマンドのすべて。
- A: Playwrightの`toHaveScreenshot`を、ローカルもCIも公式Playwrightコンテナで実行する。追加はdev依存1つで
  外部サービスなし。ローカルにDocker（Docker Desktop / OrbStack等）が要る。
- B: Playwrightを使い、基準画像の作成・比較はCI（Linux）だけで行う。ローカルにDockerは不要だが、
  ローカルで差分を確かめられず、更新はCIのartifactを取り込む手間が出る。
- C: Storybook + Chromatic等のSaaS。Component単位で見られるが、外部サービスの契約・秘密情報・画面の
  送信が要り、依存も大きい（止まる条件の外部サービス・課金に当たる）。
- 推奨: A。完了条件「ローカルとCIで同じコマンド」を素直に満たし、外部へ画面を送らない。

### Q2. 認証・APIの用意とマイクの扱い

- 決めること: ログインが必要な画面とマイクが要る画面を、どう再現して撮るか。
- 止まるもの: `/day`・`/dots`・`/dots/$date`・`/record`・`/settings`を対象にできるか。
- A: Playwrightの`page.route`で`/api/v1/*`を架空のfixtureに差し替え（fixtureは契約のZod schemaで検証）、
  `getUserMedia`は初期化scriptで差し替えて録音前の状態だけ撮る。frontendだけで速く安定するが、
  Railsとの結合は見ない（それは見た目の検査の目的外）。
- B: Rails + PostgreSQLをseedのテストユーザーで立て、実際にログインして撮る。結合も通るが、CIに
  DB・Railsが要り遅く、VRTがbackendの変更でも落ちる。
- C: 認証の要らない画面（ホーム・ログイン等）だけを今回の対象にし、ログイン後の画面は後で決める。
  最小だが、Day・一覧・詳細・録音というタスクの主要画面が外れる。
- 推奨: A。見た目の回帰の検出に絞り、実行を速く安定させる。

### Q3. フォント（Google Fonts）の扱い

- 決めること: 外部から読むWebフォントで、撮影結果が揺れないようにする方法。
- 止まるもの: 「連続3回で一致」の完了条件と、CIでの安定性。
- A: VRTの中だけGoogle Fontsへの要求を差し替え、repositoryに置いた同じ書体のファイル（OFL）を返す。
  本番の配信は変えない。フォントファイル（数MB）がrepositoryに増える。
- B: 本番もフォントを自前で配信する（`@fontsource`等）。外部への要求がなくなりprivacy上も利点があるが、
  本番の配信・CSP・architectureの変更になり、このタスクの範囲を超える。
- C: VRTでもGoogle Fontsをそのまま読む。追加なしだが、ネットワーク次第で書体の読み込みが揺れ、
  失敗の原因が見た目の回帰か通信かを分けにくい。
- 推奨: A。本番を変えずに安定させる。Bは別の判断として将来候補に回せる。

### Q4. 対象の画面・幅と差分の許容値

- 決めること: 基準画像を持つ画面と状態・幅、どこまでの差を許すか。
- 止まるもの: specと基準画像の作成。
- A: 画面はホーム、ログイン、録音前（`/record`）、今日のDay（Dotあり・なし）、過去の一覧、日の詳細、設定。
  幅はスマートフォン（390px）とPC（1280px）の2つ（計14枚前後）。許容値は`maxDiffPixelRatio: 0`・
  色の閾値`threshold: 0.2`（Playwrightの既定）で、環境を固定する前提で1pxの差も失敗にする。
- B: Aと同じ画面・幅で、`maxDiffPixelRatio: 0.001`程度の小さな許容を置く。描画の微小な揺れに強いが、
  細い線・1pxの余白の崩れを見逃しうる。
- C: スマートフォンの幅だけ（7枚前後）。基準画像は少ないが、PC幅の崩れを検出できない。
- 推奨: A。静けさ・可読性に効く小さな崩れを検出することがこのタスクの目的で、揺れは環境とfixtureの固定で抑える。
  連続実行で揺れが出たら、その画面だけ原因を直すか、Bの許容を局所的に置く。

回答テンプレート:

```text
Q1: A
Q2: A
Q3: A
Q4: A（補足：〜）
```
