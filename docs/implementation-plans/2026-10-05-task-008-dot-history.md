# TASK-008 利用者別Dot保存と履歴取得API Implementation Plan

## 1. Status

完了（2026-10-05）。機械のレビューの結果は各サブのPRに記録する。

## 2. Goal

serverをDotの正本にし、利用者ごとに複数のDotを永続保存して、Day・日単位の一覧・日の詳細から
取得できるようにする。本人は`sentence`と`summary`を編集できる。ゴミ箱の中のDotは、明示的なscopeで
Day・一覧・詳細から外す。

利用者から見ると、TASK-012（画面）が使うAPIがそろい、過去の任意のDotまで到達できるようになる。
Dotを作る入口（音声の送信と生成）はTASK-009が作り、本タスクが用意するmodelへ保存する。

## 3. Background

- TASK-004で履歴のルール（録音1回=1件、`started_at`から算出したAsia/Tokyoの`date`、新しい順、
  cursor、0件と取得失敗の区別）を採用した（[dot-history.md §2](../dot-history.md)）。
- TASK-005でendpoint・schema・error codeを契約にした（[`contracts/openapi.yaml`](../../contracts/openapi.yaml)）。
- TASK-006で`current_user`・CSRF・Problemの応答を実装した。保護するendpointは
  `before_action :authenticate_user!`を使い、所有者は`current_user`だけから決める。
- TASK-004 Plan §26で、DBのデータ構造と索引、`date`の算出位置、同日集約のquery、保存失敗時の
  整合性、testの範囲を本タスクが決めると引き継いだ。

## 4. Current State

- 開始時点はmain `7a62614`（PR #53まで）。
- Rails 8.1.3.1、PostgreSQL 17（ローカル）。tableは`users`・`user_identities`・`rate_limit_counters`だけで、
  `dots`はない。routeは認証のendpointだけ。
- Webは現在のDot 1件をlocalStorageに置くmockのまま（TASK-011/012で接続する）。
- `ProblemDetails`に`cursor_invalid`が無い。`JsonParams`は必須の文字列だけを扱う。
- `filter_parameters`にDotの本文（`sentence`・`summary`）が入っていない。

## 5. Scope and Non-goals

### 対象

- `dots` table・`Dot` model（所有者・`generation_id`・`started_at`・`date`・`duration_seconds`・
  `sentence`・`summary`・`trashed_at`）と、DBの制約・索引
- ゴミ箱の外・中を表す明示的なscope（`Dot.kept`・`Dot.trashed`）。`default_scope`は使わない
- `GET /api/v1/days`（日単位の一覧）、`GET /api/v1/days/today`（Day）、`GET /api/v1/days/{date}`
  （日の詳細）
- `PATCH /api/v1/dots/{dot_id}`（`sentence`・`summary`の編集）
- 不透明なcursorの発行と検証、`cursor_invalid`の応答
- Dotの本文をrequestのログから外す（`filter_parameters`）
- 関連する現行文書（architecture・dot-history・journaling・product）への実装済み範囲の反映

### 対象外

- Dotを作るendpoint（`POST /api/v1/dots`）・録音attempt・処理の記録・生成Job（TASK-009）。
  本タスクは、TASK-009が保存に使う`Dot` modelと制約までを用意する。
- ゴミ箱へ移す・ゴミ箱の一覧・復元・完全削除のendpointと、7日後の削除処理（TASK-013。
  [TASK-013](../tasks/TASK-013-backend-data-deletion.md)の作業範囲に明記されている）。本タスクは
  `trashed_at`の列と、ゴミ箱の中を外すscopeを用意し、「ゴミ箱へ移すと消え、戻すと戻る」ことを
  `trashed_at`を直接書き換えてAPIのtestで確かめる。
- 退会中の`409 account_deletion_in_progress`（退会の状態を持つ列がまだ無い。TASK-013で足すときに、
  本タスクのendpointへも適用する）。
- 画面（TASK-012）。

### 今回確定しない事項

- なし（下記§12の判断はすべて上流の決定から導けるため、人間の判断を求めない）。

## 6. References and Documents to Update

参照:

- [dot-history.md §2](../dot-history.md)、[journaling.md §2・§4](../journaling.md)、[product.md §2](../product.md)、
  [privacy.md §5](../privacy.md)
- [architecture.md](../architecture.md)「音声・文字起こしの経路と保持」「生成の実行方式」
- [`contracts/openapi.yaml`](../../contracts/openapi.yaml)・[`contracts/README.md`](../../contracts/README.md)
- [backend.md](../development/backend.md)・個人規約の`rails-conventions.md`
- [TASK-004 Plan §25・§26](2026-09-28-task-004-history-design.md)、[TASK-005 Plan §7](2026-10-01-task-005-api-contract.md)
- [docs/code-review/backend/](../code-review/backend/README.md)

更新する現行文書（3番目のPR）:

- `docs/architecture.md`: 「実装済み」へ`dots`と履歴・編集のAPIを足す。ゴミ箱の除外の実現方法
  （TASK-008で確定）を書く。
- `docs/dot-history.md`: 「MVPの履歴ルール（未実装）」のうち、serverの取得を実装済みにする。
- `docs/journaling.md`: §3の「Dot保存は実装されていない」を、保存先と取得・編集のAPIがあることへ直す。
- `docs/product.md` §3: 「設計採用・未実装」のうち、Dotの保存・取得・編集のRails側を実装済みにする。

## 7. Proposed Approach

### 7-1. データ構造（`dots`）

| 列 | 型 | 制約 | 理由 |
| --- | --- | --- | --- |
| `id` | uuid | 主キー（`gen_random_uuid()`） | 契約の識別子はUUID v4。連番を出さない |
| `user_id` | uuid | NOT NULL、FK（`users`、`on_delete: :cascade`） | 所有者の正本。`user_identities`と同じく、利用者の行が消えれば残さない |
| `generation_id` | uuid | NOT NULL、`(user_id, generation_id)`でunique | 処理ID（＝冪等性key＝録音attemptの識別子）を行へ引き継ぐ（architecture「生成の実行方式」）。同じ処理から2件目のDotを作らない |
| `started_at` | timestamp(6)（UTC） | NOT NULL | 録音開始操作をserverが受理した時刻。値はTASK-009がattemptから渡す |
| `date` | date | **生成列**（`started_at`からAsia/Tokyoの暦日をDBが算出） | `started_at`と食い違う`date`を作れなくする。保存時刻・clientの値を根拠にしない |
| `duration_seconds` | integer | NOT NULL、CHECK 1〜1800 | 契約の`duration_seconds` |
| `sentence` | text | NOT NULL、既定`""`、CHECK 200文字以下 | 空文字を許す（契約） |
| `summary` | text | NOT NULL、既定`""`、CHECK 2,000文字以下 | 同上 |
| `trashed_at` | timestamp(6) | NULL可 | NULLがゴミ箱の外。TASK-013がゴミ箱の操作で使う |
| `created_at`・`updated_at` | timestamp(6) | NOT NULL | Rails標準。日付・並びの根拠には使わない |

索引:

- `(user_id, generation_id)` unique
- `(user_id, date, started_at, id)` **部分索引（`WHERE trashed_at IS NULL`）**。一覧の日単位の集約、
  Dayの今日、日の詳細の並び（`started_at`降順・`id`降順）をこの1本で引く。

文字数の上限はmodelのvalidationとDBのCHECKの両方に置く。APIを通らない保存（TASK-009のJob）でも
上限を超えたDotを残さないため。

### 7-2. model

- `Dot belongs_to :user`、`User has_many :dots`。
- scope: `kept`（`trashed_at IS NULL`）、`trashed`（`trashed_at IS NOT NULL`）、`newest_first`
  （`started_at DESC, id DESC`）、`on_date(date)`。**取得する場所ごとに`kept`を明示する。**
  `default_scope`は使わない（architecture。暗黙の除外は、ゴミ箱の中が一覧へ漏れる事故と、ゴミ箱が
  空に見える事故の両方を起こしやすい）。
- `Dot.date_for(time)`: Asia/Tokyoの暦日（今日の判定に使う）。DBの生成列と同じ規則で、testで両者の
  一致を確かめる。
- validation: `started_at`・`generation_id`・`duration_seconds`（1〜1800の整数）の必須、`sentence`・
  `summary`の文字数（空文字を許す）。`date`は生成列なので代入しない（読み取り専用）。

### 7-3. cursor（`HistoryCursor`）

- 不透明な文字列にする。中身は`v1:<値>`をBase64url（paddingなし）にしたもの。Webは解釈しない（契約）。
- 一覧: `v1:<最後に返した日のdate>`。続きは`date < その日`。日単位なので、ページの境界で同日が
  分断されない（dot-history §2）。
- 日の詳細: `v1:<date>:<最後に返したDotのstarted_at（マイクロ秒）>:<id>`。続きは
  `(started_at, id) < (値)`の行の比較。cursorに`date`を含め、別の日のcursorを使い回したら
  `400 cursor_invalid`にする。
- 解釈できない値・512文字を超える値・形式の違うcursorは`400 cursor_invalid`（Webは先頭から取り直す）。
- cursorは利用者を含まない。他人のcursorを作れても、queryは常に`current_user.dots`の中だけを引くため、
  他人のDotには届かない。

### 7-4. 取得のquery（`DayList`・`DayDots`）

controllerから呼ぶ小さなServiceに置く（集約とcursorの組み立てがactionの中で読み切れる大きさを超えるため。
[backend.md §1](../development/backend.md)の「推奨」）。

- `DayList.new(user:, cursor:, limit:).call`: `user.dots.kept`を`date`で`GROUP BY`し、`COUNT(*)`と
  `(array_agg(id ORDER BY started_at DESC, id DESC))[1]`（最新Dotのid）を`date`降順で`limit + 1`件引く。
  1件多く取れたら、返した最後の日から`next_cursor`を作る。
- `DayDots.new(user:, date:, cursor:, limit:).call`: `user.dots.kept.on_date(date).newest_first`を
  `limit + 1`件引き、同じ方法で`next_cursor`を作る。
- Day（today）: `user.dots.kept.on_date(今日)`の件数と`newest_first.first`。controllerで読み切れる
  ため、Serviceにしない。
- limit・cursorの既定と上限は契約（一覧は既定30・上限100、日の詳細は既定50・上限100）。

### 7-5. endpoint

| method / path | controller#action | 成功 | 主な失敗 |
| --- | --- | --- | --- |
| `GET /api/v1/days` | `days#index` | `200 DayList`（0件なら`items: []`） | `400 cursor_invalid`、`422 validation_failed`（`limit`） |
| `GET /api/v1/days/today` | `days#today` | `200 Today`（記録なしは`dot_count: 0`で`latest_dot`を省く） | — |
| `GET /api/v1/days/{date}` | `days#show` | `200 DayDetail`（0件でも`dots: []`） | `400`、`422`（`date`・`limit`） |
| `PATCH /api/v1/dots/{dot_id}` | `dots#update` | `200 Dot` | `404 not_found`（存在しない・他人・ゴミ箱の中）、`422 validation_failed` |

共通: `before_action :authenticate_user!`（未loginは`401`）、`Cache-Control: no-store`（既存の
`ApplicationController`）、PATCHはCSRF（既存）。

- `days/today`のrouteを`days/:date`より先に置く。`date`の形式はrouteの制約にせずcontrollerで確かめ、
  `422 validation_failed`（`field: date`、`invalid_format`）を返す。routeの制約にすると、契約に無い
  routingの`404`になるため。存在しない暦日（`2026-02-30`）も`422`。
- `limit`は`\A\d+\z`に合わなければ`invalid_format`、1〜100の外なら`out_of_range`。
- PATCHの入力（`DotUpdate`）: JSONのobjectで、`sentence`・`summary`だけを受け取る。
  - 項目が1つも無い → `422`（`field: body`、`required`）
  - それ以外の項目（`date`・`started_at`・`duration_seconds`を含む）→ `422`（その項目、`not_allowed`）。
    契約の「送られても無視せず`422`」。
  - 文字列でない（`null`・数値）→ `invalid_format`、上限超え → `too_long`。空文字は許す。
  - NUL文字（`\u0000`）を含む → `invalid_format`（PostgreSQLのtextに保存できず`500`になるため）。
  - 認可は`current_user.dots.kept.find(id)`。見つからなければ既存の`rescue_from`で`404`。
  - 編集前の値は保存しない（版・履歴の列もtableも作らない）。

### 7-6. response（serializer）

- `DotSerializer`: `id`・`date`（`YYYY-MM-DD`）・`started_at`（`Z`で終わるUTCのISO 8601。秒まで）・
  `duration_seconds`・`sentence`・`summary`だけを明示して返す。`user_id`・`generation_id`・
  `trashed_at`・作成更新時刻を返さない。
- 一覧・Day・日の詳細のresponseは、それぞれ契約の`DayList`・`Today`・`DayDetail`の形を組み立てる
  小さなserializerにする（追加のDB queryを発行しない）。

## 8. Why This Approach

- **`date`をDBの生成列にする。**`started_at`と`date`を別々に書ける形にすると、TASK-009のJobや
  将来の修正で食い違う行を作れてしまう。生成列なら、どの経路で保存しても`date`は`started_at`から
  決まり、日付境界（14:59:59.999999 UTCと15:00:00 UTC）の扱いもDBが1か所で決める。PostgreSQL 17で
  `((started_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::date`を生成列にできることを確認した。
  `date`の列があるので、同日の集約と日付キーの取得を索引で引ける。
- **部分索引でゴミ箱の外だけを索引する。**履歴の取得はすべてゴミ箱の外が対象で、`kept`を書き忘れると
  索引が効かず遅くなるだけでなく、testでゴミ箱の中が混ざることを確かめる。ゴミ箱の一覧の索引は
  TASK-013で必要になったときに足す。
- **cursorはkeyset（日付、または`started_at`とid）にする。**offsetは使わない（dot-history §2）。
  途中でDotが増えても減っても、続きをたどったときに欠落・重複が起きない。
- **Serviceは取得の2つだけ。**一覧の集約とcursorはactionの中で読み切れない。PATCHはmodelの
  validationと入力の検査だけで済むため、Serviceを作らない。
- 既存の`ProblemRendering`・`Authentication`・`JsonParams`・committeeの照合をそのまま使う。

## 9. Data Flow

```text
Web（TASK-012）
↓ GET /api/v1/days?cursor=…&limit=…（Cookie）
Rails: authenticate_user! → current_user
↓
DaysController#index → HistoryCursor.decode → DayList（current_user.dots.kept の日単位の集約）
↓
PostgreSQL dots（部分索引 user_id, date, started_at, id WHERE trashed_at IS NULL）
↓
DayListSerializer → 200（no-store）→ Webの一覧

PATCH /api/v1/dots/{id}（Cookie + X-CSRF-Token）
→ authenticate_user! → 入力の検査 → current_user.dots.kept.find(id) → update!
→ DotSerializer → 200（編集前の値はどこにも書かない）

TASK-009のJob → current_user相当の利用者.dots.create!(generation_id:, started_at:, duration_seconds:, sentence:, summary:)
→ DBが date を算出
```

正本はRDSの`dots`。Webは取得結果を表示に使うだけで、localStorageを正本にしない（TASK-011/012）。

## 10. Files to Change

レビュー対象は合計で約27ファイルになり、20を超えるため3つのサブのPRに分ける
（[PRの分割](../development/pull-requests.md#分け方)）。統合ブランチは`feat/task-008-dot-history-integration`。

### PR 1/3 `feat/task-008-1-dot-model`（base: 統合ブランチ）— Plan・データモデル（7ファイル）

| ファイル | 新規/変更 | 役割 |
| --- | --- | --- |
| `docs/implementation-plans/2026-10-05-task-008-dot-history.md` | 新規 | 本Plan |
| `docs/tasks/TASK-008-backend-dot-history.md` | 変更 | 状態とPlanへのリンク（数えない） |
| `apps/api/db/migrate/20261005000001_create_dots.rb` | 新規 | `dots`・制約・索引 |
| `apps/api/db/schema.rb` | 変更 | 生成（数えない） |
| `apps/api/app/models/dot.rb` | 新規 | 関連・validation・scope |
| `apps/api/app/models/user.rb` | 変更 | `has_many :dots` |
| `apps/api/spec/factories/dots.rb` | 新規 | test用のDot |
| `apps/api/spec/models/dot_spec.rb` | 新規 | 生成列の日付境界・制約・scope・追記 |
| `apps/api/config/initializers/filter_parameter_logging.rb` | 変更 | `sentence`・`summary`をログから外す |

### PR 2/3 `feat/task-008-2-history-api`（base: PR 1）— 履歴の取得API（約11ファイル）

| ファイル | 新規/変更 | 役割 |
| --- | --- | --- |
| `apps/api/app/services/history_cursor.rb` | 新規 | cursorの発行と検証 |
| `apps/api/app/services/day_list.rb` | 新規 | 日単位の一覧 |
| `apps/api/app/services/day_dots.rb` | 新規 | 日の詳細 |
| `apps/api/app/serializers/dot_serializer.rb` | 新規 | 契約の`Dot` |
| `apps/api/app/serializers/history_serializers.rb`相当 | 新規 | `DayList`・`Today`・`DayDetail` |
| `apps/api/app/serializers/problem_details.rb` | 変更 | `cursor_invalid`（400） |
| `apps/api/app/controllers/api/v1/days_controller.rb` | 新規 | 3つのGET |
| `apps/api/config/routes.rb` | 変更 | daysのroute |
| `apps/api/spec/services/history_cursor_spec.rb` | 新規 | cursorの往復・不正値 |
| `apps/api/spec/services/day_list_spec.rb`・`day_dots_spec.rb` | 新規 | 集約・並び・続きの欠落/重複 |
| `apps/api/spec/requests/api/v1/days_spec.rb` | 新規 | 認証・本人限定・0件・ゴミ箱・契約照合 |

### PR 3/3 `feat/task-008-3-dot-update`（base: PR 2）— 編集API・現行文書・完了の記録（約10ファイル）

| ファイル | 新規/変更 | 役割 |
| --- | --- | --- |
| `apps/api/app/controllers/api/v1/dots_controller.rb` | 新規 | PATCH |
| `apps/api/app/controllers/concerns/json_params.rb` | 変更 | 任意の文字列項目と、許可しない項目の検査 |
| `apps/api/config/routes.rb` | 変更 | dotsのroute |
| `apps/api/spec/requests/api/v1/dots_spec.rb` | 新規 | 本人限定・ゴミ箱・入力の検査・契約照合 |
| `docs/architecture.md`・`docs/dot-history.md`・`docs/journaling.md`・`docs/product.md` | 変更 | 実装済み範囲の反映 |
| 本Plan・タスクファイル | 変更 | Completion Record・完了条件 |

## 11. Libraries / APIs

新しいdependencyは追加しない。

- PostgreSQLの生成列（`GENERATED ALWAYS AS (...) STORED`）。Railsは`t.virtual ..., stored: true`で
  migrationとschema.rbに書ける。
- PostgreSQLの`array_agg(... ORDER BY ...)`と行値の比較（`(started_at, id) < (?, ?)`）。
- `Base64.urlsafe_encode64(padding: false)`（cursor）。
- committee-rails（既存。responseの契約照合）。

## 12. Alternatives Considered

- **`date`をmodelのcallbackで算出して普通の列に保存する**: 実装は素直だが、callbackを通らない保存
  （`insert_all`・SQL）で`started_at`と食い違い得る。生成列を採る。
- **`date`を持たず、取得のたびに`started_at`から算出する**: 列は減るが、集約と日付キーの取得に
  式の索引が要り、queryが読みにくくなる。採らない。
- **`dots.id`を処理IDと同じ値にする**: 契約のexample（`GenerationSucceeded`と`DotEvening`）は同じ
  UUIDを使っているが、契約の文面とarchitectureは「処理IDを`dots`の列へ`(user_id, 処理ID)`のunique
  制約で持つ」としており、別の列を前提にしている。exampleは例示にとどまるため、別の列にする
  （Dotの識別子と処理の識別子の意味を分けられる）。
- **同値の`started_at`の並びを作成順にする**: TASK-004 Plan §18-2は「Dotの識別子（作成順が分かる
  もの）」と書いたが、TASK-005で識別子をUUID v4とし、契約は「同値ならidの降順」と定めた。契約に
  従う。`started_at`はserverがattemptごとにマイクロ秒で決めるため、同値はほぼ起きず、起きても
  並びは決定的（cursorで欠落・重複しない）である。
- **ゴミ箱のendpointも本タスクで作る**: TASK-013の作業範囲に明記されているため作らない。

## 13. Risks / Things to Watch

- **ゴミ箱の書き忘れ**: 取得の入口をServiceと`days#today`・`dots#update`に限り、すべてで`kept`を
  明示する。request specで、ゴミ箱の中のDotが一覧・件数・Day・日の詳細・PATCHのどれにも出ないことを
  確かめる。
- **日付境界**: 生成列と`Dot.date_for`（今日の判定）の規則を同じにし、14:59:59.999999 UTC /
  15:00:00 UTCの両側をtestする。
- **cursorの改ざん**: 利用者を含まず、queryは`current_user`のscopeの中だけ。形式違いは`400`。
- **件数の多い日**: 同日の件数に上限は無いが、日の詳細はcursorで続きを取る。一覧の1要素は固定サイズ。
- **ログ**: Dotの本文をrequestのparameterのログに出さない（`filter_parameters`）。
- **DBの例外messageに本文が入る**: PostgreSQLのCHECK・NOT NULLの違反は`DETAIL: Failing row contains (...)`に
  行の全列（`sentence`・`summary`を含む）を入れ、Railsはそれを`ActiveRecord::StatementInvalid`のmessageへ
  入れる。`filter_parameters`は例外のmessageを隠さない。通常の保存はmodelのvalidation（上限・NUL文字）が
  DBより先に止めるため、validationを飛ばす経路（`update_all`・`insert_all`など）でだけ起きる。
  **TASK-009のJobは`create!`でvalidationを通して保存する。**error trackingを入れるとき（TASK-009）と、
  RDSのログの設定（`log_min_error_statement`等。TASK-015）で、例外のmessageとDBのserver logに本文が
  残らないことを確かめる。
- **契約のexampleの紛らわしさ**: `GenerationSucceeded`と`DotEvening`のexampleは、Dotの`id`と処理IDに
  同じUUIDを使っている。本タスクでは別の値として持つ（§12）。TASK-009で契約に触れるときに、exampleの
  UUIDを別の値にする。
- **互換性**: 新しいendpointの追加だけで、既存の契約・endpointを変えない。

## 14. Verification

### Automated

- model spec: 生成列の日付境界、SQLで`started_at`を書き換えたときに`date`が追従すること（modelでは
  `started_at`を更新させない）、文字数・durationの制約（validationとDBのCHECK）、NUL文字の拒否
  （壊れたUTF-8はRailsの標準validatorが例外を出すため、外部の文字列を受け取るTASK-009で`valid_encoding?`を
  確かめる）、保存・更新のSQLのログに本文が出ないこと、`(user_id, generation_id)`の一意、同日の追記で過去のDotが残ること、
  `kept`・`trashed`・`newest_first`。
- service spec: cursorの往復と不正値、一覧の集約（件数・最新id・ゴミ箱の除外）、多数件を続きで
  たどったときに欠落・重複が無いこと（同日内の続きも含む）。
- request spec（全responseを`assert_response_schema_confirm`で契約と照合）:
  - 未認証`401`、他人のDotが一覧・Day・詳細に出ない、他人・存在しない・ゴミ箱の中のDotのPATCHは`404`
  - 履歴なし（`items: []`・`dot_count: 0`）、同日複数、日付境界、0件の日（全件がゴミ箱 / 完全削除）は
    `200`で`dots: []`
  - ゴミ箱へ移すと一覧・Day・詳細から外れ、戻すと元の日へ戻る（`trashed_at`を直接書き換える）
  - 不正なcursor・limit・dateの`400`・`422`
  - PATCHの許可しない項目・型・上限・空文字・NUL、CSRFなしの`403`、編集前の値が残らないこと
  - `Cache-Control: no-store`
- `bundle exec rubocop`・`bundle exec brakeman`・`bundle exec rspec`、rootの`pnpm check`等（品質ゲート）。

### Manual

- 画面はTASK-012で接続するため、本タスクでは無い。PRの「確認すること」で、APIのresponseの形と
  境界の振る舞いを人間が確かめる。

## 15. Definition of Done

- タスクの完了条件と「必要な検証」をtestで確かめ、Completion Recordへ記録した。
- 関連する現行文書を実装済みの範囲へ更新した。
- lint / test / securityの検査が通る。

## 16. Completion Record

- 状態: 2026-10-05に実装と検証を終えた。タスクの完了条件はすべてtestで確かめたため、タスクをDoneにする。
- 関連: メインのPR #60（統合ブランチ`feat/task-008-dot-history-integration`）と、そこへ向けた3つのサブのPR。

### 実装差異（Planから変えた点と理由）

- **今日の取得もServiceにした（`TodaySummary`）。**件数と最新のDotを別々のqueryで引くと、間にDotが
  ゴミ箱へ移ったとき「件数はあるのに最新のDotが無い」responseを作り得る。1つのquery（`COUNT(*) OVER ()`）
  で取る処理をcontrollerに置くと読みにくいため、Serviceに分けた。
- **serializerを4つにした**（`DotSerializer`・`DayListSerializer`・`TodaySerializer`・`DayDetailSerializer`）。
  Zeitwerkは1ファイル1定数のため。PR 2/3のレビュー対象は17ファイルで、20以下に収まった。
- **`dots`の`user_id`・`generation_id`・`started_at`・`duration_seconds`を`attr_readonly`にし、`date`への
  代入を拒否した。**生成列は代入しても保存されず、手元の値だけが食い違うため。編集できる項目を
  modelでも`sentence`と`summary`に限る。
- **PATCHでParamsWrapperを切った（`wrap_parameters false`）。**Railsの既定でJSONの項目が`dot`に包まれ、
  `request_parameters`に足されるため、許可しない項目として数えてしまう。JSONのobjectでないbody
  （配列・文字列）はRailsが`_json`に入れるので、`body`の`invalid_format`にした。
- **日の詳細のcursorの時刻を、そのcursorの日（Asia/Tokyo）の中に限った。**形式だけを確かめていたため、
  作り替えたcursorでPostgreSQLのtimestampの範囲を超える時刻を渡すと`500`になっていた（PR 2/3の
  セルフレビューで発見）。範囲外は`400 cursor_invalid`にし、同じ種類の見落としを拾う観点を
  `docs/code-review/backend/security.md` §2に足した。
- `filter_parameters`は完全一致ではなく部分一致（`%i[sentence summary]`）にした。隠しすぎて困る項目が無いため。

### 検証結果

実行したcommand（`apps/api`、DBは`FOD_DB_SUFFIX=_task_008`の専用DB）:

- `bundle exec rspec` — 409 examples, 0 failures（追加: model 18、service 20、request 36）
- `bundle exec rubocop` — no offenses
- `bundle exec brakeman -q` — No warnings found
- `RAILS_ENV=test bin/rails db:drop db:create db:schema:load`の後に`dot_spec`・`days_spec`を実行し、
  `schema.rb`から作ったDBでも生成列が再現されることを確かめた（CIと同じ作り方）。
- rootの検査（`pnpm check`・`pnpm type-check`・`pnpm test`）は品質ゲートとpre-pushで実行する。

完了条件ごとの確認:

| 完了条件 | 確かめたtest |
| --- | --- |
| 利用者に関連付けた永続保存、過去のDotを失わない | `dot_spec`「同じ日に録音しても追記」「同じ処理から2件目のDotを作らない」「保存に失敗したら行を残さない」。Dotを作るendpointはTASK-009で、本タスクは`user.dots.create!`で保存できるmodelと制約まで |
| 同日の複数録音・日付境界・表示順・Dayのデータ | `dot_spec`「0:00 JSTの前後」「保存時刻ではなくstarted_at」、`days_spec`「今日の最新のDot」「0:00で切り替わる」「started_atの降順」 |
| 一覧・日付指定の取得、続き、0件の区別 | `day_list_spec`・`day_dots_spec`の続きの欠落・重複（同じ`started_at`、途中のゴミ箱移動を含む）、`days_spec`の0件（記録なし・全件ゴミ箱・完全削除）が`200` |
| 未認証・別利用者の拒否、更新は本人だけ | `days_spec`・`dots_spec`の`401`、他人のDotが出ないこと、他人・存在しない・ゴミ箱の中のPATCHが`404`、CSRFなしの`403` |
| 契約どおりの項目、保存失敗と未取得の区別 | すべてのrequest specで`assert_response_schema_confirm`。PATCHの失敗は`422`/`404`で値が変わらないこと、0件は`200`の空配列 |
| 現行仕様・architectureへの反映 | architecture・dot-history・journaling・productを更新（PR 3/3） |

「必要な検証」のうち「復元で戻る」は、復元のendpointがTASK-013のため、`trashed_at`を直接戻して
一覧・Day・詳細へ戻ることを確かめた（`days_spec`「ゴミ箱」）。endpointとしての復元はTASK-013で確かめる。

### 未実施の確認と理由

- Webからの実際の呼び出し: 画面（TASK-012）とWebの認証接続（TASK-007）が未実装のため。
- 退会中の`409 account_deletion_in_progress`: 退会の状態を持つ列がまだ無い。TASK-013で退会を実装する
  ときに、本タスクのendpointへも適用する。
- 編集とゴミ箱への移動・完全削除が同時に起きたときの扱い: PATCHは`kept`で探してから`update!`で書き、
  その間の移動を確かめない。ゴミ箱・削除のendpointがまだ無いため今は起きない。TASK-013で、条件付きの
  更新（`kept.where(id:)`の影響行数を見る）か行lockのどちらにするかを決めて足す。
- 大量件数での実行計画の確認（`EXPLAIN`）: ローカルの少量のデータでは索引の選択が本番と変わり得るため、
  実データの規模が出てから確かめる。
