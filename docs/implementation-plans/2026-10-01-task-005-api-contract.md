# Implementation Plan: TASK-005 実サービスのAPI契約と契約管理

## 1. Status

実施中（2026-10-01）。作業区分がAPI契約のため、論点ごとに人間と対話で決めた（§17のQ1〜Q7、
すべて推奨案）。契約・検証の仕組み・関連文書の更新を終え、契約の具体例のレビューを人間に依頼する。

依存先のうちTASK-003はIn progressのまま着手した（2026-10-01に人間が判断）。TASK-003に残る完了条件7
（委託先への9項目の確認。公開前に人間が実施）は、API契約の前提となる判断（provider・実行方式・
状態と再開点・冪等性）を変えない。**確認の結果providerが変わる場合に見直す箇所は§13に挙げる。**

## 2. Goal

TASK-001〜004で採用した設計判断を、WebとAPIが同じ意味で扱えるrequest / response / errorの正式な
契約にする。あわせて、契約の正本・検証方法・同時更新と互換性の運用を決め、最初の契約をその方法で
検証できる状態にする。

endpointの機能実装はBackendタスク（TASK-006 / 008 / 009 / 013）、呼び出しの実装はFrontendタスク
（TASK-007 / 010 / 011 / 012 / 014）が行う。

## 3. Background

- 現在のWebは`VITE_DOT_API_URL`設定時に本文なしの`POST /dot`を送るだけで、これは正式な契約ではない
  （journaling.md §3）。Rails APIには`GET /up`しかない。
- 認証（TASK-001）、保持・削除（TASK-002）、生成と再試行（TASK-003）、履歴（TASK-004）で、契約に
  必要な判断が出揃った。各タスクファイルの「契約への入力」がTASK-005に積まれている
  （[TASK-005](../tasks/TASK-005-product-api-contract.md)の後半）。
- 後続の実装タスク（TASK-006以降）は、契約が無いとendpoint・schema・error・状態の意味を各自で
  決めることになり、Web/APIで解釈がずれる。

## 4. Current State

- API: `apps/api/config/routes.rb`は`GET /up`のみ。Controllerは`ApplicationController`だけ。
  認証、`/api/v1`、Dot、Job基盤は未実装。Gemfileに契約検証のGemは無い。
- Web: `apps/web/src/features/processing/create-dot.ts`の`createDot`が暫定の`POST /dot`を行い、
  responseをZodで検証する。`features/session`のZod schemaは`reflection`・`closing`を含む旧DotSession。
  OpenAPIや型生成のdependencyは無い。
- CI: Webはlint / type-check / test / build、APIはrubocop / brakeman / bundler-audit / rspec。
  契約の検査は無い。
- 文書: architecture.mdの「決定済み」に「OpenAPIを推奨候補とするが、型生成・生成物の管理・契約検証
  toolは別の判断とする」「API、Web、契約は同じPRで更新する」がある。

## 5. Scope and Non-goals

### 今回の対象

- 契約の対象: 認証（登録・確認・password login/reset・Google開始/callback・状態確認・logout・CSRF・
  退会）、録音attempt、音声の受け渡し、生成状態の取得・再試行・文字起こし全文のACK、Dayと日単位の
  一覧・日の詳細、Dotの更新、ゴミ箱（移す・一覧・復元）、完全削除。
- 共通事項: 識別子・日時・日付・durationの表現、error形式とcode体系、cursor、入力制限、no-store、
  CSRF、所有権（他人・存在しない・ゴミ箱の扱い）。
- 契約の正本・検証tool・型生成・生成物管理の決定と、最初の契約をその方法で検証できる最小の仕組み。
- Web/API/契約の同時更新と、デプロイ時差を考慮した互換性確認の運用。
- journaling.md・architecture.md・関連文書の更新。

### 今回の対象外

- endpointの機能実装とWebの呼び出し実装（後続の実装タスク）。
- password方針・ログイン試行制限の具体値、Google確認情報とConfirmableの関係、Google再認証の有効時間
  （TASK-006）。契約では項目とerrorの枠だけを定め、値はTASK-006で埋める。
- メールアドレス変更・password変更のendpoint。TASK-002が採用したアカウント操作は退会だけで、
  変更操作をMVPに入れる決定は無い（既定として対象外。必要になればproduct.mdの範囲変更として扱う）。
- 深掘り対話（TASK-018）、検索・期間フィルタ・月ジャンプ・Week/Month集計（dot-history.mdで対象外）。

### 今回確定しない事項

- promptの最終文面とBedrockのmodel id（TASK-009）。`sentence`・`summary`の上限値は本タスクで決める。
- 委託先への9項目の確認（TASK-003完了条件7。公開前に人間が実施）。

## 6. References and Documents to Update

### 参照

- [product.md](../product.md) §4・§5、[journaling.md](../journaling.md) §2–§5、
  [dot-history.md](../dot-history.md) §2、[privacy.md](../privacy.md) §5、
  [architecture.md](../architecture.md)
- [TASK-001 Plan](2026-09-21-task-001-identity-design.md) §45–§57、
  [TASK-002 Plan](2026-09-28-task-002-data-lifecycle.md) §17・§25、
  [TASK-003 Plan](2026-09-29-task-003-generation-design.md) §19・§20・§24・§25・§27、
  [TASK-004 Plan](2026-09-28-task-004-history-design.md) §18・§25・§26
- [development/backend.md](../development/backend.md) §3、
  [development/frontend.md](../development/frontend.md)

### 同じ変更で更新する現行文書

- 新規: 契約の正本`contracts/openapi.yaml`と運用`contracts/README.md`
- `docs/journaling.md`: §3・§5（契約の正本への参照、pollingの未決定事項の解消）
- `docs/architecture.md`: 「決定済み」（契約の管理方法）、「未決定」（OpenAPI採否の解消）
- `docs/dot-history.md` §5: 録音attemptの保存方式・期限・再利用の可否
- `docs/development/backend.md` §3・`docs/development/frontend.md` §2: 契約の参照と検証の手順
- `docs/code-review/backend/README.md`・`docs/code-review/frontend/README.md`: 契約との一致と互換性の確認
- `docs/privacy.md` §4・§5-1: 録音attemptの保存方式の決定と、完全削除・退会の後に残す使用済みattemptの行（Q7）
- `docs/tasks/TASK-005-product-api-contract.md`: 状態・本Planへのリンク・完了条件

## 7. Proposed Approach（採用。正本は`contracts/openapi.yaml`）

### 7-1. 共通の約束

下表の「案」は採用した内容である（2026-10-01）。

| 項目 | 案 |
| --- | --- |
| base path | `/api/v1`。認証のうちOmniAuthの開始・callbackだけ`/auth/...`（browserのredirectで遷移するため） |
| 形式 | JSON（`application/json`）。音声のuploadだけ`multipart/form-data` |
| 識別子 | 文字列のUUID（v4）。連番を出さない |
| 日時 | ISO 8601のUTC（例: `2026-09-28T13:04:05Z`）。表示時にJSTへ変換するのはWeb |
| 日付 | `YYYY-MM-DD`（Asia/Tokyoの暦日。serverが決める） |
| `duration` | 整数の秒（`duration_seconds`） |
| cache | 個人のresponseはすべて`Cache-Control: no-store` |
| 認証 | Cookie session（同一origin）。変更操作はCSRF tokenを`X-CSRF-Token`で送る。tokenは状態確認のresponseで渡す |
| 所有権 | 他人のresourceと存在しないresourceは同じ`404`。ゴミ箱の中のDotは通常のendpointから`404` |
| cursor | 不透明な文字列。clientは解釈しない。`next_cursor`が`null`なら終わり |
| error | RFC 9457（`application/problem+json`）に、機械判定用の`code`を拡張項目として必ず含める。`type`は`urn:focus-on-dot:problem:<code>` |

### 7-2. endpointの一覧（案）

| 区分 | method / path | 概要 |
| --- | --- | --- |
| 認証 | `GET /api/v1/session` | 認証状態・期限（`expires_at`）・メール確認済みか・CSRF token |
| | `POST /api/v1/session` | メール＋passwordでlogin |
| | `DELETE /api/v1/session` | logout |
| | `POST /api/v1/registrations` | 登録（確認メール送信） |
| | `POST /api/v1/confirmations` | 確認メールの再送（共通受付応答） |
| | `PATCH /api/v1/confirmations` | 確認tokenの消費 |
| | `POST /api/v1/passwords` | 再設定メールの送信（共通受付応答） |
| | `PATCH /api/v1/passwords` | 再設定tokenの消費と新しいpassword |
| | `POST /auth/google_oauth2`・`GET /auth/google_oauth2/callback` | Google開始（CSRF保護したform POST）・callback（SPAへredirectし結果をcodeで渡す） |
| | `DELETE /api/v1/account` | 退会の受理（再認証つき。202） |
| | `GET /api/v1/account/deletion` | 退会の状況（`in_progress` / `completed` / `failed`） |
| 録音 | `POST /api/v1/recording_attempts` | 録音attemptの発行（`started_at`の確定） |
| 生成 | `POST /api/v1/dots` | 音声・attempt・durationの送信。処理IDと再試行期限を返す（202） |
| | `GET /api/v1/generations/{id}` | 生成状態のpolling。成功時はDotと文字起こし全文 |
| | `POST /api/v1/generations/{id}/retry` | 期限内の再試行 |
| | `POST /api/v1/generations/{id}/transcript_ack` | 文字起こし全文の受領通知（冪等） |
| 履歴 | `GET /api/v1/days` | 日単位の一覧（cursor） |
| | `GET /api/v1/days/today` | Dayの今日（今日の最新Dotの有無を区別して返す） |
| | `GET /api/v1/days/{date}` | 日の詳細（その日のゴミ箱外のDot。cursor） |
| Dot | `PATCH /api/v1/dots/{id}` | `sentence`・`summary`の更新 |
| ゴミ箱・削除 | `POST /api/v1/dots/{id}/trash` | ゴミ箱へ移す（`deletion_begins_at`を返す） |
| | `GET /api/v1/trash/dots` | ゴミ箱の一覧（cursor） |
| | `POST /api/v1/trash/dots/{id}/restore` | 復元 |
| | `DELETE /api/v1/dots/{id}` | 完全削除（ゴミ箱の内外を問わない。失敗は`503 deletion_failed`） |

### 7-3. 既定値として置く値（質問しない。レビューで変えられる）

| 項目 | 既定値 | 根拠 |
| --- | --- | --- |
| 一覧の`limit` | 既定30日分・上限100日分 | TASK-004 Planの提案値 |
| 日の詳細の1回の件数 | 既定50件・上限100件、続きはcursor | 同日の件数に上限が無いため（dot-history §2） |
| 録音attemptの期限 | 発行から2時間 | 最長30分の録音＋停止から送信まで＋受理前の再送の猶予（dot-history §2の条件）。受理後は処理の記録の24時間で別に数える |
| 録音中の失効から同一Userで復帰した場合 | attemptの期限内なら同じattemptで送れる | journaling.md「録音前認証と期限切れ」（TASK-002で確定）の「同一Userなら録音画面にいる間は再送できる」と揃える。別Userは拒否 |
| 同じattemptの再送 | 既存の処理の状態を返す（新しい処理を作らない） | TASK-003 Plan §20で採用済み |
| pollingの間隔 | serverが`poll_after_seconds`を返す（既定: 最初の2分は3秒、その後10秒） | serverが段階に応じて変えられるようにする |
| pollingの打ち切り | clientは15分で自動pollingを止め、「あとで確認」を示す。再表示や手動操作で再開する | Jobは止まらない（TASK-003）。打ち切りは通信量のためで、結果は失われない |
| `sentence`の上限 | 200文字 | 「今日の一文」なので短い。生成側の上限はTASK-009で同じ値以下に揃える |
| `summary`の上限 | 2,000文字 | 30分の発話の要約が収まる長さ。空文字は許す（TASK-002） |
| 音声 | `audio/webm`（opus）・`audio/mp4`、最長30分・32MB | TASK-002・TASK-003 Plan §25-7 |

### 7-4. 上流の決定を契約へ写したときの判断

| 項目 | 契約での形 | 理由 |
| --- | --- | --- |
| 生成状態の見せ方 | `status`は`processing` / `succeeded` / `failed` / `expired`の4つ。`processing`の間だけ`stage`（`uploading` / `transcribing` / `generating`）を返す。内部の9状態（TASK-003 Plan §20）とAWSのjob状態は出さない | providerが変わっても契約を変えないため（§13）。進捗表示に要る粒度だけを出す |
| 失敗の種類 | `failure.kind`は`processing_failed`（`retry`で再試行）、`upload_incomplete`（同じattemptで送り直す）、`empty_recording`（録り直し）の3つ | TASK-003が残した「生成から/文字起こしからの区別をerror契約で出すか」は**出さない**。どちらも録り直し不要で利用者の操作が同じため |
| 文字起こし全文を返さない理由 | `succeeded`で`transcript.status=unavailable`と`unavailable_reason`（`acknowledged` / `expired`）。完全削除・退会ではDotも残らないので`404` | TASK-003の「理由によってDotが残るかを区別する」を満たす |
| 期限切れ後の照会 | 処理の記録がある間は`expired`、後片付けで記録が消えた後は`404` | 記録を残し続けない（privacy.md §5）代わりに、Webは手元の処理IDが`404`になったら「見つからない（期限切れか削除）」と示す |
| 処理IDの形式 | serverが発行するUUID v4（36文字）。DBでも一意制約を持つ | TASK-003の3条件（AWSアカウント内で一意、`<処理ID>-<試行番号>`がTranscribeのjob名の制約を満たす、推測できる値や個人情報を含まない）を満たす。server発行の別IDは足さない |
| 生成のpath | `/api/v1/generations/{id}`（TASK-003 Planの`/api/v1/dots/generations/:id`から変更） | `/api/v1/dots/{id}`と曖昧になり、routingで取り違えるため（Redocly lintの指摘） |
| Day | `GET /api/v1/days/today`を専用に持ち、今日の記録が無ければ`dot_count: 0`で`latest_dot`を省く | 取得失敗と区別でき、serverが決めた今日の日付も返せる |
| 日の詳細の0件 | `200`で`dots: []` | 取得失敗・他人のDotと区別し、Webが一覧を取り直せるようにする |
| 退会中の操作 | 受理後は`GET /api/v1/session`・`GET /api/v1/account/deletion`・`DELETE /api/v1/account`（失敗後のやり直し）以外を`409 account_deletion_in_progress`。やり直しでは再認証を求めない | Q5でsessionを完了まで残すため、他の操作を明示的に止める。やり直しまで止めると`failed`から回復できない（codexレビュー1回目）。Google専用の利用者に再認証を求めると、退会中は再認証の経路も止まっていて回復できないため、受理時の本人確認で足りるとした（codexレビュー2回目） |
| 録音attemptの渡し方 | `POST /api/v1/dots`の`X-Recording-Attempt` header（multipartの本文に入れない）。再送の前にWebが`GET /api/v1/generations/{attempt.id}`で既存の処理を確かめる | 同じattemptの再送を、multipartの解釈とS3への保存より前に判定するため（TASK-003 Plan §20。codexレビュー1回目）。ただしPumaは本文を受け取り終えてからアプリへ渡すので、serverの判定では本文の再送信そのものは防げない。そこはWebの事前確認で避ける（レビュー4回目） |
| 退会中のlogin | 退会を受理した利用者もlogin（password・Googleの`intent=sign_in`）でき、`account_status=deletion_in_progress`を返す。serverは`failed`の削除を自動でも再実行する | 退会中にsessionを失う（7日の期限・logout）と、やり直しの経路が無くなり個人データが残るため（レビュー4回目） |
| ゴミ箱の中のDotの処理への再送 | `422 attempt_invalid` | ゴミ箱のendpoint以外からゴミ箱の中のDotを返さないため（レビュー4回目） |
| `return_to` | 英数字・`-`・`_`・`/`だけの素のpathに限るpattern | `/\evil.example`などをbrowserが別originとして扱うopen redirectを防ぐため（レビュー4回目） |
| 成功後の再試行期限 | `retry_expires_at`は`succeeded`では返さない | 成功後は後片付けで処理の記録が消え、Dotの項目からは期限を復元できないため（codexレビュー1回目） |
| 状態ごとの必須項目 | `Session`・`Generation`・`Transcript`は状態ごとのschemaに分け（`oneOf`。`Generation`と`Transcript`は`status`のdiscriminator）、必ず返す項目を`required`にする。Webは`z.discriminatedUnion`で同じ形にする | 説明文だけに書いた必須は、両側の検証で欠落を検出できないため（codexレビュー3回目） |
| 日時の形式 | `Z`で終わるUTCだけ（全date-timeにpatternを付ける）。`+00:00`は契約外 | OpenAPIの`date-time`は`+00:00`を許すが、Zodの`z.iso.datetime()`は許さず、契約上正しい値をWebが拒否し得たため。境界値を両側のtestで確かめる（codexレビュー3回目） |
| 登録 | 登録済みかにかかわらず`202`。登録済みならログインと再設定を案内するメールを送る | Q6 |
| ゴミ箱へ移したとき | `deletion_begins_at`（削除処理を始める日時）を返す | TASK-002の「示すなら消え終わる時刻として読めない形」。項目名で「始める」を表す |
| Google callbackの失敗 | `/login?auth_error=`に`google_email_conflict`または`google_auth_failed`を付けてredirect | browserのredirectなのでJSONのerrorを返せない |

## 8. Why This Approach

- **契約を先に人が書く（契約ファースト）。**TASK-005は実装より先に約束を決めるタスクで、後続の
  Backend/Frontendのタスクを並行して進めるため。コードから契約を生成すると、実装が済むまで契約が
  存在せず、TASK-001〜004で人が決めた意味が実装の都合で黙って変わり得る。
- **検証は「正本1つ・両側が機械的に縛られる」形にした。**契約自体はRedocly lint、Webは生成した型と
  Zodの完全一致を型検査、APIはcommitteeでresponseを照合する。さらに契約のexamplesを両側のtestで
  読み、WebとAPIが同じ具体例を同じ意味で解釈することを確かめる（TASK-005の「必要な検証」）。
- **生成はWebの型だけに留めた。**endpointは約20で、Zodを手で書く量は小さい。multipart送信・
  polling・CSRF・`code`ごとの出し分けは生成しにくく、通信関数まで生成するとfeature単位の配置
  （frontend.md）とも合わない。Rails側の生成は雛形止まりで、中身（認可・状態遷移・排他）は手で書く
  ことになるため採らない。
- **OpenAPI 3.0.3にした。**committeeが使うopenapi_parserが3.0を対象にしているため（Q1の時点では
  3.1を想定していた）。nullを許す項目は`nullable`、または項目を省く形で表す。
- **契約を`docs/`ではなく`contracts/`に置いた。**既存のCI（`scripts/ci-changes.mjs`）は`docs/`の
  変更で検査を走らせない。契約の変更ではWebとAPIの両方の検査が走る必要があるため。

## 9. Data Flow

契約の変更と検証の流れ（このタスクで作った仕組み）:

```text
contracts/openapi.yaml（正本・手で書く）
├─ Redocly lint ─────────────→ 契約自体（書式・参照・examplesとschemaの一致）
├─ openapi-typescript ──→ apps/web/src/types/api-contract.d.ts（生成・commit）
│                          └─ libs/api-contract/schemas.ts（Zod）と完全一致を tsc で強制
│                             └─ schemas.test.ts: examplesをZodで読む
└─ committee（openapi_parser）
     ├─ spec/contracts/api_contract_spec.rb: 同じexamplesをAPI側の検証器で読む
     └─ request spec: assert_response_schema_confirm で実responseを照合（実装タスクで使う）
```

実行時のデータフローは契約の各operationの説明と、[architecture](../architecture.md)の
「生成の実行方式」を正とする。生成の主経路は次のとおり。

```text
録音開始 → POST /api/v1/recording_attempts（started_at確定・tokenを返す）
→ 録音 → POST /api/v1/dots（音声 + token。202でGeneration）
→ GET /api/v1/generations/{id} を poll_after_seconds ごとに取得
→ succeeded（Dot + 文字起こし全文） → 全文を sessionStorage へ保存
→ POST /api/v1/generations/{id}/transcript_ack
```

## 10. Files to Change

| ファイル | 新規/変更 | 役割 |
| --- | --- | --- |
| `contracts/openapi.yaml` | 新規 | 契約の正本 |
| `contracts/README.md` | 新規 | 変更手順・互換性・error code・lintの例外 |
| `redocly.yaml`・`.redocly.lint-ignore.yaml` | 新規 | 契約のlint設定と理由付きの例外 |
| `package.json`・`pnpm-lock.yaml` | 変更 | `@redocly/cli`、`lint:contract`を`pnpm check`へ |
| `apps/web/package.json` | 変更 | `openapi-typescript`・`yaml`、型の生成と最新確認のscript |
| `apps/web/src/types/api-contract.d.ts` | 新規（生成） | 契約から生成した型 |
| `apps/web/src/libs/api-contract/schemas.ts`・`schemas.test.ts` | 新規 | Problem・Dot・GenerationのZodと、examplesのtest |
| `eslint.config.mjs` | 変更 | 生成した型をlint対象から外す |
| `apps/api/Gemfile`・`Gemfile.lock` | 変更 | `committee-rails`（test group） |
| `apps/api/spec/support/api_contract.rb`・`spec/contracts/api_contract_spec.rb`・`spec/rails_helper.rb` | 新規/変更 | committeeの設定、examplesの検証、support読み込み |
| `docs/architecture.md`・`journaling.md`・`dot-history.md`・`privacy.md` | 変更 | 契約の正本・決定の反映 |
| `docs/development/*.md`・`docs/code-review/*/README.md` | 変更 | 契約の参照・検証・互換性の確認 |

`libs/`に契約のZodを置くのは、契約が特定のfeatureに属さないSDK相当の低レベル依存であり、
DotやProblemを複数のfeatureが使うため（React・route・表示判断を含まないので、frontend.md §1の
「例外」には当たらないと判断した）。schemaは使う機能の実装時に足し、使わないschemaを先回りで
作らない。

## 11. Libraries / APIs

| library | 用途 | 選んだ理由 |
| --- | --- | --- |
| `@redocly/cli` 2.55.0（root devDependency） | 契約のlint | OpenAPIの標準的なlinterで、examplesのschema検証まで行える。2.56以降は公開から1日未満で、pnpmの`minimumReleaseAge`を緩めないため2.55.0に固定した。telemetryと更新通知は環境変数で止める |
| `openapi-typescript` 7.13.0（web devDependency） | 契約から型を生成 | runtimeを持たず型だけを出す。`--check`で生成物が最新かを確かめられる |
| `yaml` 2.9.1（web devDependency） | testで契約を読む | Node標準にYAML parserが無いため |
| `committee-rails` 0.10.0（api test group） | request specでresponseを照合、examplesの検証 | RailsでOpenAPI 3の照合を行う定番。依存の`committee` 5.6.4・`openapi_parser` 2.3.1も含め、公開から10日以上経っている。最初のrequestを覚えたままにする挙動を上書きし、契約に無いcontent typeを拒否する設定にした（`spec/support/api_contract.rb`。codexレビュー2回目） |

## 12. Alternatives Considered

- 契約の形式（Markdownのみ、型生成なし）、録音attemptのserver保存、`DELETE`をゴミ箱に使う案、
  独自のerror形式、退会を即時完了扱いにする案・受付だけを示す案、登録済みを画面で明かす案は
  §17の各質問を参照。
- コードから契約を生成する（rswag等）: §8のとおり採らない。
- Zod・通信関数の生成（orval、openapi-zod-client等）: §8のとおり見送る。再検討の条件はQ1の回答。

## 13. Risks / Things to Watch

- **TASK-003完了条件7の結果でproviderが変わる場合**: 見直すのは音声の受容形式と入力制限、
  再試行が「生成から/文字起こしから」の区別（failure kind）、処理IDの形式条件（Transcribeのjob名の
  制約）。それ以外のendpointと状態の意味はproviderに依存させない（AWSの名前やjob状態をresponseへ
  出さない）。
- デプロイ時差: React buildをRails releaseへ同梱するため、通常はWebとAPIが同時に入れ替わる。ただし
  **古いSPAを開いたままのタブ**と、ECSの入れ替え中に新旧タスクが併存する間は、古いWebが新しいAPIを
  呼ぶ。

## 14. Verification

### Automated（本タスクで実施）

- `pnpm check`: ESLint・命名・Redocly lint（examplesとschemaの一致を含む）・生成した型が最新であること。
- `pnpm type-check`: Zod schemaと生成した型の完全一致。
- `pnpm test`: 契約のexamples（Problem・Dot・Generationを返すresponseのすべて）をWebのZodで読む。
  未知のerror codeと上限超過を拒否する。
- `bundle exec rspec`・`rubocop`（`apps/api`）: 契約のすべてのresponse examplesをAPI側の検証器で
  読む。契約外の値を拒否する。
- 検査が実際にずれを検出することを確かめる: Zodの必須項目を任意に変えると型検査が失敗する、
  生成した型を書き換えると`check:api-types`が失敗する。

### Manual（人間のレビュー）

契約のexamplesを読み、次の場面の扱いが意図どおりかを確かめる（TASK-005の「必要な検証」）。

- 一覧の続き（`DayListFirstPage`の`next_cursor`、`cursor_invalid`）
- 日付境界（`DotMorning`: UTCの23:10は翌日のJST 8:10なので`date`は`2026-09-28`）
- 再試行（`GenerationFailedRetryable` / `GenerationFailedUploadIncomplete` / `GenerationFailedEmptyRecording` /
  `GenerationExpired`、`retry_expired`）
- 認証失効（`session_expired`、退会中の`account_deletion_in_progress`）
- 削除済みのDot（`DayDetailNoDotsLeft`、ゴミ箱・完全削除・`404`）
- 互換性（`contracts/README.md` §3の表）

## 15. Definition of Done

- TASK-005の完了条件をすべて満たす。
- 契約の正本が実装タスクから参照でき、選んだ方法で検証できる。
- 関連文書の更新が済み、人間が契約の内容を説明できる。

## 16. Completion Record

- 状態: 2026-10-01、契約と検証の仕組み・関連文書の更新を完了。人間による契約の具体例のレビュー
  （§14 Manual）が済むまで、TASK-005はIn progressのままにする。
- 実装差異:
  - OpenAPIは3.1ではなく3.0.3（committeeの対応範囲。§8）。
  - 契約の置き場は`docs/api/`ではなく`contracts/`（CIで両側の検査を走らせるため。§8）。
  - 生成のpathを`/api/v1/generations/{id}`へ変更（§7-4）。
  - `Today.latest_dot`は`null`ではなく項目を省く形（OpenAPI 3.0で`nullable`と`$ref`の組み合わせが
    examplesの検証で正しく扱われないため）。
  - Redocly CLIは2.57.0ではなく2.55.0（`minimumReleaseAge`。§11）。
- 検証結果:
  - `pnpm check`: 成功（Redocly lint 0件。例外4件は`.redocly.lint-ignore.yaml`に理由を記載）。
  - `pnpm type-check`: 成功。`vitest run src/libs/api-contract`: 153件成功。
  - `bundle exec rubocop`: 違反0。`bundle exec rspec`: 172件成功。
  - codexレビュー（3回）の指摘はすべて対応した。内容は§7-4・§11の「codexレビュー」と付けた行。
  - ずれの検出: Zodの`summary`を任意にすると`tsc`が失敗し、生成した型を書き換えると
    `check:api-types`が終了コード1になった。いずれも確認後に元へ戻した。
  - 未実施: endpointの実装が無いため、request specでの実responseの照合
    （`assert_response_schema_confirm`）は実装タスクで行う。契約の具体例の人間によるレビュー
    （§14 Manual）はPRで依頼する。
- 関連: 実装はTASK-006〜014。providerが変わる場合の見直し箇所は§13。

## 17. 人間に判断を求める項目（2026-10-01）

### Q1: 契約の正本と検証方法

- 何を決めるか: 契約をどの形式で持ち、Web/APIの両側でどう検証するか。
- 決めないと: 契約ファイルの形式と、追加するdependency・CIが決まらない。
- A: **OpenAPI 3.1を手書き（`docs/api/openapi.yaml`）。Redocly CLIでlint、APIはrequest specで
  committee-railsがresponseを検証、Webはopenapi-typescriptで型だけ生成してcommitし、Zod schemaを
  その型に`satisfies`で合わせる。CIで生成物の差分を検出する。** 両側で機械的にずれを検出できる。
  dependencyが3つ増える。
- B: OpenAPI 3.1を手書きし、lintとAPI側のcommitteeだけ使う。Webは型生成せず、OpenAPIの`examples`を
  Zodで読むtestで確かめる。dependencyは減るが、Web側の検出はexamplesの網羅度に依存する。
- C: OpenAPIを使わず、Markdownの契約文書とWeb/API各自のtestで守る。軽いが、ずれを機械的に
  検出できず、完了条件の「契約検証」が人の目に依存する。
- 推奨: A。最初の契約で導入すれば移行コストが無く、Webの既存Zod運用も残せる。

### Q2: 録音attemptの保存方式

- 何を決めるか: `POST /recording_attempts`が発行するattemptをserverに保存するか、署名済みの値を
  端末のmemoryに置くか（dot-history §2・§5の未決定事項）。
- 決めないと: attemptのresponse形式と、privacy.md §5への追記の要否が決まらない。
- A: **暗号化・署名したtoken（attempt ID・user・`started_at`・期限を含む）を返し、端末はmemoryに
  置いて送信時に渡す。serverは保存しない。** 一回性は初回uploadで処理の記録の`(user_id, 処理ID)`
  unique制約で担保する（TASK-003 Plan §20）。保存する個人データが増えない。発行済みattemptの一覧や
  失効はserverからできない。
- B: serverのテーブルに保存し、IDだけを返す。失効・監査ができるが、未送信attemptの保持・期限・削除を
  privacy.md §5へ足し、退会の削除対象も増える。
- 推奨: A。TASK-003で一回性はunique制約で成立すると確認済みで、Bの利点（失効）を使う場面がMVPに無い。

### Q3: ゴミ箱・完全削除のendpoint

- 何を決めるか: 「ゴミ箱へ移す」「復元」「完全削除（ゴミ箱の内外どちらからでも）」をどのmethod/pathで
  表すか。
- 決めないと: 削除系のresponseとerrorの区別（TASK-002の「ゴミ箱へ移す失敗と完全削除の失敗を混同
  させない」）が書けない。
- A: **`POST /dots/{id}/trash`（移す）、`GET /trash/dots`（一覧）、`POST /trash/dots/{id}/restore`
  （復元）、`DELETE /dots/{id}`（完全削除。ゴミ箱の内外を問わない）。** `DELETE`を物理削除だけに
  使うので、method名と結果が一致し、失敗の意味が混ざらない。
- B: `DELETE /dots/{id}`をゴミ箱へ移す操作にし、完全削除は`DELETE /trash/dots/{id}`と
  `DELETE /dots/{id}?permanent=true`で行う。REST的に素直だが、同じ`DELETE`で結果が2種類になる。
- 推奨: A。取り違えたときの被害（完全削除のつもりがゴミ箱、またはその逆）を設計で避けられる。

### Q4: errorの形式

- 何を決めるか: 失敗時のresponse bodyの形式。
- 決めないと: 全endpointのerror定義が書けない。
- A: **RFC 9457（`application/problem+json`）に、機械判定用の`code`と、必要なときだけ
  `retry_expires_at`などの追加項目を足す。** 標準形式で、OpenAPIでも共通schemaにしやすい。
- B: 独自形式`{ "error": { "code": "...", "message": "..." } }`。単純だが、形式の根拠を自前で持つ。
- 推奨: A。追加項目の置き場が標準で決まっており、codeの一覧を契約に書けば両側で同じ意味になる。

### 回答（2026-10-01）

| 質問 | 採用 | 対話で確認したこと |
| --- | --- | --- |
| Q1 | A | 正本は手書きのOpenAPI。APIはコードを生成せず手で書き、committeeでresponseを照合する。Webは型だけを生成し、Zodを型に合わせる。**バックエンドを正にする（コードから契約を生成する）方式は採らない**: 契約を実装より先に決めるタスクであり、Backend/Frontendのタスクを並行させるため。API側は契約で決まった形に値を詰める係で、形を変えるときは先に契約を直す。Webの生成をZod・通信関数まで広げるのは、endpointが大きく増えるか、Zodと契約のずれによる不具合が出たときに再検討する |
| Q2 | A | 録音attemptは「録音開始の受付票」。送られなかった受付票をserverに残さない。privacy.md §5への追記は不要 |
| Q3 | A | `DELETE`は戻せない削除（完全削除）だけに使う |
| Q4 | A | RFC 9457の外枠に、判定用の`code`を拡張項目として必ず付ける。`detail`に個人データを入れない。画面の文言はWebが`code`から決める |
| Q5 | A | 退会は受理後もsessionを完了まで残し、Webは`GET /api/v1/account/deletion`で状況を取得する。完了したら1回だけ`completed`を返してsessionを破棄する。失敗は`failed`で示し、やり直せる。通常は数秒で終わるが、長い録音の文字起こし中に退会した場合は数分かかり得るので、TASK-014でその文言を用意する。即時に「退会しました」と出す案（C）は、消えていないのに消えたと表示し得るため採らない。受付だけを示す案（D）はTASK-002の「失敗を成功と区別できるerror」を緩める必要があり採らない |
| Q6 | A | 登録済みのメールアドレスでも`202`で同じ応答を返し、そのアドレスへログイン・再設定を案内するメールを送る。日記アプリを使っていること自体を第三者に明かさない。メールの文面はTASK-006 |
| Q7 | A | 完全削除・退会で処理の記録とDotを消すと、attemptの期限内に同じattemptで再送されたときDotが作り直され、TASK-004の「1つのattemptは1件のDot生成にしか使えない」が崩れる（レビュー4回目）。使用済みattemptの`id`と期限だけを期限（最大2時間）まで残し、再送を`attempt_invalid`にする。利用者・本文・音声を含まず、privacy.md §5-1に行を足す。Q2の「attemptをserverに残さない」の、完全削除・退会の後の短い間だけの例外。何も残さず既知の制限とする案（B）は、消した日記が戻る事故を許すため採らない |
