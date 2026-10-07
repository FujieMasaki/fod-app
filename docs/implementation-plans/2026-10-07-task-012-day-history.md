# Implementation Plan: TASK-012 今日のDay表示と丸いDot一覧・過去の詳細

## 1. Status

実施中（2026-10-07）。実装と自動の検証は済み。丸の見た目・読みやすさ・スクリーンリーダの確認は人間の確認待ち

## 2. Goal

本人のserverに保存されたDotを、Webで次のようにたどれるようにする。

- Day（`/day`）で今日のDotのうち最新の1件を大きく表示し、今日の記録がなければ未記録と録音への導線を示す。
- Dayから一覧（`/dots`）へ進み、記録のある日を1日=1つの丸として新しい順に見渡す。続きはボタンで読み込む。
- 丸を選ぶと日の詳細（`/dots/<date>`）でその日のDotを振り返る。同日に複数あれば録音時刻で切り替える。

## 3. Background

- 履歴のルールはTASK-004で決め（[`dot-history.md`](../dot-history.md) §2「MVPの履歴ルール」）、API契約は
  TASK-005（[`contracts/openapi.yaml`](../../contracts/openapi.yaml)の`history` tag）、Rails APIはTASK-008、
  Webの認証接続（`useAuth().request`）はTASK-007で済んでいる。画面だけが無く、利用者はserverのDotを見られない。
- TASK-004 Plan §26は、route構成と一覧の入口（「Dot」tabの有効化を含む）、丸の寸法・余白・見出し、選択状態と
  フォーカスの表現、続き取得の操作、読み込み中・失敗・0件の画面、アクセシブルな名前の文言、0件だった日の
  一覧の取り直しを本タスクに委ねている。

## 4. Current State

- Route: `/dot`・`/reflection`はSession Provider（memory）の`DotSession`（mockの`createDot`の結果）を1件だけ
  表示する。serverのDotを表示する画面は無い。
- `components/bottom-navigation`の「Dot」tabは非活性（`enabled: false`）。
- API: `GET /api/v1/days/today`・`GET /api/v1/days`・`GET /api/v1/days/{date}`はRailsに実装済み（TASK-008）。
  `date`の形が不正・存在しない暦日なら`422 validation_failed`、cursor不正は`400 cursor_invalid`。
- `libs/api-contract/schemas.ts`に`dotSchema`はあるが、`Today`・`DayList`・`DayDetail`のschemaは無い。
- Dotを作る入口（TASK-009・TASK-011）は未実装のため、今はserverにDotを作る画面の操作が無い。手動確認は
  開発DBへ直接作ったDotで行う。

## 5. Scope and Non-goals

対象:

- 履歴3endpointのZod schema、通信関数、TanStack QueryのHook。
- Day・一覧・日の詳細の画面、route、「Dot」tabの有効化。
- 状態の区別（履歴なし・読み込み中・一覧の失敗・続きの失敗・日の取得失敗・日の0件・URLの日付不正）。
- 関連する現行文書の更新。

対象外:

- Week / Month、検索・カテゴリ・期間フィルタ、任意の月へのジャンプ、丸を結ぶ線（dot-history §2・§3）。
- Dot本文の編集・ゴミ箱への移動・復元・完全削除の画面（TASK-014）。
- 録音・生成の実サービス接続、生成直後に保存済みDotをDayへ渡すこと（TASK-010・TASK-011）。mockの
  `/dot`・`/reflection`は変えない。
- 深掘り対話による更新後の表示（TASK-018）。

## 6. References and Documents to Update

参照:

- [`product.md`](../product.md) §2、[`dot-history.md`](../dot-history.md) §1・§2・§5、
  [TASK-004 Plan](2026-09-28-task-004-history-design.md) §20–§26、[TASK-008 Plan](2026-10-05-task-008-dot-history.md)、
  [TASK-007 Plan](2026-10-05-task-007-frontend-identity.md)
- [`contracts/openapi.yaml`](../../contracts/openapi.yaml)の`getToday`・`listDays`・`getDay`と`Today`・`DayList`・`DayDetail`
- [`architecture.md`](../architecture.md)、[`development/frontend.md`](../development/frontend.md)、
  [`design-system.md`](../design-system.md)、[`privacy.md`](../privacy.md)（表示する個人データの扱い）

同じ変更で更新する現行文書:

- `docs/dot-history.md`: 画面の実装状況、本Planで決めたroute・操作の要点。
- `docs/architecture.md`: routeと`features/history`、serverのDotをTanStack Queryで扱うこと。
- `docs/development/frontend.md` §2「保留」: 永続DotをTanStack Queryで扱うと決めたので、保留を解消する。
- `docs/product.md` §3の表: Dot履歴のWeb接続が済んだこと。

## 7. Proposed Approach

TASK-012に委ねられた判断は、次の既定値で実装する（TASK-004で決めた履歴ルールの範囲内の具体化で、
複数の有力案が拮抗するものではないため、PRの「確認すること」で人間に確かめてもらう）。

| # | 判断 | 採用 | 理由 |
| --- | --- | --- | --- |
| D1 | route | Day `/day`、一覧 `/dots`、日の詳細 `/dots/$date`。「Dot」tabを有効にして`/day`へ。mockの`/dot`・`/reflection`は残す | Dayが入口で一覧へ進む導線（dot-history §2）。`/dot`はmockの生成直後の画面で、置き換えるとmockの流れが壊れる（TASK-011が接続する） |
| D2 | 一覧の配置 | 年月の見出し（「2026年9月」、`h2`）ごとに5列のgrid。丸は48px（`--fod-space-8`）、中に日の数字。丸の下に「今日」・件数（「2件」）・「選択中」を補助テキストで添える | 375px幅で5列が収まり、1つのセルが最小44pxのタップ領域を超える。案F2（TASK-004 §25 Q2） |
| D3 | 選択とフォーカス | 一覧は最後に開いた日をURLの`?selected=<date>`で覚え、その丸に枠線と「選択中」のテキスト、`aria-current="true"`を付ける。フォーカスは`focus-visible`の輪郭線 | 戻ったときに現在地が分かる。色だけで示さない（dot-history §2「丸の表現」） |
| D4 | アクセシブルな名前 | 丸は「2026年9月28日のDot」に、必要に応じて「、今日」「、2件」「、選択中」を続ける | 複数年でも同名にならない |
| D5 | 続きの取得 | 一覧の末尾の「さらに前のDotを読み込む」ボタン。失敗したら取得済みの丸を残したまま、その場に失敗と再試行を出す | 自動読み込みより、失敗の位置と再試行が分かりやすく、キーボードでも同じ操作になる |
| D6 | 日の詳細 | 見出しに年月日。同日に複数あれば録音時刻（JST、`HH:mm`。読み込んだ中で重なるときだけ`HH:mm:ss`）のボタンを新しい順に並べ、選択中は枠線と`aria-pressed`。既定は先頭（最新）。続きは「この日の続きを読み込む」ボタン | 録音時刻のラベルで切り替え、既定は最新（dot-history §2「詳細」） |
| D7 | Dayの表示 | 「今日のDot」の見出し、日付、大きな丸（Dot primitive）、`sentence`と`summary`、話した長さ。同日に2件以上あれば「今日の記録をすべて見る（n件）」で今日の日の詳細へ。未記録なら「まだ今日のDotはありません」と「話す」（`/record`）。どちらも「過去のDotを見る」で一覧へ | 今日の最新を大きく（dot-history §2「Day」）。今日の残りのDotへも到達できる |
| D8 | 日の0件 | 「この日に振り返れるDotはありません」（`role="status"`、失敗の`role="alert"`と分ける）と一覧へ戻る導線。表示と同時に一覧と今日のqueryを取り直す | 取得失敗と区別し、古い一覧に丸を残さない（dot-history §2「状態の区別」） |
| D9 | URLの日付 | `/dots/$date`の`date`は`YYYY-MM-DD`かつ実在する暦日だけを受け、そうでなければ通信せず「この日付のDotは開けません」。serverの`422`も同じ表示 | URL由来の値は使う前に検証する（frontend.md §2） |
| D10 | 選んでいた記録が消えた | 日の詳細を取り直した結果、選んでいた録音が無くなっていたら、別の録音へ切り替えず「選んでいた記録は見つかりませんでした」と示し、残りの時刻から選ばせる | 取得できないDotを別のDotで代替表示しない |

実装の手順:

1. `libs/api-contract/schemas.ts`に`todaySchema`（`dot_count`で形が分かれる）・`dayListSchema`・`dayDetailSchema`を
   契約の型と完全一致させて足し、契約のexamplesのtestへ登録する。
2. `features/history/api.ts`に`getToday`・`listDays`・`getDay`を置く。`useAuth().request`を受け取って呼ぶ
   （CSRFの付与・`401`の扱いをAuth Providerに集めるため。frontend.md §2）。
3. `features/history/hooks/use-history.ts`に`useToday`（`useQuery`）・`useDayList`・`useDayDetail`（`useInfiniteQuery`、
   `next_cursor`をそのまま次のcursorに使う）、0件の日に一覧と今日を取り直す`useRefreshHistory`を置く。
4. `features/history/date-format.ts`に、日付文字列（`YYYY-MM-DD`）の検証・年月日の表示・年月での区切り、
   `started_at`のJSTの時刻表示を置く。日付はserverの値を文字列のまま分解し、端末のタイムゾーンで変換しない。
5. 画面（`components/day-screen.tsx`・`day-list-screen.tsx`・`day-detail-screen.tsx`）をTailwindで組み、
   `router.tsx`へroute（`/dots`の`selected`・`/dots/$date`の`date`は検証してから渡す）を足し、「Dot」tabを有効にする。
6. 現行文書を更新する。

## 8. Why This Approach

- serverのDotは正本がserverで、取得・再取得・認証の切り替わりでの消去をTanStack Queryに任せられる（Auth Providerが
  認証以外のquery cacheを消す）。Session Providerへ同じ正本を置かない（frontend.md §2）。
- 一覧と日の詳細は契約どおりcursorでたどるので、`useInfiniteQuery`の`pageParam`にcursorを渡すだけで済み、
  Web側で日単位の集約をしない（dot-history §2「取得」）。
- 日の詳細はURLの日付をキーにし、queryも日付ごとに分ける。素早く別の日へ切り替えても、前の日の応答が
  今の日の表示へ入らない。
- 機能は`features/history`に閉じ、`router.tsx`は組み合わせとURL値の受け渡しだけにする。

## 9. Data Flow

```text
User（Dot tab / 丸 / 録音時刻 / 続きを読み込む）
↓
DayScreen / DayListScreen / DayDetailScreen（features/history/components）
↓
useToday / useDayList / useDayDetail（TanStack Query。正本はserver、cacheはquery key ["history", <user id>, ...]）
↓
getToday / listDays / getDay（features/history/api.ts）→ useAuth().request → apiRequest → Rails API
↓                                       （Zodで検証。失敗はApiErrorのkindとcodeで分ける）
query cache（認証の終了・利用者の切り替わりでAuth Providerが消す）
↓
UI（丸・日付テキスト・選択中の枠線とテキスト・各状態の表示）

日の詳細が0件 → useRefreshHistory → ["history",<user id>,"days"]・["history",<user id>,"today"]を取り直す → 一覧から丸が消える
選択中の日（一覧）→ URLの ?selected（route内の表示状態。個人データの本文は持たない）
選んだ録音（詳細）→ 画面のstate（Dotのid。unmountで消える）
```

## 10. Files to Change

レビュー対象は合計で約24ファイルになるため、2つのPRに分ける。統合ブランチは
`feat/task-012-day-history-integration`（メインのPR: base `main`、draft）。

PR 1/2 `feat/task-012-1-history-data`（base: 統合ブランチ）— 履歴の取得（schema・通信・Hook・日付の整形）。約10ファイル

| ファイル | 新規/変更 | 役割 |
| --- | --- | --- |
| `docs/implementation-plans/2026-10-07-task-012-day-history.md` | 新規 | 本Plan |
| `docs/tasks/TASK-012-frontend-day-history.md` | 変更 | 状態・Planへのリンク |
| `apps/web/src/libs/api-contract/schemas.ts` | 変更 | `Today`・`DayList`・`DayDetail`のschema |
| `apps/web/src/libs/api-contract/schemas.test.ts` | 変更 | 契約のexamplesで検証する対象に追加 |
| `apps/web/src/features/history/api.ts` | 新規 | 通信関数 |
| `apps/web/src/features/history/hooks/use-history.ts` | 新規 | query・infinite query・0件の取り直し |
| `apps/web/src/features/history/hooks/use-history.test.tsx` | 新規 | cursorの受け渡し・失敗の区別・日付ごとのcache・取り直し |
| `apps/web/src/features/history/date-format.ts` | 新規 | 日付の検証・表示・JSTの時刻 |
| `apps/web/src/features/history/date-format.test.ts` | 新規 | 日付境界・年の切り替わり・時刻の重なり |
| `apps/web/src/features/history/index.ts` | 新規 | 公開API |

PR 2/2 `feat/task-012-2-history-screens`（base: PR 1のブランチ）— 画面・route・文書。約14ファイル

| ファイル | 新規/変更 | 役割 |
| --- | --- | --- |
| `apps/web/src/features/history/components/day-screen.tsx` | 新規 | Day |
| `apps/web/src/features/history/components/day-list-screen.tsx` | 新規 | 一覧 |
| `apps/web/src/features/history/components/day-detail-screen.tsx` | 新規 | 日の詳細 |
| `apps/web/src/features/history/components/history-status.tsx` | 新規 | 読み込み中・失敗・再読み込みの案内（3画面で共通） |
| `apps/web/src/features/history/components/history-screens.test.tsx` | 新規 | 各状態・選択・続き・0件の取り直し |
| `apps/web/src/features/history/index.ts` | 変更 | 画面のexport |
| `apps/web/src/router.tsx` | 変更 | `/day`・`/dots`・`/dots/$date` |
| `apps/web/src/components/bottom-navigation/bottom-navigation.tsx` | 変更 | 「Dot」tabを有効にする |
| `docs/dot-history.md` | 変更 | 画面の実装状況 |
| `docs/architecture.md` | 変更 | routeと`features/history` |
| `docs/development/frontend.md` | 変更 | 永続Dotの扱いの保留を解消 |
| `docs/product.md` | 変更 | Web接続の状況 |
| `docs/implementation-plans/2026-10-07-task-012-day-history.md` | 変更 | Completion Record |
| `docs/tasks/TASK-012-frontend-day-history.md` | 変更 | 完了条件・状態 |

## 11. Libraries / APIs

- TanStack Query（既存）: `useQuery`・`useInfiniteQuery`・`invalidateQueries`。cursorの続き取得とcache・再取得に使う。
- TanStack Router（既存）: route・path parameter・search parameter（`validateSearch`）。
- `Intl.DateTimeFormat`（`timeZone: "Asia/Tokyo"`）: `started_at`の時刻の表示。端末のタイムゾーンに依存させない。
- 新しいdependencyは追加しない。

## 12. Alternatives Considered

- 一覧の続きを自動読み込み（IntersectionObserver）にする案: 読み込みの失敗位置と再試行が分かりにくく、
  キーボード・スクリーンリーダで続きの存在が伝わりにくいため採らない。
- 詳細を一覧と同じ画面に開く案（下に展開）: 狭い画面で一覧と本文が入れ子になり、現在地が見出しで示しにくい。
- `/dot`をDayへ置き換える案: mockの生成直後の流れ（`/processing`→`/dot`）がserverの今日を表示して壊れる。
  TASK-011で生成をserverへ接続するときに、生成後の画面とDayをどう繋ぐかを決める。
- 選んだ録音をURLに持つ案: 共有・再読み込みでの復元が利点だが、URL値の検証と存在しないidの扱いが増える。
  MVPの要件（日を開けばすべてのDotへ到達できる）は画面のstateで満たせる。

## 13. Risks / Things to Watch

- 日付: `YYYY-MM-DD`を`new Date()`へ渡すとUTCとして解釈され、端末によって前日になる。文字列のまま分解する。
- 「今日」の判定はserverの`today`・`date`を使い、端末の時計を使わない（0:00 JST前後で端末とserverがずれても
  今日を取り違えない）。
- 競合: 日を素早く切り替えても、queryが日付ごとに分かれるので前の日の結果を表示しない。詳細のComponentは
  日付で`key`を付けて、選んだ録音のstateを持ち越さない。
- 続きの取得の失敗で、TanStack Queryは取得済みのpagesを保つ。失敗の表示は`isFetchNextPageError`で、一覧全体の
  失敗（`isError`かつpagesが無い）と分ける。
- 0件の取り直し: 一覧はunmountされているので、`refetchType: "all"`で非活性のqueryも取り直す。
- 認証: 取得は`useAuth().request`を通し、利用者の切り替わりで消えるquery cacheにだけ本文を置く。query keyに
  利用者のidを含める（`["history", <user id>, ...]`）。Auth Providerがcacheを消すのは切り替わりを描画した後のeffectで、
  表示中のobserverは消されたqueryの結果を持ち続けるため、keyが同じだと別タブでの切り替わりの後に前の利用者のDotが
  見え得る（PR #75のレビューで指摘され、testで再現した）。
- cursor: TanStack Queryの取り直しは2ページ目以降のcursorを新しいpageから計算し直すため、通常`400 cursor_invalid`は
  起こらないが、古い画面のまま続きを読み込んだ・serverのcursorの形式が変わった場合に備え、契約（CursorInvalid）どおり
  そのqueryを先頭から取り直す。やり直しても直らない失敗（serverが理由を
  返したもの・schemaの不一致）は自動でretryしない。
- 個人データ: Dotの本文をURL・storage・logへ出さない。URLに出すのは日付だけ。

## 14. Verification

### Manual

- 開発DBに本人のDotを作り（今日あり/なし、同日2件、0:00 JST前後、記録のない日をはさむ、30日超、別の年）、
  Day→一覧→詳細をたどる。
- 一覧を開いたまま別のタブでその日のDotをすべてゴミ箱へ入れ、古い一覧から丸を選ぶ。0件が示され、一覧へ
  戻るとその日の丸が消えている。
- 狭い画面（375px）、キーボードだけの操作、スクリーンリーダでの丸の名前、選択中の枠線とテキスト。

### Automated

- Unit: `date-format`（日付の検証、年月の区切り、JSTの時刻、重なるときの秒）。
- Hook: cursorの受け渡し、続きの失敗で取得済みを保つ、日付ごとのcache、0件の取り直し。
- Component: Dayの今日あり/なし/失敗、一覧の空・読み込み中・失敗・続きの失敗・選択中、詳細の複数録音の切り替え・
  0件・取得失敗・不正な日付・`schema`の失敗・素早い切り替え。
- schema: 契約のexamples（`TodayRecorded`・`TodayNotRecorded`・`DayListFirstPage`・`DayListEmpty`・`DayDetailTwoDots`・
  `DayDetailNoDotsLeft`）が通ること、型の完全一致。

## 15. Definition of Done

- TASK-012の完了条件を満たす。
- `pnpm` のlint・型検査・testと品質ゲートが通る。
- 主要操作を手動で確かめるか、確かめられない項目をPRの「確認すること」に残す。
- 変更を人間が説明できる。

## 16. Completion Record

- 状態: 実装・自動の検証が済み、人間の確認待ち（2026-10-07）。完了条件2（色・サイズに頼らない判別と表現）は
  実browserでの見た目・スクリーンリーダの確認が要るため`[ ]`のまま残し、TASK-012はIn progressのままにする。
- 実装差異:
  - `docs/journaling.md`も更新した（§1の表と§3「モックと実サービスの区別」に「Webは履歴の取得APIに接続していない」と
    書いてあり、実装と食い違うため）。PR 2/2のファイル数は14から15になり、上限内。
  - 取得を拒否された（`403 email_unconfirmed`）ときは、メールアドレスの確認を案内する文言にした（契約のForbidden）。
  - 0件の表示の補足は、取り直しが失敗し得るため「一覧を新しくしました」と言い切らず、ゴミ箱へ移したか削除した
    可能性だけを示す（self-reviewでの修正）。
  - `features/history/index.ts`は画面と`isCalendarDate`だけを公開し、Hookは公開しない（使うのが同じfeatureの画面だけのため）。
- 検証結果:
  - `pnpm lint`（eslint・命名・redocly・`check:api-types`）、`pnpm type-check`、`pnpm test`（scripts 173件・web 386件）、
    `pnpm build`がすべて通った。
  - 追加したtest: 契約のexamples（Today・DayList・DayDetail）と制約値、`date-format`（実在しない暦日、年の切り替わり、
    0:00 JSTの前後、分が重なるときの秒）、Hook（cursorの受け渡し、続きの失敗で取得済みを保つ、前の日の遅れた応答を
    今の日として返さない、0件で閉じている一覧と今日を取り直す、失敗を0件として扱わない）、画面（Dayの今日あり/なし/
    失敗、一覧の見出し・今日・件数・選択中の名前と`aria-current`、開いた日をURLに残して進む、続きの成功・失敗と再試行・
    最後の表示、空と失敗の区別、schemaの失敗で再読み込み、詳細の録音時刻での切り替え・続き・0件と一覧の丸が消えること・
    失敗と再試行・`403`・実在しない日付で通信しない・`422`）。
  - 開発DB（`focus_on_dot_api_development_task_012`）に、今日2件・0:00 JSTをまたいだ朝の録音・前年の同じ月日・
    40日分の過去のDotを作り、Rails（`bin/rails server`）へloginして`GET /api/v1/days/today`・`/days`・
    `/days?cursor=…`（42日が30日+12日に分かれ、`next_cursor: null`で終わる）・`/days/2026-09-28`（UTCでは前日の
    録音が同じ日に入る）・`/days/2026-02-30`（`422`）を取得し、応答がすべてWebのZod schemaで通ることを一時的なtestで
    確かめた（testはコミットしていない）。
  - 未実施: 実browserでの画面の操作・見た目（丸の大きさ・余白・枠線とフォーカスの見分け・375px幅・コントラスト）、
    キーボードだけの操作、スクリーンリーダの読み上げ、別のタブでゴミ箱へ入れてから古い一覧の丸を選ぶ操作。
    このセッションにbrowserを操作する手段が無く、ゴミ箱へ入れる画面（TASK-014）・APIも未実装のため（0件の経路は
    component testで確かめた）。PRの「確認すること」に入れた。
- 関連: メインのPR #74。TASK-011（生成直後のDotをDayへ渡す）、TASK-014（ゴミ箱・編集の画面）。
