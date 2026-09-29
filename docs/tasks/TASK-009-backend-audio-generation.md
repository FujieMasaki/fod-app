# TASK-009: 音声内容からのDot生成と保存のBackend実装

| 項目 | 内容 |
| --- | --- |
| ID | TASK-009 |
| タスク名 | 音声内容からのDot生成と保存のBackend実装 |
| 対象領域 | Backend |
| 作業区分 | 実装 |
| 優先度 | P1 |
| 状態 | Blocked |

## 目的と作業範囲

決定した音声の受け渡し方式とAI providerを使い、録音内容からDotを生成してTASK-008の永続保存へつなぐ。**文字起こしとJobは2026-09-29にTASK-003で採用済み**（Amazon Transcribe東京、Amazon BedrockのClaude、Solid Queueによる非同期、clientはpolling）。保持・削除方針のうち処理中の一時データの扱いを本タスク、期限による削除と削除要求への対応をTASK-013で扱う。音声を預かるS3 bucket（非公開・暗号化・**versioningを有効にしない**・lifecycleは保険）とIAMの用意、AWS SDKの導入もこのタスクの前提に含む。versioningを有効にする場合は、noncurrent versionのexpiration・期限切れdelete markerの削除・実体が消える削除方法をセットで実装する。replication・backup・object lockの有無も確認する。処理の記録（処理ID＝冪等性key＝録音attemptの識別子・所有者・`started_at`・現在有効な音声と文字起こし結果のobject key・Transcribeのjob名・試行番号・受理時刻・再試行期限・状態・世代番号・最終進捗時刻・失敗の種類）をserverで持ち、再試行とJob実行で所有者を照合する仕組みもここで作る。

**TASK-003の状態機械をそのまま実装する。**[TASK-003 Plan §20](../implementation-plans/2026-09-29-task-003-generation-design.md)が状態と遷移を表で定義しているので、**表にあるすべての遷移をテストで1本ずつ検証する**（下記の完了条件）。文書だけで閉じたと判定するのが難しい領域なので、実装時にテストで閉じる。

このタスクの前提として次も行う。**Amazon TranscribeのAI services opt-out policyを適用し、effective policyで効いていることを確認してから音声を外部へ送る**（設定前に送ると、後からopt-outしても送った事実は消えない）。Bedrockのmodel idは**推論が日本国外へ出ない経路**（Geo: JPまたは`bedrock-mantle`のIn-Region）から選び、data retention modeを確認する。**MVPは`bedrock-runtime`のGeo: JPを既定**とし、In-Regionを採るならSigV4付きHTTP clientの選定を含める。文字起こし結果は`OutputBucketName`を指定して自前のbucketへ出し、prefixごとにIAM権限を分ける。録音形式（webm/opus・mp4/aac）の疎通を実ファイルで確認する。

2026-09-29にTASK-004で、Dotの`date`を`started_at`（録音開始操作をserverが受理した時刻）から算出し、その値を**録音attempt**から決めると採用した。処理の記録を扱う本タスクで、**attemptの識別子を初回uploadで1つの処理記録へ原子的に関連付けて一回性を担保する**実装を行う。同じattemptの同時並行送信、応答前のupload失敗、処理記録が作られる前の失敗でも、二重の処理やDotが生まれないようにする。upload受理後の24時間再試行はattemptの再利用ではなく処理記録で認可し、再試行やJob再実行でも元の`started_at`を維持する。契約は[TASK-005](TASK-005-product-api-contract.md)、Dotへの保存と日付算出は[TASK-008](TASK-008-backend-dot-history.md)、不変条件は[TASK-004 Plan §18-3](../implementation-plans/2026-09-28-task-004-history-design.md)。

## 確認可能な完了条件

- [ ] 認証済み利用者の音声内容を決定した経路で受け取り、形式・サイズ等を検証できる。別利用者の入力や処理結果を利用できない。
- [ ] Backendから選定providerを呼び出し、実際の録音内容に基づくDotを生成する。providerの秘密情報をWebへ渡さない。
- [ ] 生成結果を検証して本人のDotとして保存し、契約どおり結果を返す。非同期の状態取得（polling）と文字起こし全文の受領通知（ACK）まで成立する。
- [ ] **TASK-003 Plan §20の状態表にあるすべての遷移を、状態遷移テストで1本ずつ検証している。**Plan §24のシナリオのうち、遷移に対応しない性質（polling時の判定・認可・冪等性・個別資源のcleanup失敗）も別にテストする。
- [ ] 止まった処理を状態ごとに検知して回収できる。放置された`uploading`をwatchdogが拾い、Transcribeの完了待ちは`GetTranscriptionJob`で生きているか判定し、生きているjobを二重に開始しない。
- [ ] 退会の受理以降、新しい保存・再試行・結果の確定が起きない。利用者の行のlockと世代番号で排他し、Transcribeの終端後にBedrockへ送る前にも確認する。進行中の処理が0になるまで完了としない。
- [ ] **（結果の振る舞い）録音attemptの識別子を処理IDとして使い、再試行・Job再実行でも`started_at`を書き換えない。**同じattemptの再送は新しい処理を作らず既存の状態を返す。使用済みであることを理由に、受理後の正規の再試行を拒否しない。
- [ ] **異なる利用者の録音attemptが同じAWSの名前（S3のkey・`TranscriptionJobName`）を作らない。**処理IDがAWSアカウント内で一意であること、**`<処理ID>-<文字起こし試行番号>`として組み立てた後のjob名全体**が文字種と長さの制約（`^[0-9a-zA-Z._-]+`、最大200文字）に収まることを、実際の値で確認する。**処理ID単体ではなく、試行番号を付けた後で判定する。**
- [ ] **削除ACKを受け取ったあとは、cleanupが終わる前にpollingが来ても文字起こし全文を返さない。**期限切れ・Dotの完全削除・退会も同じ。**物理削除の完了に依存させない。**
- [ ] **再uploadを許す窓が録音attemptの期限を超えない。**期限が切れていれば再uploadを受け付けず、録り直しを案内する。
- [ ] **`succeeded_cleanup_pending`でcleanup再試行（T17）と削除・退会の受理（T22）が競合したときの期待結果を検証している。**T22が優先し、以後pollingは全文を返さず、進行中のcleanupの実行も最終的にcancel側の後片付けへ収束する。両方の実行順でテストする。
- [ ] **cleanupの5つの契機それぞれで、認可条件と削除対象と他の処理への非波及を検証している。**遷移テストだけでは網羅できない（ACKは状態遷移を伴わず、契機ごとに削除範囲が違うため）。
  - 成功の確定: **音声だけ**を消し、文字起こし結果はACKまで残る
  - ACKの受領: 文字起こし結果とTranscribeのjobを消す。認可は`current_user.dots`と`(user_id, 処理ID)`の両方
  - 期限到来: その処理の全部
  - Dotの完全削除: **そのDotを作った処理の分だけ。**同じ利用者の他の録音（生成中・再試行待ち）を巻き込まない
  - 退会: 本人の全処理の分
- [ ] 音声・文字起こし結果・Transcribeのjobのcleanupが冪等で、失敗しても状態を保ったまま再実行できる。**古いPUTが後から完成した場合も、prefixの列挙とlifecycleで回収できる。**PUTの実行と終了の実際の挙動を確認したうえで判断している。
- [ ] 文字起こしテキストとBedrockのrequest / responseがログ・error trackingに出ない。
- [ ] 送信・外部AI・生成結果の検証・保存の各失敗を区別して扱い、未保存なのに保存済みと返さない。
- [ ] 再送・retry・Job再実行の重複防止、または利用者への明確な結果通知を設計どおり実装している。
- [ ] **（原子的関連付けの実装）**録音attemptの識別子を初回uploadで1つの処理記録へ原子的に関連付け、同じattemptの再送・同時並行送信で二重の処理やDotを作らない。upload受理後の再試行は処理記録で認可し、attemptが使用済みであることを理由に正規の再試行を拒否しない。再試行やJob再実行でも元の`started_at`を維持する。
- [ ] 処理中・中断・失敗時の一時データとログをTASK-002の方針に従って扱い、関連する現行仕様・architectureを更新している。

## 依存するタスクID

- TASK-002
- TASK-003
- TASK-005
- TASK-006
- TASK-008

依存関係の上流にある設計判断・API契約が未確定のためBlocked。確定後は依存先の提供状況を確認して着手する。

## 根拠となる仕様書と見出し

- [product.md](../product.md) — 「2. MVPで成立させる体験と完成条件」
- [journaling.md](../journaling.md) — 「2. データと正本」
- [journaling.md](../journaling.md) — 「3. モックと実サービスの区別」
- [journaling.md](../journaling.md) — 「4. 実サービスのMVP受け入れ条件」

## 必要な検証

- 入力制約、外部AI失敗、不正な生成結果、保存失敗、応答喪失と同一処理の再実行を含む統合テスト。
- **状態遷移テストを先に書く**（§20の状態表にあるすべての遷移）。Job再実行・途中失敗・状態取得・ACK・cleanupの再実行を含める。providerを制御したテストに加え、実サービス接続で録音内容がDotへ反映されることを確認。worker concurrency・DB pool・CPU/memory・deploy中断時の回収時間を実測し、Pumaと同居させたままで成立するかを判断する。
- 別利用者の音声・生成処理・結果へのアクセス拒否と、一時データ・ログの実際の扱いを確認。

## 関連Implementation Plan

未作成。着手時にAGENTS.mdの規約に従って作成し、ここへリンクを追記する。
