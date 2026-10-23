# TASK-009 音声内容からのDot生成と保存のBackend実装 Implementation Plan

## 1. Status

実施中（2026-10-24）。コード（状態機械・API・Job・AWSのadapter）はproviderを差し替えたtestで閉じた。
実サービスでの確認（AWSの資源・認証・model idの受け入れ）は人間の作業が要るので、§5「人間の作業が要るもの」で止めている。

## 2. Goal

録音した音声をserverが受け取り、Amazon Transcribe（東京）で文字起こしし、Amazon BedrockのClaudeで
`sentence`と`summary`を生成して、本人のDotとして保存する。clientはpollingで結果を受け取り、
文字起こし全文を端末へ保存したら受領通知（ACK）を送る。止まった処理・失敗・退会・期限・取り消しのどれでも、
預けた音声と文字起こし結果を後片付けまで追う。

利用者から見ると、TASK-010/011（画面）が使う生成のAPI（`generation` tag）がそろう。

## 3. Background

- TASK-003で、provider（Transcribe東京・BedrockのClaude）、Solid Queueによる非同期、polling、
  処理の記録と9つの状態・22の遷移、入口の手続き、cleanupの5契機、命名規則を採用した
  （[TASK-003 Plan](2026-09-29-task-003-generation-design.md) §19・§20・§24・§27。
  architecture「生成の実行方式」）。
- TASK-004で`started_at`を録音attemptから決め、一回性を初回uploadの原子的関連付けで担保すると決めた
  （[dot-history.md §2](../dot-history.md)、TASK-004 Plan §18-3）。
- TASK-005で`generation` tagのendpointと、録音attemptを「serverが暗号化・署名したtokenを端末のmemoryにだけ置く」
  形にした（[`contracts/openapi.yaml`](../../contracts/openapi.yaml)）。処理の取り消し（`DELETE /api/v1/generations/{id}`）を
  足し、その認可はarchitectureが正本。
- TASK-008で`dots`（`generation_id`と`(user_id, generation_id)`の一意制約）を用意した。
- TASK-025で、Transcribeのopt-out、Bedrockの保持の`none`への固定（東京・大阪、SCP）を済ませた。
  model idごとの確認、IAM policyの中身、`none`のもとでのCSAMの扱いはこのタスクへ残した
  （[TASK-003 Plan](2026-09-29-task-003-generation-design.md) §26）。

## 4. Current State

- 開始時点はmain `71832f0`。Rails 8.1.3.1、PostgreSQL。
- tableは`users`・`user_identities`・`rate_limit_counters`・`dots`。`users`に退会の状態と世代番号の列は無い
  （TASK-008 Planは「TASK-013で足す」としたが、TASK-013はこのタスクに依存し、ここで排他に要る。§12）。
- Job基盤は無い（`AuthMailJob`はActive Jobの既定のadapter）。AWS SDKは入っていない。
- 契約には`generation` tagの5つのendpointが既にある。実装は無い。
- `ApiRequestGuard`はJSON以外のbodyを拒否する。multipartを受けるendpointを個別に許す一覧がある
  （architecture「決定済み」）。
- **このマシンにAWSの認証情報は無い**（TASK-003 Plan §26。2026-10-23に人間が確かめた）。開発・検証は
  IAM Identity Center経由で「アプリ用」アカウントだけを使う決定で、ログインは人間が行う。
- 対象の実装と仕様の差異: 契約の`TranscriptUnavailable`は「ACK後」と「期限後」を区別しない。ACK後に
  cleanupが終わるまでのあいだ全文を返さないには、処理の記録に「全文をもう返さない」という印が要る
  （TASK-003 Plan §27の「ACK自体を保存する必要はない」は、ACKの事実を別に残さないという意味で、記録の列で持つことと
  矛盾しない。記録はcleanupの後に消える）。

## 5. Scope and Non-goals

### 今回の対象

- 録音attemptの発行（`POST /api/v1/recording_attempts`）と、暗号化・署名したtokenの検証
- 音声の受け取り（`POST /api/v1/dots`。multipart・32MB・`audio/webm`/`audio/mp4`）と、S3への一時保存
- 処理の記録（`generations` table）、9つの状態、T1〜T22の遷移、入口の手続き（利用者の行のlock・世代・期限・lease）
- Job: 文字起こしの開始・完了待ち・生成・保存・cleanup、止まった処理の回収（watchdog）、期限の到来
- polling（`GET /api/v1/generations/{id}`）・再試行（`POST .../retry`）・ACK（`DELETE .../transcript`）・
  処理の取り消し（`DELETE /api/v1/generations/{id}`）
- 退会とDotの完全削除で使うcleanupの入口（service）。endpointはTASK-013（§12）
- 使用済みattemptの`id`と期限の記録（取り消し・完全削除・退会の後の作り直しを防ぐ）
- AWSのadapter（S3・Transcribe・Bedrock）と、testで差し替える偽物
- 文字起こしテキストとBedrockのrequest / responseをログに出さないこと
- 関連する現行文書（architecture・privacy・backend）の実装済み範囲の反映

### 今回の対象外

- 退会・ゴミ箱・完全削除のendpointと退会の状況（TASK-013）。このタスクは、そのendpointが呼ぶcleanupの入口と
  `users`の列までを用意し、serviceのtestで5契機を確かめる。
- 画面（TASK-010/011）。
- 本番環境（ECS）の構築。2026-10-21時点で担当タスクが無い（TASK-003 Plan §26）。

### 人間の作業が要るもの（止まる条件。コードを書き終えたところで止める）

| # | 内容 | 止まる理由 | 依存する完了条件 |
| --- | --- | --- | --- |
| H1 | アプリ用アカウントにS3 bucket（非公開・暗号化・versioning無効・lifecycle・replication/object lock無し）と、RailsとTranscribeのIAM権限を作る | 外部サービスの設定・課金 | 実サービス接続・`DeleteTranscriptionJob`の範囲・古いPUT・8の(a) |
| H2 | 開発マシンでIAM Identity Centerにログインし、`aws sts get-caller-identity`の結果がアプリ用か確かめる（最初の1回は人間の確認が要る） | 秘密情報・完了条件が人間の確認を求める | 外部へ送る前の呼び出し元の確認 |
| H3 | Bedrockのmodel idを選び、`none`で呼べること・期限付きの例外に頼らないこと・推論先が国内に収まることを一次資料と実際の呼び出しで確かめる。CSAMの検知による保存・レビューが`none`で止まるかを確かめ、確かめられなければ受け入れを判断する | 完了条件が「確かめられなければ人間の判断を求めて止まる」とする | model idごとの確認・CSAM・国内経路 |
| H4 | PumaとSolid Queueの同居の実測（concurrency・DB pool・CPU/memory・deploy中断時の回収時間） | ECSが無い。担当タスクの判断が要る | 必要な検証 |

### 今回確定しない事項

- 具体的なmodel idと最終的なpromptの文面（H3。promptは実データを見て詰める。TASK-003 Plan §17）。
- watchdogとpollingの間隔の実値は、下記§7の初期値で入れ、実測（H4）で見直す。

### 実装の中で決めたこと（人間の確認を求める）

設計の大枠はTASK-003・TASK-005で決まっている。その範囲で、次をこのタスクで決めた。PRの「確認すること」に挙げる。

- **回数の制限**（契約のRateLimitedが「採否と具体値はTASK-009で決める」としていた）: 採る。利用者ごとに1時間で、
  録音attemptの発行60回・送信60回・再試行30回。日々の記録として十分に多く、自動化された大量の送信だけを止める値にした。
- **Transcribeの完了待ち**: threadを占有せず、15秒ごとに自分をもう一度enqueueする（§8）。
- **`users`の列**: 退会の受理時刻（`deletion_requested_at`）と世代番号（`generation`）をここで足した（§12）。
- **送信でS3に置けなかったとき**: `202`で`failed`（`upload_incomplete`）を返し、同じattemptで送り直させる。

## 6. References and Documents to Update

- 参照: [TASK-003 Plan](2026-09-29-task-003-generation-design.md) §17・§19・§20・§24・§26・§27、
  [TASK-004 Plan](2026-09-28-task-004-history-design.md) §18-3、[TASK-005 Plan](2026-10-01-task-005-api-contract.md)、
  [TASK-008 Plan](2026-10-05-task-008-dot-history.md)、[architecture](../architecture.md)「音声・文字起こしの経路と保持」
  「生成の実行方式」「データ所在地と費用」、[privacy.md](../privacy.md) §5、[dot-history.md](../dot-history.md) §2、
  [backend.md](../development/backend.md)、[contracts/README.md](../../contracts/README.md)、
  [code-review/backend](../code-review/backend/README.md)
- 更新: `docs/architecture.md`（実装済みへの反映・Job基盤）、`docs/privacy.md` §5-1（実装に合わせた記述。
  外部provider行は実サービスの確認後）、`docs/development/backend.md`（Job基盤とstorageが未実装という記述）、
  `docs/tasks/TASK-009-backend-audio-generation.md`

## 7. Proposed Approach

### 7-1. データ

- `users`に`deletion_requested_at`（NULLがactive）と`generation`（世代番号。退会の受理で1増やす）を足す。
- `generations`（処理の記録）を作る。主キーは録音attemptの`id`（UUID v4。serverが発行するので
  AWSアカウント内で一意）。列: `user_id`・`started_at`・`duration_seconds`・`audio_content_type`・`accepted_at`・
  `retry_expires_at`・`state`・`user_generation`・`upload_attempt`・`transcription_attempt`・`audio_key`・
  `transcript_key`・`transcription_job_name`・`lease_token`・`lease_expires_at`・`last_progress_at`・`failure_kind`・
  `cancel_reason`・`transcript_withheld_at`。`state`と`failure_kind`はcheck制約で値を限る。
  `user_id`の外部キーは`on_delete: :restrict`（cleanupの情報を持つ記録を、利用者の行の削除で黙って消さない）。
- `consumed_recording_attempts`（`id`と`expires_at`だけ）。privacy.md §5-1の行のとおり。
- Solid Queueのtableは**同じDB**に置く（TASK-003 Plan §20「Solid QueueがRDSを使うため、Jobと記録の整合を同じDBで
  扱える」。記録の更新とenqueueを同じtransactionに入れられる）。

### 7-2. 名前（TASK-003 Plan §20「命名」）

- 音声: `audio/<処理ID>/<upload試行番号>`、文字起こし結果: `transcripts/<処理ID>/<文字起こし試行番号>.json`、
  job名: `<処理ID>-<文字起こし試行番号>`。job名は組み立てた後で`\A[0-9a-zA-Z._-]+\z`と200文字以下を検査し、
  満たさなければ例外にする（UUIDは36文字なので、試行番号が163桁を超えない限り満たす）。

### 7-3. 状態機械

- すべての遷移は`UPDATE generations SET ... WHERE id = ? AND state IN (遷移元)`の条件付き更新で行い、
  更新した行数で勝敗を決める（`Generation.transition!`）。
- 入口の手続き（retry・再upload・cleanup・取り消し・Transcribeの終端後）は`GenerationGate`に集める:
  利用者の行を`FOR UPDATE` → 遷移元の確認 → 契機ごとの認可 → lease発行と条件付き更新 → commit →
  外部の呼び出し。
- 遷移ごとの実装:

| 遷移 | 起こすもの |
| --- | --- |
| T1 uploading→accepted / T2 →upload_failed / T3 →cancel_requested | upload service（PUTの成否・世代の再確認）、watchdog（`HeadObject`）／取り消し・退会・期限 |
| T4 upload_failed→uploading / T5 →cancel_requested | 同じattemptでの再送（期限内・旧lease失効）／取り消し・退会・期限 |
| T6 accepted→transcribing / T7 →cancel_requested | 文字起こし開始Job／取り消し・退会・期限 |
| T8 transcribing→generating / T9 →failed / T10 →cancel_requested | 完了待ちJob（`GetTranscriptionJob`の終端後に入口を通す）／同左 |
| T11 generating→succeeded_cleanup_pending / T12 →failed / T13 →cancel_requested | 生成Job（Dotのinsertと同一transaction）／同左 |
| T14 failed→transcribing / T15 →generating / T16 →cancel_requested | 再試行（全文が残っていれば生成から）／同左 |
| T17 succeeded_cleanup_pending→自分 / T18 →削除 / T22 →cancel_requested | cleanup Job（失敗時は新しいleaseで再実行）／Dotの完全削除・退会 |
| T19 cancel_requested→cleanup_pending | cancelを受理した入口が続けて行う |
| T20 cleanup_pending→自分 / T21 →削除 | cleanup Job（非終端のjobは終端まで待つ） |

- Transcribeの完了待ちはworkerのthreadを占有しない。完了待ちJobが`GetTranscriptionJob`を1回呼び、非終端なら
  一定時間後に自分をもう一度enqueueする（§8・§12）。
- cleanupは契機ごとの範囲を記録の状態と`transcript_withheld_at`から決める。`succeeded_cleanup_pending`では
  音声のprefixを消し、全文を返さない印（ACK・期限）が付いていれば文字起こし結果とjobも消して記録を消す。
  `cleanup_pending`では非終端のjobを待ってから全部を消す。消すときは現在有効なkeyではなくprefixを列挙して消す。
- watchdog（定期Job）: 更新の止まった`uploading`を`HeadObject`で判定、enqueueの無い`accepted`の再enqueue、
  `transcribing`の再確認、leaseの切れたcleanupの再実行、期限を過ぎた記録のcancel。
- 初期値: watchdogは1分ごと、`uploading`は最終進捗から5分でstale、leaseは15分、完了待ちの間隔は30秒、
  pollingの`poll_after_seconds`は5秒。実測（H4）で見直す。

### 7-4. API

- 契約どおりの5つのendpoint。認可は常に`current_user`へscopeし、IDを知っていることを権限にしない。
- `POST /api/v1/dots`: multipartを解釈する前に`X-Recording-Attempt`を検証し、既存の記録があれば本文を読まずに返す。
  `ApiRequestGuard`の一覧にこのendpointだけを足す。
- pollingは先に`dots`を見る。全文は、記録が残り、`transcript_withheld_at`が無く、期限内のときだけ返す。

### 7-5. 外部

- AWS SDK（`aws-sdk-s3`・`aws-sdk-transcribeservice`・`aws-sdk-bedrockruntime`）。regionは`ap-northeast-1`に固定し、
  SDKのloggerを付けない。Bedrockは`Converse`で呼び、出力をschemaで検証する（`sentence` 200字・`summary` 2000字。
  `dots`のcheck制約と同じ）。
- 認証はSDKの既定の探索（開発はIAM Identity Center、本番はECS task role）。長期キーを読まない。
- 外部へ最初に送る前に、呼び出し元のアカウントを`sts get-caller-identity`で確かめるrake task（`generation:verify_caller`）を置く。
  比べる値はgitに入れないローカルの環境変数（`FOD_APP_ACCOUNT_ID`）から読み、リポジトリに記録しない。

## 8. Why This Approach

- TASK-003の状態機械を、遷移ごとに1か所の条件付き更新として実装すると、遷移テストを1本ずつ書ける
  （完了条件4）。読んでから更新する形では、retryとcancelが両方勝つ競合を防げない（TASK-003 Plan §20）。
- 完了待ちを「1回見て、終わっていなければ自分をもう一度enqueueする」形にすると、threadを占有しない。
  EventBridgeのような新しいAWS構成を足さずに済み、Solid Queueの中で閉じる。TASK-003 Plan §19の
  「threadを占有し続ける方式は、実測で成立しなければ分割する」の分割を、AWS構成を増やさずに先に行う形である。
- AWSのadapterを小さな境界にしておくと、状態機械のtestは偽物で決定的に書け、adapterのtestはSDKの
  `stub_responses`で書ける（新しいtest用gemが要らない）。

## 9. Data Flow

```text
Web: POST /recording_attempts → token（memoryだけ）
Web: POST /dots（X-Recording-Attempt + multipart）
  → Controller → GenerationUpload
     → [tx] users FOR UPDATE → active確認 → generations(uploading)作成 → commit
     → S3 PutObject(audio/<id>/<n>)
     → [tx] users FOR UPDATE → 世代確認 → uploading→accepted ＋ enqueue（同じDB）
  ← 202 Generation(processing)
Job: accepted→transcribing → Transcribe StartTranscriptionJob(<id>-<n>, Output transcripts/<id>/<n>.json)
Job(繰り返し): GetTranscriptionJob → 終端 → 入口（lock・active・世代・期限）→ transcribing→generating
Job: S3から全文 → Bedrock Converse → schema検証
     → [tx] users FOR UPDATE → 世代確認 → dots insert ＋ generating→succeeded_cleanup_pending
Job: cleanup（音声 → ACK/期限の後に全文とjob → 記録の削除）
Web: GET /generations/{id} → dotsを先に見る → succeeded（全文は条件つき）／processing／failed／expired
Web: DELETE /generations/{id}/transcript → transcript_withheld_at → cleanup
```

正本: Dotは`dots`、処理の途中の状態は`generations`、音声と全文はS3（一時）。

## 10. Files to Change

合計で20を超えるので分ける（[分け方](../development/pull-requests.md#分け方)）。統合ブランチは
`feat/task-009-audio-generation-integration`。数はレビュー対象（lockfile・`schema.rb`を除く）の見積もり。

| 順番 | ブランチ | 内容 | 主なファイル | 数 |
| --- | --- | --- | --- | --- |
| 1 | `feat/task-009-1-generation-model` | Plan・データと状態機械の核 | このPlan、migration 3つ（users・generations・consumed attempts）、`Generation`・`ConsumedRecordingAttempt`・`User`の変更、`GenerationNaming`、model spec、factory | 12 |
| 2 | `feat/task-009-2-job-and-aws` | Job基盤とAWSのadapter | Gemfile、Solid Queueのmigrationと設定、`config/generation.yml`（model id・prompt）、S3・Transcribe・Bedrockのadapterとspec、呼び出し元の確認 | 20 |
| 3 | `feat/task-009-3-cleanup` | 入口の手続き・取り消し・cleanup・ACK・期限・退会/完全削除の入口（T3・T5・T7・T10・T13・T16〜T22） | `GenerationGate`、取り消し・cleanup・ACK・期限のserviceとJob、定期実行の設定、偽物のprovider、遷移テストと5契機のspec | 19 |
| 4 | `feat/task-009-4-pipeline` | 受理から保存まで（T1・T2・T4・T6・T8・T9・T11・T12・T14・T15）とwatchdog | attempt token、upload・文字起こし開始/完了待ち・生成と保存・再試行・watchdogのserviceとJob、遷移テスト | 20 |
| 5 | `feat/task-009-5-api` | endpoint | routes・controller・serializer・`ApiRequestGuard`・回数の制限・request spec・通しのspec | 16 |
| 6 | `feat/task-009-6-docs` | 文書と完了の記録 | 契約の回数の記述、呼び出し元を表示するtask、architecture・privacy・backend、TASK-013への申し送り、このPlanとタスクファイル | 8 |

取り消し・cleanupを受理から保存までより先に置くのは、受理の側（uploadの世代のずれ、Transcribeの終端後の確認）が
取り消しの入口を呼ぶためである。取り消しの遷移は、testでは記録を各状態で作って確かめられる。

## 11. Libraries / APIs

- **solid_queue**: TASK-003で採用済みのJob基盤。Rails 8の標準。同じDBに置く。
- **aws-sdk-s3 / aws-sdk-transcribeservice / aws-sdk-bedrockruntime**: S3の一時object、Transcribeのバッチ、
  BedrockのConverse。HTTPを自前で署名する代替は、SigV4の実装を持つことになり採らない。`aws-sdk-sts`は
  `verify_caller`だけで使う（`aws-sdk-core`に含まれる）。
- **ActiveSupport::MessageEncryptor**: attempt tokenの暗号化と署名（契約が「暗号化・署名」と定める）。
  鍵は`secret_key_base`から用途別に導く。

## 12. Alternatives Considered

- **`users`の列をTASK-013で足す**（TASK-008 Planの記述）: TASK-013はこのタスクに依存し、ここで排他（完了条件6）を
  実装するには列が要る。ここで足し、TASK-013は退会のendpointからこの列とcleanupの入口を使う。
- **完了待ちでthreadを占有する**（TASK-003 Plan §19の当初案）: 30分の音声ではthreadを数分以上持ち、Pumaと同居する
  1タスク構成で詰まりやすい。再enqueueの形はthreadを持たず、Solid Queueの外の構成も増えない。
- **EventBridgeで完了を受ける**: AWS構成とIAMが増える。MVPの必須にしないとTASK-003が決めている。
- **Solid Queueを別DBに置く**（Rails 8の既定）: 記録の更新とenqueueが別transactionになり、record-firstの排他を
  2つのDBにまたがって考えることになる。

## 13. Risks / Things to Watch

- 同時実行: 遷移はすべて条件付き更新、記録の作成は主キーの一意制約で衝突させる。同じattemptの並行POSTは
  一方だけが記録を作り、他方は既存を返す。
- 古いPUTが後から完成する: keyを試行番号ごとに分け、cleanupはprefixを列挙して消す。lifecycleは保険。
  PUTの実際の挙動はH1の後に確かめる。
- ログ: 文字起こし・Bedrockのrequest/responseを例外のmessageにも入れない。SDKのloggerを付けない。
  `filter_parameters`に`audio`・`text`・`transcript`を足す。
- 退会: 退会の受理（TASK-013）がこのタスクの入口を通らずに`users`だけを書き換えると排他にならない。入口のserviceを
  TASK-013へ明示的に渡す。

## 14. Verification

### Automated

- model spec: 状態・失敗の種類の制約、条件付き更新、命名の制約（実際の値でjob名の文字種と長さ）
- 遷移テスト: T1〜T22を1本ずつ（`spec/services/generation_transitions/`）
- §24の遷移でない性質: polling時の判定、認可、冪等性、個別資源のcleanup失敗、T17とT22の競合（両方の順）、cleanupの5契機
- request spec: 契約との照合（committee）、認可、`Cache-Control: no-store`、ログに本文が出ないこと
- adapter spec: SDKの`stub_responses`でrequestの形（region・`OutputBucketName`・`OutputKey`・job名）を確かめる
- `pnpm check`相当（品質ゲート）

### Manual（H1〜H3の後）

- webm/opus・mp4/aacの実ファイルで、録音内容がDotへ反映されること
- `DeleteTranscriptionJob`で消える範囲、PUTの実行と終了の挙動、`none`のもとでの呼び出し

## 15. Definition of Done

- 自分で確かめられる完了条件をtestで満たし、H1〜H4に依存する完了条件を人間の作業として残す
- lint / testが通る
- 実装内容を人間が説明できる

## 16. Completion Record

- 状態: 実施中（2026-10-24）。コードとtestは6つのPRで終えた。実サービスでの確認（§5のH1〜H4）が残るので、タスクは
  In progressのまま。
- 実装差異:
  - PRを5つの予定から6つに分けた。文書と完了の記録を足すとAPIのPRが20を超えるため。取り消し・cleanupを受理から保存までの
    前に置いた（受理の側が取り消しの入口を呼ぶため）。
  - 2番目のPRで、定期実行の設定と呼び出し元を表示するtaskを後ろのPRへ移すコミットを足した（20ファイルに収めるため。
    履歴は書き換えていない）。
  - `POST /api/v1/dots`は、attemptを本文の解釈より前に検証して既存の処理を返すが、Railsのrequestのログ（Parameters）が
    actionの前にmultipartを解釈する。本文はPumaが受け取り終えているので、契約の「本文の再送信そのものは防げない」の範囲で、
    既存の処理の場合に音声を使わない・S3へ置かないことは守っている。
  - pollingは、Dotの無いまま`succeeded_cleanup_pending`に残る記録（Dotの完全削除の受理の前後）を404にした。
- 検証結果:
  - `cd apps/api && bundle exec rspec`: 610 examples, 0 failures（6番目のPRの時点）。
  - `bundle exec rubocop`: no offenses。`bundle exec brakeman -q`: No warnings。`bundle exec bundler-audit check`:
    crassの指摘（GHSA-pq4g-8rxf-4g29。mainにもある）を1.0.8へ上げて解消した。
  - 遷移テスト: `spec/services/generation_transitions/`にT1〜T22（T1・T2・T3・T4は`generation_upload_spec.rb`、
    T3は`cancellation_spec.rb`にも）。§24の遷移でない性質は`spec/requests/api/v1/generations_spec.rb`（polling・認可）、
    `generation_upload_spec.rb`（冪等性・並行送信）、`cleanup_triggers_spec.rb`（5契機）、`cleanup_spec.rb`（個別の失敗と
    T17/T22の競合の両方の順）。
  - 未実施（人間の作業が要る。§5）: 実サービスでの録音内容の反映、webm/mp4の実ファイル、`DeleteTranscriptionJob`の範囲、
    PUTの実際の挙動、model idごとの確認（推論の宛先・保持・人によるレビュー・cache）、`none`のもとでのCSAM、
    Transcribeのendpointの記録、呼び出し元の初回確認、Pumaとの同居の実測。
- 関連: メインのPR #101。

## 17. 未決定事項（止まった理由）

コードを書き終え、§5のH1〜H4に当たったので止める。どれも人間の作業か判断が要り、推測で進めない。

| # | 判断・作業 | 選択肢 | 確認済みの事実 |
| --- | --- | --- | --- |
| H1 | S3 bucketとIAMを誰がどう作るか | A: 人間がconsoleで作り、設定（非公開・暗号化・versioning無効・lifecycle・prefixごとの権限）をこのPlanへ記録する ／ B: IaC（Terraform等）をリポジトリに足す（新しいtoolの判断が要る） | アプリ用アカウントに資源は無い。コードはbucket名を`FOD_GENERATION_BUCKET`から読む |
| H2 | 開発マシンの認証と呼び出し元の初回確認 | 人間がIAM Identity Centerでログインし、`bin/rails generation:caller_identity`の結果がアプリ用か確かめ、`FOD_APP_ACCOUNT_ID`をgitに入れない設定へ置く | このマシンに既定の認証情報は無い（2026-10-23）。値が無い間、コードはAWSのclientを作らない |
| H3 | Bedrockのmodel idと受け入れ | 国内に収まる経路（Geo: JPのinference profile等）から、`none`で呼べ、期限付きの例外に頼らないmodelを選び、モデルカードで推論の宛先を確かめる。CSAMの検知による保存・レビューが`none`で止まるかを確かめ、確かめられなければ受け入れを判断する | `config/generation.yml`の`bedrock_model_id`は空で、空の間はBedrockへ送らない |
| H4 | Pumaとの同居の実測 | ECSが無いので、TASK-015など実環境を作るタスクで測るか、ローカルで代わりに測るか | worker 1プロセス3 thread、DBの接続数は既定5 |
