# Implementation Plan: 画面のスナップショット比較（VRT）を導入する（TASK-020）

## 1. Status

実装済み（2026-10-08）。Q1〜Q4はすべて推奨のAで人間が判断した（「未決定事項」）。判断の前の保留の記録は
コミット`0984827`にある。

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
  Storybook等のComponent単位のカタログ、本番のフォント配信の変更（Q3のB）。
- 品質ゲート（Stop hook）とpre-pushにはVRTを入れない。Dockerを前提にできない環境（定期実行など）でも
  既存の検査を回せるようにするため。UI変更時は`pr-review-cycle`の手順でローカルの`pnpm vrt`を求め、
  CIの`VRT`ジョブを必須にして取りこぼさない。

## 6. References and Documents to Update

- 参照: [design-system.md](../design-system.md)、[frontend.md](../development/frontend.md)「4. テスト」、
  [privacy.md](../privacy.md)、[architecture.md](../architecture.md)、[PRの分割](../development/pull-requests.md)、
  [mizchi「AIコーディングのループと形式手法」](https://zenn.dev/mizchi/articles/ai-coding-loop-formal)。
- 更新: frontend.md「4. テスト」、`.claude/skills/pr-review-cycle/SKILL.md`、
  `.claude/skills/human-review-artifact/SKILL.md`、README（CIの表）。architecture.mdは、アプリの構成・
  データの流れを変えないため更新しない。privacy.mdは、実データを扱わず外部へ何も送らないため更新しない。

## 7. Proposed Approach

1. `apps/web`に`@playwright/test`（1.63.0に固定）を入れ、設定を`apps/web/playwright.config.ts`、specと補助を
   `apps/web/vrt/`に置く。Vitestの対象（`src/**`）と分ける。
2. 実行環境を公式のPlaywrightコンテナ（`mcr.microsoft.com/playwright:v1.63.0-noble`）に固定する。
   `scripts/vrt.sh`がイメージのタグを`@playwright/test`のバージョンから作り、リポジトリをmountして実行する。
   node_modulesはLinux用に入れ直すため、checkoutごとのDocker volumeに置く（手元のmacOS用のものは使わない）。
   設定ファイルは環境変数`FOD_VRT_CONTAINER=1`がないと止まり、コンテナの外で実行できない。
3. 認証・APIは`page.route`で`/api/v1/*`を`apps/web/vrt/fixtures.ts`の応答に差し替える。fixtureは架空の
   データで、契約のZod schemaで検証してから使う。fixtureのないAPIやGET以外の要求は失敗として記録し、
   撮影後に空であることを確かめる。
4. フォントは、Google Fontsへの要求を`page.route`で`@fontsource/zen-kaku-gothic-new`・`@fontsource/zen-old-mincho`
   （devDependencies、OFL、5.3.0に固定）のCSSとwoff2へ差し替える。`index.html`の`family`と`wght`から読む
   ファイルを決め、対応するファイルがなければ失敗させる。撮影前に`document.fonts.ready`を待つ。
5. 不安定な要素を止める: `page.clock.setFixedTime`で`Date`を2026-09-28 10:00 JSTに固定（timerは動かす）、
   `reducedMotion: "reduce"`と`animations: "disabled"`、caretを隠す、locale・timezoneを`ja-JP`・`Asia/Tokyo`に固定、
   自分のdev server以外への通信を止める。
6. マイクは`getUserMedia`を応答しないPromiseに差し替える。録音画面は許可を待つ状態（経過時間00:00）で止まり、
   実際のマイクには触れない。
7. 基準画像を`apps/web/vrt/__screenshots__/<mobile|desktop>/<画面>.png`にgitで保存する。比較は`pnpm vrt`、
   更新は`pnpm vrt:update`。
8. CIに`VRT`ジョブを足す（web変更時だけ、`scripts/vrt.sh`をそのまま実行）。失敗したらHTML report（期待・実際・
   差分の画像）を`vrt-report` artifactとして14日残す。`CI Gate`でwebの変更時に必須にする。
9. `pr-review-cycle`の1-5に、画面の見た目に関わる変更で`pnpm vrt`を実行し、基準画像を更新したら「確認すること」に
   挙げる手順を加える。`human-review-artifact`に、変えた基準画像の変更前・変更後をガイドの「確認すること」へ
   並べる手順を加える。
10. frontend.md「4. テスト」にVRTの対象・更新手順と、PlaywrightはVRTのためでE2E基盤の保留とは別であることを書く。

## 8. Why This Approach

- コンテナで固定する（Q1のA）: 完了条件「ローカルとCIで同じコマンド」を満たし、macOSとLinuxの文字の描画の
  違いを基準画像に持ち込まない。外部サービスへ画面を送らない。
- APIをfixtureに差し替える（Q2のA）: 見た目の回帰の検出に絞り、Railsとの結合の失敗でVRTが落ちないようにする。
  契約のschemaで検証するので、契約から外れた見た目を基準にしない。
- フォントをVRTの中だけ差し替える（Q3のA）: 本番の配信を変えずに、通信の状態で書体が揺れないようにする。
- 1pxの差も失敗にする（Q4のA）: 静けさ・可読性に効く小さな崩れを検出する。揺れは環境とfixtureの固定で抑える。

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

合計19ファイル（lockfile・基準画像は数えない）のため1つのPR（ブランチ`test/task-020-visual-regression`、base `main`）。

- 新規: `apps/web/playwright.config.ts`、`apps/web/vrt/screens.spec.ts`、`apps/web/vrt/support.ts`、
  `apps/web/vrt/fixtures.ts`、`scripts/vrt.sh`
- 変更: `package.json`、`apps/web/package.json`、`.gitignore`、`.github/workflows/ci.yml`、`scripts/ci-gate.mjs`、
  `scripts/ci-gate.test.mjs`、`scripts/ci-changes.mjs`、`scripts/ci-changes.test.mjs`、`README.md`、
  `docs/development/frontend.md`、`.claude/skills/pr-review-cycle/SKILL.md`、`.claude/skills/human-review-artifact/SKILL.md`、
  本Plan、タスクファイル
- 数えない: `pnpm-lock.yaml`、`apps/web/vrt/__screenshots__/`（16枚）

## 11. Libraries / APIs

- `@playwright/test` 1.63.0: `toHaveScreenshot`による比較、`page.route`（API・フォント・外部通信の差し替え）、
  `page.clock.setFixedTime`、`webServer`（Vite dev server）。1.64.0は公開から日が浅く、pnpmの
  `minimumReleaseAge`の除外が必要になるため選ばなかった（除外を足さない）。
- `@fontsource/zen-kaku-gothic-new`・`@fontsource/zen-old-mincho` 5.3.0（OFL-1.1）: 本番と同じ書体のwoff2を、
  VRTの中だけで返す。
- 公式のPlaywrightコンテナ`mcr.microsoft.com/playwright:v1.63.0-noble`（Node.js 24、Chromium同梱）。

## 12. Alternatives Considered

「未決定事項」の各QのB・Cに記載した。実装中に選んだものは次のとおり。

- フォントファイルをリポジトリに置く（Planの当初の書き方）ではなく、devDependenciesの`@fontsource`から読む。
  日本語の書体は5つの太さで数十MBになり、gitの履歴に残すと重いため。lockfileのintegrityで中身が固定され、
  `pnpm install`の後は通信なしで返せるため、Q3のA（本番を変えずVRTの中だけ差し替える）の範囲に収まる。
- 録音画面はマイクの許可を待つ状態で撮る。`getUserMedia`を失敗させると無音のモードで経過時間のtimerが動き、
  撮るたびに表示が変わりうるため。
- `page.clock.install`・`pauseAt`でtimerまで止める方法は採らない。React Queryの通知がsetTimeoutを使うため、
  止めると読み込み中のまま描画されない。
- CIの`VRT`ジョブは`install-node-deps`を使わない。依存はコンテナの中で入れ直すため、手元に入れても使わない。

## 13. Risks / Things to Watch

- `@playwright/test`のバージョンを上げるときは、基準画像を`pnpm vrt:update`で作り直し、差分が描画エンジンの
  違いだけであることを確かめる（Chromiumの更新で文字の描画が変わりうる）。イメージのタグはscriptが
  package.jsonから作るので、ずれない。
- Dependabotがnpmの依存を更新すると、`@playwright/test`や`@fontsource`の更新PRでVRTが落ちうる。その場合は
  上と同じく基準画像を作り直す。
- 画面が新しいAPIを呼ぶようになると、fixtureがないためVRTが失敗する。そのときは`fixtures.ts`に架空の応答を足す。
- 基準画像はバイナリのため、リポジトリが少しずつ大きくなる（現在16枚で約520KB）。画面と幅の数を絞る。
- `package.json`・lockfile・CI・frontend.md「4. テスト」・`pr-review-cycle`はTASK-019・TASK-021・TASK-022も変える
  （[タスク索引](../tasks/README.md)）。先にマージされた変更とのコンフリクトに注意する。
- CIのコンテナはrootで動くため、作られた`test-results`・`report`はrootの持ち物になる。GitHubのrunnerは
  毎回作り直されるため問題にならない。

## 14. Verification

### Manual

- 余白を意図的に変え（`day-screen.module.css`の`.header`の`gap-1`→`gap-2`）、VRTが失敗して差分画像で変化を確認できること。
- `pnpm vrt:update`で更新した後、VRTが通ること。
- 同じコミットで連続3回実行して一致すること。
- 基準画像に実在の個人データ・音声由来の内容がないこと（目視）。

### Automated

- CIの`VRT`ジョブ、既存の`pnpm check`・`pnpm type-check`・`pnpm test`・`pnpm build`。

## 15. Definition of Done

- タスクの確認可能な完了条件をすべて満たす。
- 既存のlint / type-check / testが通る。
- 実装内容を人間が説明できる。

## 16. Completion Record

- 状態: 2026-10-08 実装済み。タスクの完了条件はすべて満たした（下記）。人間のレビューで確認すること:
  基準画像16枚の内容、フォントの取得元を`@fontsource`にした実装差異、CIの`VRT`ジョブの所要時間。
- 実装差異:
  - フォントはリポジトリに置かず、devDependenciesの`@fontsource`（5.3.0固定）から返した（12の理由）。
  - 録音画面は「録音前」ではなく「マイクの許可待ち」の状態を撮った。現在の`/record`は開くと録音を始め、
    録音前の説明の画面はまだない（TASK-010）。説明の画面ができたら対象に加える。
  - 画面は7つで、今日のDayを2つの状態で撮るため、基準画像は8状態×2幅の16枚。
  - `@playwright/test`は1.63.0（11の理由）。
- 検証結果（2026-10-08、ローカルのmacOS + Docker Engine 20.10.22）:
  - `pnpm vrt:update`: 16枚を作成。
  - `pnpm vrt`を連続3回: 3回とも`16 passed`。
  - 余白を変えた変更: day・day-emptyの4件が失敗（例: `4745 pixels (ratio 0.02 of all image pixels) are different`）、
    `test-results`に`day-expected.png`・`day-actual.png`・`day-diff.png`が出た。戻した後は`16 passed`。
  - 基準画像16枚を目視し、fixtureの架空の文章とテスト用のアドレス（`vrt@example.com`）だけが写っていることを確認した。
  - `pnpm type-check`・`pnpm build`・新しいファイルへの`eslint`: 通過。`pnpm test:scripts`: 210件通過。
  - CIの`VRT`ジョブ: PRで確認する（未実施）。
- 関連: [TASK-020](../tasks/TASK-020-visual-regression-test.md)。

## 未決定事項

なし。Q1〜Q4は2026-10-08に人間がすべてAと判断した（判断の材料として、以下を当時のまま残す）。

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
