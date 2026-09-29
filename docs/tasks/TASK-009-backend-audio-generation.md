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

決定した音声の受け渡し方式とAI providerを使い、録音内容からDotを生成してTASK-008の永続保存へつなぐ。**文字起こしとJobは2026-09-29にTASK-003で採用済み**（Amazon Transcribe東京、Amazon BedrockのClaude、Solid Queueによる非同期、clientはpolling）。保持・削除方針のうち処理中の一時データの扱いを本タスク、期限による削除と削除要求への対応をTASK-013で扱う。音声を預かるS3 bucket（非公開・暗号化・**versioningを有効にしない**・lifecycleは保険）とIAMの用意、AWS SDKの導入もこのタスクの前提に含む。versioningを有効にする場合は、noncurrent versionのexpiration・期限切れdelete markerの削除・実体が消える削除方法をセットで実装する。replication・backup・object lockの有無も確認する。処理の記録（処理ID＝冪等性key・所有者・provider ID・現在有効な音声と文字起こし結果のobject key・Transcribeのjob名・attempt番号・受理時刻・再試行期限・状態・世代番号・最終進捗時刻・失敗の種類）をserverで持ち、再試行とJob実行で所有者を照合する仕組みもここで作る。

**TASK-003の状態機械をそのまま実装する。**[TASK-003 Plan §20](../implementation-plans/2026-09-29-task-003-generation-design.md)が9つの状態と21本の遷移（T1〜T21）を定義しているので、**遷移をテストで1本ずつ検証する**（下記の完了条件）。文書だけで閉じたと判定するのが難しい領域なので、実装時にテストで閉じる。

このタスクの前提として次も行う。**Amazon TranscribeのAI services opt-out policyを適用し、effective policyで効いていることを確認してから音声を外部へ送る**（設定前に送ると、後からopt-outしても送った事実は消えない）。Bedrockのmodel idは**推論が日本国外へ出ない経路**（Geo: JPまたは`bedrock-mantle`のIn-Region）から選び、data retention modeを確認する。**MVPは`bedrock-runtime`のGeo: JPを既定**とし、In-Regionを採るならSigV4付きHTTP clientの選定を含める。文字起こし結果は`OutputBucketName`を指定して自前のbucketへ出し、prefixごとにIAM権限を分ける。録音形式（webm/opus・mp4/aac）の疎通を実ファイルで確認する。

## 確認可能な完了条件

- [ ] 認証済み利用者の音声内容を決定した経路で受け取り、形式・サイズ等を検証できる。別利用者の入力や処理結果を利用できない。
- [ ] Backendから選定providerを呼び出し、実際の録音内容に基づくDotを生成する。providerの秘密情報をWebへ渡さない。
- [ ] 生成結果を検証して本人のDotとして保存し、契約どおり結果を返す。非同期の状態取得（polling）と文字起こし全文の受領通知（ACK）まで成立する。
- [ ] **TASK-003 Plan §20の遷移T1〜T21を、状態遷移テストで1本ずつ検証している。**Plan §24の34シナリオのうち、遷移に対応しない性質（polling時の判定・認可・冪等性・個別資源のcleanup失敗）も別にテストする。
- [ ] 止まった処理を状態ごとに検知して回収できる。放置された`uploading`をwatchdogが拾い、Transcribeの完了待ちは`GetTranscriptionJob`で生きているか判定し、生きているjobを二重に開始しない。
- [ ] 退会の受理以降、新しい保存・再試行・結果の確定が起きない。利用者の行のlockと世代番号で排他し、Transcribeの終端後にBedrockへ送る前にも確認する。進行中の処理が0になるまで完了としない。
- [ ] **cleanupの5つの契機それぞれで、認可条件と削除対象と他の処理への非波及を検証している。**遷移テスト（T1〜T21）だけでは網羅できない（ACKは状態遷移を伴わず、契機ごとに削除範囲が違うため）。
  - 成功の確定: **音声だけ**を消し、文字起こし結果はACKまで残る
  - ACKの受領: 文字起こし結果とTranscribeのjobを消す。認可は`current_user.dots`と`(user_id, 処理ID)`の両方
  - 期限到来: その処理の全部
  - Dotの完全削除: **そのDotを作った処理の分だけ。**同じ利用者の他の録音（生成中・再試行待ち）を巻き込まない
  - 退会: 本人の全処理の分
- [ ] 音声・文字起こし結果・Transcribeのjobのcleanupが冪等で、失敗しても状態を保ったまま再実行できる。**古いPUTが後から完成した場合も、prefixの列挙とlifecycleで回収できる。**PUTの実行と終了の実際の挙動を確認したうえで判断している。
- [ ] 文字起こしテキストとBedrockのrequest / responseがログ・error trackingに出ない。
- [ ] 送信・外部AI・生成結果の検証・保存の各失敗を区別して扱い、未保存なのに保存済みと返さない。
- [ ] 再送・retry・Job再実行の重複防止、または利用者への明確な結果通知を設計どおり実装している。
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
- **状態遷移テストを先に書く**（T1〜T21）。Job再実行・途中失敗・状態取得・ACK・cleanupの再実行を含める。providerを制御したテストに加え、実サービス接続で録音内容がDotへ反映されることを確認。worker concurrency・DB pool・CPU/memory・deploy中断時の回収時間を実測し、Pumaと同居させたままで成立するかを判断する。
- 別利用者の音声・生成処理・結果へのアクセス拒否と、一時データ・ログの実際の扱いを確認。

## 関連Implementation Plan

未作成。着手時にAGENTS.mdの規約に従って作成し、ここへリンクを追記する。
