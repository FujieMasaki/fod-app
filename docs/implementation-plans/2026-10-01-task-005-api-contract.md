# Implementation Plan: TASK-005 実サービスのAPI契約と契約管理

## 1. Status

計画中（2026-10-01）。作業区分がAPI契約のため、論点ごとに人間と対話で決める。§17の質問に対する
回答待ち。

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

- 新規: 契約の正本（形式は§17 Q1で決める）
- `docs/journaling.md`: §3・§5（契約の正本への参照、pollingの未決定事項の解消）
- `docs/architecture.md`: 「決定済み」（契約の管理方法）、「未決定」（OpenAPI採否の解消）
- `docs/dot-history.md` §5: 録音attemptの保存方式・期限・再利用の可否
- `docs/development/backend.md` §3・`docs/development/frontend.md`: 契約検証の手順（tool採用時）
- `docs/privacy.md` §5: 録音attemptをserverに保存する方式を採る場合だけ
- `docs/tasks/TASK-005-product-api-contract.md`: 状態・本Planへのリンク・完了条件

## 7. Proposed Approach（案。§17の回答で確定する）

### 7-1. 共通の約束

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
| error | §17 Q4で決める形式に、機械判定用の安定した`code`を必ず含める |

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
| | `DELETE /api/v1/account` | 退会（再認証つき） |
| 録音 | `POST /api/v1/recording_attempts` | 録音attemptの発行（`started_at`の確定） |
| 生成 | `POST /api/v1/dots` | 音声・attempt・durationの送信。処理IDと再試行期限を返す（202） |
| | `GET /api/v1/dots/generations/{id}` | 生成状態のpolling。成功時はDotと文字起こし全文 |
| | `POST /api/v1/dots/generations/{id}/retry` | 期限内の再試行 |
| | `POST /api/v1/dots/generations/{id}/transcript_ack` | 文字起こし全文の受領通知（冪等） |
| 履歴 | `GET /api/v1/days` | 日単位の一覧（cursor） |
| | `GET /api/v1/days/today` | Dayの今日（今日の最新Dotの有無を区別して返す） |
| | `GET /api/v1/days/{date}` | 日の詳細（その日のゴミ箱外のDot。cursor） |
| Dot | `PATCH /api/v1/dots/{id}` | `sentence`・`summary`の更新 |
| ゴミ箱・削除 | §17 Q3で決める | ゴミ箱へ移す・ゴミ箱の一覧・復元・完全削除 |

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

## 8. Why This Approach

後で埋める（§17の回答後）。

## 9. Data Flow

後で埋める（§17の回答後）。

## 10. Files to Change

§17 Q1の回答で確定する。

## 11. Libraries / APIs

§17 Q1の回答で確定する。

## 12. Alternatives Considered

§17の各質問の選択肢を参照。

## 13. Risks / Things to Watch

- **TASK-003完了条件7の結果でproviderが変わる場合**: 見直すのは音声の受容形式と入力制限、
  再試行が「生成から/文字起こしから」の区別（failure kind）、処理IDの形式条件（Transcribeのjob名の
  制約）。それ以外のendpointと状態の意味はproviderに依存させない（AWSの名前やjob状態をresponseへ
  出さない）。
- デプロイ時差: React buildをRails releaseへ同梱するため、通常はWebとAPIが同時に入れ替わる。ただし
  **古いSPAを開いたままのタブ**と、ECSの入れ替え中に新旧タスクが併存する間は、古いWebが新しいAPIを
  呼ぶ。

## 14. Verification

後で埋める。タスクの「必要な検証」（成功/異常の具体例を契約で検証し、Web/APIで解釈が一致すること。
一覧の続き・日付境界・再試行・認証失効・削除済みDot・互換性の例のレビュー）を含める。

## 15. Definition of Done

- TASK-005の完了条件をすべて満たす。
- 契約の正本が実装タスクから参照でき、選んだ方法で検証できる。
- 関連文書の更新が済み、人間が契約の内容を説明できる。

## 16. Completion Record

未完了。

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

回答テンプレート:

```text
Q1: A
Q2: A
Q3: A
Q4: A
```
