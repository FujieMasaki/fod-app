# TASK-003 AI生成と失敗・再試行の設計判断 Implementation Plan

> **この文書は判断の記録であり、現行の保持・削除条件の正本ではない**。期間・削除の契機・利用者への
> 説明の範囲は[privacy.md §5](../privacy.md)を見る。食い違いがあればprivacy.md §5が優先する。
> ここには比較した案、採用の理由、確認していないことが入る。

## 1. Status

完了（2026-09-29に人間が採用を決定）。**採用内容は未実装である**。実装はTASK-009/010/011、
API契約はTASK-005、削除と残存の検証はTASK-013/015で行う。

**2026-10-03に、人間の判断でデータ所在地の方針を変更した**（`architecture.md`「データ所在地と費用」を
「発話内容の保存と閲覧は日本国内に限る。推論のための一時的な処理は日本国外を許容する」へ。経緯は§18「2026-10-03の再確認」、判断の記録は§25）。
**providerの採用は案Aのままだが、続ける理由が変わり、案Cは不採用から保留になった。**

完了条件7（委託先への9項目の確認）は**このタスクでは満たしていない**。選定の条件として9項目を
記録し、確認先と確認方法を定めた。**一次資料を読んで確認できた項目もある**（§18、§26に項目別で
記録した）が、**9項目全体の確認、AWSアカウントの設定、日本の個人情報保護法上の評価は完了して
いない**。確認していない項目を「問題ない」と扱わない。
2026-10-08に、完了条件7を[TASK-025](../tasks/TASK-025-vendor-verification.md)へ切り出し、TASK-003をDoneにした。

**文字起こし結果の置き場（§27）は、レビュー指摘を受けて追加した5件目の判断である**。初稿は
「workerのmemoryのみ」としていたが、Amazon Transcribeのバッチは必ずS3へ書き出すため事実として
誤りだった。2026-09-29に案A（自前のS3へ置く）を採用し、`privacy.md §5-1`へデータ行を追加した。

## 2. Goal

録音した音声から個々のDotを生成する経路を、providerの選定・実行方式・失敗と再試行・固有名詞の
扱いまで含めて一つの流れとして説明できる状態にする。TASK-002が決めた保持・削除条件を壊さずに、
「誰が何を受け取り、失敗したら何が起きるか」を実装前に確定する。

## 3. Background

- [TASK-003](../tasks/TASK-003-generation-design.md)は、provider・prompt・文字起こしの採否・
  同期/非同期・冪等性・固有名詞の低減を決めることを求めている。
- [TASK-002 Plan](2026-09-28-task-002-data-lifecycle.md)が経路と保持・削除を先に決めた。音声は
  同一originのRails経由でS3東京へ一時的に預かり、Dotの保存まで通れば即削除、失敗しても受理から
  24時間で削除する。保存するのは`sentence`と`summary`だけで、文字起こし全文はRDSへ入れない。
- 同Planは**録音の上限を30分にした帰結として、同期HTTPでは完結しない見込み**と書き、TASK-003に
  非同期前提の検討を求めている（同Plan §25-8）。
- 同Planは2つの宿題をこのタスクへ明示的に渡している。**成功した処理の記録をいつ消すか**（§17の
  「処理の記録」行）と、**退会と進行中処理の排他方式**（§20の必須条件）である。
- [privacy.md §4](../privacy.md)は、音声が外部へ渡る前提はTASK-002で採用済みなので、TASK-003は
  「どの委託先へ何が渡り、いつ消えるかを一次資料で確認する」ことを求めている。
- [architecture.md](../architecture.md)の「未決定」に、background job基盤、AI provider・文字起こし
  provider・promptとその実装方法、同期/非同期の選択が残っている。

## 4. Current State

| 対象 | 現在の実装 | 確認したファイル |
| --- | --- | --- |
| 生成の呼び出し | `VITE_DOT_API_URL`未設定ならローカルmockを約2.5秒後に返す。設定時は`${VITE_DOT_API_URL}/dot`へ**本文なし**のPOST。利用者・音声・durationを送っていない。 | `journaling.md §1`、`architecture.md`「実装済み」 |
| server | Railsは`GET /up`のみ。`/api/v1`、認証、Dot保存、AI処理は未実装。 | `journaling.md §3` |
| Job基盤 | 未導入。`apps/api/Gemfile.lock`に`solid_queue`・`sidekiq`はなく、`app/jobs`はRailsの既定skeletonだけ。 | `apps/api/Gemfile`、`apps/api/Gemfile.lock` |
| AWS SDK | 未導入。`aws-sdk`系のgemはない。S3・Transcribe・Bedrockのいずれも呼べない。 | `apps/api/Gemfile.lock` |
| Railsの版 | 8.1.3.1。Solid Queueは同梱されていないが、Rails 8系の標準の選択肢として追加できる。 | `apps/api/Gemfile` |
| Dotの項目 | 現行schemaは`sentence` / `reflection` / `closing`を持つ。TASK-002が`sentence` / `summary`へ変更すると決めたが、コードは未変更。 | `apps/web/src/features/session/schema.ts` |

## 5. Scope and Non-goals

### 今回の対象

- 文字起こしとAI生成のprovider、リージョン、呼び出し方式。
- promptの方針と、生成結果として必要な項目（`sentence`・`summary`）の粒度。
- 非同期の実行基盤（Job基盤）、worker の置き場、clientへの結果の渡し方。
- 送信・生成・保存の状態と、失敗した場合の再開点。
- 冪等性の手段と、**成功した処理の記録をいつ消すか**（TASK-002からの相互確認事項）。
- **退会と進行中処理の排他**の状態遷移（TASK-002からの必須条件）。
- AIへ送る前に固有名詞等を減らす手段の比較と採否、採らない場合の利用者への説明。
- 委託先に確認する9項目の内容・確認先・確認方法の確定。
- 決定内容のproduct / journaling / privacy / architectureへの反映。

### 今回の対象外

- 深掘り対話の対話用AI呼び出しとprompt（TASK-018）。
- 週次・月次のAI振り返り（product.md §3の検証候補、MVP対象外）。
- request / response / errorの正式なAPI契約とerror code体系（TASK-005）。本Planは状態と再開点までを決める。
- Rails内部のdirectory構成とclass設計（TASK-009）。
- AWSリソース（bucket・IAM・Transcribe・Bedrockのモデルアクセス）の実際の作成（TASK-009）。

### 今回確定しない事項

- **委託先9項目の確認結果と委託契約の締結**（§26。人間が実施する）。
- Bedrockのモデル指定（具体的なmodel id）と、Transcribeの実際の対応形式の実機確認。どちらも
  §26の確認と実装時の疎通で確定する（TASK-009）。
- promptの最終文面。方針と必要項目までを決め、文面はTASK-009で実データを見ながら詰める。
- 生成の品質評価の方法と基準。
- **越境移転の規律への対応**（2026-10-03に追加。**完了条件7の項目3として元から挙げてあった確認で、
  未確認のまま残っていたもの**）。東京原則そのものは**2026-10-03に`architecture.md`
  「データ所在地と費用」を「発話内容の保存と閲覧は日本国内に限る。推論のための一時的な処理は日本国外を許容する」へ変更して決着した**
  （本Planの範囲外の判断として、正本の側を直す手順で行った。§18「2026-10-03の再確認」）。
  残るのは、**外国にある第三者への提供（個人情報保護法第28条第1項）への対応**である。**委託であっても
  この規律の対象になることは一次資料で確認した**（整理と出典は`architecture.md`「データ所在地と費用」を
  正本とする）。**未確定の内容と、判定によらず重なる義務は`architecture.md`「データ所在地と費用」が正本である**
  （件数と条件を下流へ書き写すとずれるため、ここには写さない）。**公開前に終える判定は2つあり、
  どちらも推論経路が国内かどうかでは決まらない。** **国外経路を実際に使う前の確認を必須とし、
  それまでは国内に収まる経路で運用する**。該当範囲と手当はTASK-017で判断する。

## 6. References and Documents to Update

参照: [TASK-003](../tasks/TASK-003-generation-design.md)、
[TASK-002 Plan](2026-09-28-task-002-data-lifecycle.md) §9・§17・§18・§20・§22・§24・§25、
[privacy.md](../privacy.md) §2・§3・§4・§5、[journaling.md](../journaling.md) §2・§4・§5、
[product.md](../product.md) §3・§4・§5、[architecture.md](../architecture.md)、
[dot-follow-up.md](../dot-follow-up.md)、[AGENTS.md](../../AGENTS.md)。

同じ変更で更新する現行文書:

- `docs/privacy.md`: §5-1の「処理の記録」行の未確定を解消し、外部provider行へ選定結果を反映。§4のTASK-003の行を決定済みへ。
- `docs/journaling.md`: §4の受け入れ条件へ生成方式を反映し、§5の決定済み項目を削除。
- `docs/product.md`: §3「未決定」から決定済みを外し、§5の保留事項を更新。
- `docs/architecture.md`: 「決定済み」へ生成経路とJob基盤を記録し、該当する「未決定」を整理。
- `docs/tasks/TASK-003-generation-design.md`: 状態、本Planへのリンク、完了条件の結果。

2026-10-03の所在地方針の変更（§18「2026-10-03の再確認」）では、上記に加えて次も更新した。

- `docs/architecture.md`: 「データ所在地と費用」を正本として変更（「保存は日本国内」の射程とdata retention
  modeの条件を含む）。2つの経路図の註、Bedrockのモデル選定、「未決定」への越境移転の確認の追加。
- `docs/privacy.md`: §4のTASK-003の行へ方針の変更と残る確認。§5-1の外部provider行へ正本への参照と、
  Transcribeのjob記録の保持期間（90日・調整不可）。
- `docs/product.md`・`docs/journaling.md`: 所在地の記述を新しい方針へ揃えた。product.mdは§5へ
  「委託先の構成」の保留事項（案Cが保留になったことと再検討条件）と、TASK-017の行への越境移転の
  追記も行った。
- `docs/tasks/TASK-001-identity-design.md`: 所在地の要約を正本への参照へ置き換えた。
- 過去のPlanは、**「現在」を名乗っている箇所だけ**を直した。AGENTS.mdの「過去のPlanのCurrent Stateは
  当時の記録であり、現在の状態へ書き換えない」に従い、**日付や旧構成（Cognito等）で当時の記録と分かる
  箇所は触っていない。**
  - 直した箇所: `2026-09-21-task-001-identity-design.md` §34（「**現在は**東京を基本配置とするが」）と
    §45の表（見出しが「**現在の**採用内容」）、`2026-09-28-task-004-history-design.md`（「原則東京に
    置く**現在の**方針」）。いずれも単独で読むと現行方針を名乗るため。
  - 触っていない箇所: 同Plan §40「公開MVPの採用決定（2026-09-24）」の表は**見出しに日付がある**ため、
    §41「採用構成の具体化と安全境界」は**本文がCognito構成（§45でDevise + CookieStoreへ変更済み）を前提に
    している**ため、どちらも当時の記録と読める（§41の見出しには日付が無いので、根拠は本文の側である）。
    **ただし§41の末尾の段落だけは例外で、2026-10-05に直した。** Cognito構成に依存せず
    「東京を基本配置とする方針は〜」と所在地方針だけを現在形で述べていたため、§34・§45と同じ形で
    「（当時。現行は`architecture.md`「データ所在地と費用」が正本）」を添えた。
    **節ごとに触る/触らないを決めると、節の中の独立した段落を見落とす**という型である。
    `2026-09-28-task-002-data-lifecycle.md`の当時のarchitectureの引用も、**引用そのものなので触らない。**
- `docs/tasks/TASK-003-generation-design.md`: 所在地方針の変更、案Cの保留、委託先の構成の再検討条件の
  担当（`product.md §5`が正本）。
- `docs/tasks/TASK-009-backend-audio-generation.md`: model id選定の前提。
- `docs/tasks/TASK-010-frontend-recording.md`: 送信先（国内/国外）を録音前の案内へ反映する条件。
- `docs/tasks/TASK-015-privacy-security-verification.md`: **実際に呼んでいる推論経路・リージョンが
  TASK-009の記録と一致し、案内の「国内か国外か」も実態と一致していることを公開前に突き合わせる**
  検証条件を追加（2026-10-05にレビュー指摘で追加。所在地方針の検証の受け皿）。
- `docs/tasks/TASK-017-breach-response-design.md`: 越境移転の規律を作業範囲と完了条件へ追加。
- `docs/tasks/README.md`: TASK-017の要判断事項。

**この1文の全出現箇所は`grep -rn '保存と閲覧は日本国内' --include='*.md'`で引く**
（件数は増減するので書かない）。要約を下流へ置いたので、**次にこの1文を変えるときは全出現箇所を
同時に直す**。

このPRのレビューで繰り返し出た指摘への**再発防止の仕組み化**（強調の崩れを検出するlint、CIでの
常時実行、仕様・設計文書のレビュー入口）は、**設計判断が別なので後続のPRへ切り出した**
（2026-10-07にレビューのコストが仕組み化の側に偏ったため、人間の判断で分けた）。

## 7. Proposed Approach（採用した方針）

判断の比較は§18–§21、人間の判断は§25にある。

1. **文字起こしとAI生成の委託先をAWSに統一する。** Amazon Transcribe（`ap-northeast-1`）で
   文字起こしし、Amazon BedrockのClaudeで`sentence`と`summary`を生成する（§18案A）。
   **Bedrockのモデルの推論経路は`architecture.md`「データ所在地と費用」に従う**（2026-10-03に
   同文書を「発話内容の保存と閲覧は日本国内に限る。推論のための一時的な処理は日本国外を許容する」へ変更した。変更前は「国外へ出ない経路で
   使えるものから選ぶ」だった）。**「国内に収まる経路」の定義は同文書の同節が正本。Globalも選べるが
   越境移転の規律の確認が済んでからとする。model idはTASK-009で確定する**（§18）。
2. **非同期で実行する。** Job基盤はSolid Queue（RDSのテーブルを使う）。workerは当面ECSの同一タスク内で
   Pumaと並走させ、詰まったら別タスクへ分ける。**clientはpollingで結果を取得する**（§19案A）。
3. **処理IDと冪等性keyと録音attemptの識別子を同一にし（server発行）、`dots`の列へ引き継ぐ。**
   処理の記録は進行中・失敗中の
   ものと、**cleanupが残っているものだけ**残す。削除はcleanupが終わった時点（§20案Aだが、
   レビューを受けて削除の契機が「成功時」から「cleanup完了時」へ変わった）。
   TASK-002が残した相互確認事項への回答である。
4. **AIへ送る前の固有名詞の低減は行わない。** 録音前の案内と、編集・ゴミ箱・即時完全削除・退会で
   対応する（§21案A）。低減したとは表示しない。
5. **再試行は、文字起こし結果が残っていれば生成からやり直す**。残っていなければ文字起こしから
   やり直す（§25-5。初稿は「必ず文字起こしから」としていたが、§27で全文を自前S3へ置くと決めた
   ため根拠が失われた）。どちらでも録り直しにはならない。
6. **退会と進行中処理は、利用者の行のlockと世代番号で排他する。** 状態の確認と記録の作成を同じ
   transactionで行い、upload完了後とJobの書き込み直前にも世代番号を再確認する。完了条件は
   「進行中の処理が0であること」にする（§20）。
7. **委託先9項目は選定の条件として記録し、確認は人間が行う。** 確認が済むまで公開しない（§26）。

## 8. Why This Approach

- **完了条件7が一番重い**。9項目（学習利用・保持・リージョン・人のレビュー・サブプロセッサ・
  委託契約・事故時の通知・鍵・第三者認証）を一次資料で確認する作業は、委託先が1社なら1回で済む。
  AWSへ寄せると、鍵の項目（項目8）は**長期固定のAPIキーをアプリで管理しなくて済む。**
  **ただしECSはSDKへ一時credentialを供給するので、項目8が消えるわけではない**（レビュー指摘で訂正）。
  確認対象が「keyの配布とローテーション」から「roleの最小権限、credential取得経路の保護、
  侵害時のrole無効化とtask停止」へ変わる。
- **当時の東京原則と両立させやすかった**（2026-10-03時点では、architectureは「発話内容の保存と閲覧は日本国内に限る。推論のための一時的な処理は日本国外を
  許容する」へ変わっている。以下は2026-09-29の判断時点の材料である）。architectureは
  当時「日記内容・音声・AI入力は原則として東京」と
  している。委託先をAWSに寄せると、送信先が1社に収まり、`privacy.md §2原則2`が求める
  「外部AIに渡る最初の地点」を1か所として説明できる。**ただし自動的に東京に収まるわけではない。**
  Transcribeはopt-outを設定するまで利用リージョン外へ保存され得るし、Bedrockはモデルによって
  推論が日本国外へ出る。§18の必須条件を満たして初めて成り立つ。
- **既に採った経路に噛み合う。** 音声はS3東京の一時objectとして置くと決まっている（TASK-002）。
  TranscribeはS3上のobjectを入力に取れるため、受け渡しのために別の置き場を増やさずに済む。
- **Job基盤で費用を増やさない。** Solid QueueはRDSを使うため、ElastiCache Redisを常時動かす必要が
  ない。基盤費は月5,000円目標・1万円前後許容（product.md）で、ALB + Fargate + RDS + 公開IPv4の
  時点で既に月1万円前後になる見積もりがあり、Redisを足す余地は小さい。
- **長く残るものをDot 1行に収める。** TASK-002 §8の設計思想である。冪等性keyを`dots`の列に置けば、
  Dotを消せば必ず一緒に消え、削除連鎖も退会時の回収対象も増えない。処理の記録を成功後も残すと、
  「誰がいつ録音したか」を示すデータが`privacy.md §5-1`に新しい保持期間の行として増える。
- **低減を謳わない方が正直である。** 文字起こし後に人名を伏せても、元音声は既にTranscribeへ
  届いている。**Bedrockへ渡すテキストと生成結果への伝播は減らせるので効果はゼロではないが**
  （§21で訂正）、`privacy.md §1`は固有名詞の置換を「匿名化済み」と表示・記録しないことを求めて
  いる。限定的な効果のために誤検出と文脈破壊のリスクを負うより、残るデータと修正・削除の手段を
  示す方が原則に沿う。

## 9. Data Flow（採用内容）

```text
[送信〜受理]  ここまでは同期のHTTP request。記録を先に作る（record-first）
POST /api/v1/dots（同一origin・multipart・Cookie + CSRF・最長30分 / 32MB）
  → client は録音開始時に server が発行した録音attempt を一緒に渡す（TASK-004）
  → Rails: 認証再確認 → attempt の検証（本人・未使用・期限内）→ content type と size を検証
  → 利用者の行を FOR UPDATE で lock → active を確認 → 状態 uploading の記録を作成
     （項目は §20 の表。処理ID＝録音attemptの識別子、started_at も同時に書く）→ commit
                                         ★退会と排他されるのはこの transaction
  → commit のあとに S3東京へ upload（非公開・暗号化・versioning無効）
     key = audio/<処理ID>/<upload試行番号>
  → upload 完成 → 世代番号を再確認 → 記録を accepted へ → Job を enqueue
     ※ 世代がずれていれば object を削除して終える（記録が消えていても手元の key で消す）
  → 202 相当で処理IDと再試行期限を返す                        ★ここで request は終わる

[生成]  ここから非同期。worker は当面 ECS 同一タスク内
Job: 記録の所有者と世代を確認 → 状態を transcribing へ
  → Amazon Transcribe（東京）へ S3 の object を渡す      ★★元音声が委託先へ渡る最初の地点
     TranscriptionJobName = <処理ID>-<文字起こし試行番号>
     OutputKey = transcripts/<処理ID>/<文字起こし試行番号>.json（§20の導出規則）
     OutputBucketName に自前の bucket を指定する（音声と同じ bucket の別 prefix）
     ※ response を失っても新しい job を作らず GetTranscriptionJob で合流する
  → 文字起こし結果が自前 S3 へ書き出される（§27）
     Rails は読み出して memory で扱う。RDS へは書かない
  → 状態を generating へ
  → Amazon Bedrock の Claude へテキストを渡す           ★★★発話内容が生成AIへ渡る地点
  → sentence と summary を受け取る
  → 利用者の行を FOR UPDATE で lock → 世代番号を確認 → dots へ保存
     （started_at は受理時の値をそのまま。再試行でも書き換えない）
     ＋ 記録を succeeded_cleanup_pending へ（同一 transaction）★成功はここで確定する

[cleanup]  成功の確定とは分けて行う。途中で落ちても記録が残るので再実行できる
  → 音声の一時object を削除
  → 文字起こし結果と Transcribe の job は、client の ACK を待つ（§27）
  → ACK を受けたら即削除。来なければ 受理から24時間で削除処理を始める
     Dot の完全削除・退会を受理したときも、その時点で削除へ回す（§20の認可表）
     ※ job が非終端なら DeleteTranscriptionJob は通らない。終端まで reconcile する
  → prefix（audio/<処理ID>/ と transcripts/<処理ID>/）ごと列挙して消す
     古い試行の孤児もここで拾う。lifecycle は最後の受け皿（保険）
  → 全部消えてから処理の記録を削除する
  ※ どれかの削除に失敗したら「削除済み」と扱わず再実行し、残存を検知する

[結果取得]  client は polling。処理ID は dots の列にも残るので記録を消した後も引ける
GET /api/v1/dots/generations/:処理ID    （認可は current_user に scope する）
  → **まず dots を見る。**同じ処理ID の Dot があれば成功として返す
     （記録が succeeded_cleanup_pending で残っていても「処理中」とは返さない）
  → Dot が無く 記録が uploading / transcribing / generating: 処理中。期限の日時を返す
  → Dot が無く 記録が failed: 失敗の種類と、再試行できるかと期限日時を返す
  → Dot が無く 記録が cancel_requested / cleanup_pending: **処理中とも失敗とも返さない。**
     受け付けを終えたものとして返す（利用者が削除した／退会した／期限が過ぎた結果）
  → 記録も Dot も無い: 受理されていないか、Dot が削除済み
  ※ 成功の response には文字起こし全文を含める。自前 S3 から読み出して返す（§27）
  ※ **object が残っていても全文を返さない条件がある。§27の「返さない条件」を見る**
     （同じ文書の中で条件を二重に書かない。片方だけ古くなるため）

POST /api/v1/dots/generations/:処理ID/transcript_ack  （client が保存し終えたら送る）
  → current_user.dots と (user_id, 処理ID) で認可 → 文字起こし結果と job の削除処理を始める
  → 冪等。再送されても、既に消えていても成功として扱う
       ↓ 端末: 文字起こしは sessionStorage（タブを閉じるまで）。localStorage へ書かない
```

★★以降はFocus on Dot側で削除しても委託先に残り得る。録音前の案内に含める（TASK-002 Plan §22）。

## 10. Files to Change

本Planで変更するのは文書だけである。実装はTASK-005/009/010/011/013で行う。

| ファイル | 新規/変更 | 役割 |
| --- | --- | --- |
| `docs/implementation-plans/2026-09-29-task-003-generation-design.md` | 新規 | 本Plan。比較・採用・確認していないことの記録 |
| `docs/tasks/TASK-003-generation-design.md` | 変更 | 状態、本Planへのリンク、完了条件の結果 |
| `docs/privacy.md` | 変更 | §5-1の処理の記録と外部provider、§4のTASK-003の行 |
| `docs/journaling.md` | 変更 | §4の受け入れ条件、§5の未決定の整理 |
| `docs/product.md` | 変更 | §3の未決定、§5の保留事項 |
| `docs/architecture.md` | 変更 | 生成経路とJob基盤を決定済みへ、該当する未決定の整理 |

## 11. Libraries / APIs

実装で必要になるものを記録する。**本Planではgemを追加しない**。追加はTASK-009で行う。

- **Solid Queue**: Job基盤。RDSのテーブルをqueueに使うため、Redis等の常時稼働するmiddlewareを
  増やさずに済む。Rails 8系の標準の選択肢で、Active Jobのadapterとして差し替えられる。
- **AWS SDK for Ruby**（`aws-sdk-s3`・`aws-sdk-transcribeservice`・`aws-sdk-bedrockruntime`）:
  S3への一時保管、文字起こし、生成。**IAM roleで認証するため、長期固定のAPIキーをアプリで
  持たない**（一時credentialはSDKへ供給される）。ECS task roleに、対象bucketのprefixと対象モデル
  だけを許す最小権限のpolicyを付ける（§27）。
- **SDKだけで足りるのは`bedrock-runtime`を使う場合に限る**。`bedrock-mantle`は`InvokeModel`や
  `Converse`ではなくAnthropic Messages API相当のHTTP endpointで、`aws-sdk-bedrockruntime`の
  呼び出しでは扱えない（[Bedrockのendpoint](https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html)）。
  **In-Regionを採るなら、SigV4で署名するHTTP clientの選定と検証が別に要る。**
  MVPは`bedrock-runtime`で呼べる経路（**Geo: JPまたはGlobal**）から選び、In-Regionへ寄せる判断は
  TASK-009で行う（2巡目のレビュー指摘14。初稿は「SDKが提供する呼び出しで足りる」と断定していた。
  2026-10-03に所在地方針を変更したため「Geo: JPを既定」の縛りを外した。**Globalを使うには越境移転の
  規律の確認が要る**）。

## 12. Alternatives Considered

§18（provider）、§19（実行方式と結果取得）、§20（冪等性と処理の記録）、§21（固有名詞の低減）に
比較を記載する。採用は§25。

## 13. Risks / Things to Watch

- **委託先の確認が未了のまま実装が進む。** §26の9項目は選定の条件であって、確認済みの事実ではない。
  特に**入力が学習・サービス改善に使われるかは、設定で変わり得る**。設定を確認せずに
  「学習に使われない」と文書や画面に書かない。確認の担当と期限を§26に置く。
- **録音形式と文字起こしの受容形式が合わない。** 現行は`new MediaRecorder(stream)`をmimeType未指定で
  生成するため、Chrome系は`audio/webm;codecs=opus`、Safariは`audio/mp4`になる。**どちらかが
  受け付けられないとそのbrowserだけ失敗する**。serverが受容形式を列挙して検証し、非対応なら
  外部へ送らずに録り直しを案内する。実際の対応可否はTASK-009の疎通で確認する。
- **workerをPumaと同じタスクに置くことの影響。** ECS 1タスク・`RAILS_MAX_THREADS`既定3という構成で、
  30分の音声の文字起こしを待つJobが走る。**deployでタスクが入れ替わると進行中のJobは落ちる。**
  落ちた分は進行中の状態のまま残り得るので、**§19の状態別のstale判定で回収する**（期限は回収の
  手段ではない）。実測してPumaが詰まるなら、workerを別タスクへ分ける。
- **pollingの間隔と打ち切り。** 30分の音声では生成に分単位かかる。間隔を短くするとECS 1タスクに
  request が積もり、長くすると待たせる。**打ち切ってもJobは止まらない**ため、画面を閉じても
  結果が残ることを前提に設計する（TASK-005/011）。
- **成功した処理の記録を消すと、削除済みDotへの再送を区別できない。** 24時間以内にDotを削除して
  同じ処理ID（録音attemptの識別子）で再送されると、新しいDotが作られる。音声は削除済みなので
  実害は小さいが、
  **「同じ操作の再実行で必ず同じ結果になる」とは言えない**ことを記録しておく。
- **Job再実行による外部AIの二重消費。** 冪等性keyは二重の**Dot**を防ぐが、
  **二重の外部AI処理そのものは防がない**。保存で落ちて再試行すれば、文字起こしと生成をもう一度
  通る。journaling.md §4の受け入れ条件は「二重のDotや外部AI処理が起きない、**または**利用者に
  結果が明確に示される」なので、後者で満たす。費用の上振れは運用で見る。
- **状態が`processing`のまま止まる経路。** worker停止・例外・deployで、記録が`processing`のまま
  残る。pollingが永遠に`processing`を返す画面を作らないよう、**期限（受理から24時間）を過ぎた
  `processing`は`failed`として扱う**ことを実装の条件にする。
- **Transcribeの非同期Jobの完了待ち方。** 自前のJobがAWS側のJobの完了をpollingすると、その間
  workerのthreadを占有する。30分の音声で分単位を見込む。同時実行数の上限と、worker数の関係を
  TASK-009で実測する。
- **ログへの流入。** 文字起こしテキストとBedrockのrequest / responseは発話内容そのものである。
  SDKのdebug logやerror trackingのbreadcrumbに乗らないことを実装時に確認する
  （TASK-002 Plan §22の「ログに出さないもの」）。
- **Bedrockのモデル更新でDotの文面が変わる。** model idを固定せずに運用すると、ある日から
  生成結果の調子が変わる。model idを設定で固定し、変更は意図した変更として行う。
- **要約の品質と個人情報。** `summary`にも第三者の実名が残り得る。要約だから安全とは扱わず、
  Dot本文と同じ保護・削除・説明の対象にする（TASK-002 Plan §13と同じ注意）。
- **文字起こし結果が成功後も残り得る。** §27案Aの帰結。ACKが届けば数秒〜数分で消すが、
  届かなければ受理から24時間で削除処理を始める。**その時点で消え終わるとは限らない。**
  `privacy.md §5-1`のデータ行として管理し、削除失敗の検知とDot削除・退会の削除連鎖に含める。
  録音前の案内も「文字起こし全文を残さず」から実態に合う文言へ変える（TASK-010）。
- **stale Jobの検知が無いと、deployのたびに最大24時間「処理中」に見える。** 24時間は再試行の
  終了期限であって障害の検知期限ではない。最終進捗時刻によるstale判定を実装の条件にする（§19）。
- **一時credentialの扱い。** ECS task roleは長期固定キーを不要にするが、SDKへは一時credentialが
  供給される。credential窃取、role policyの誤設定、侵害時の封じ込めは確認対象に残る（§26項目8）。

## 14. Verification

### 机上（本Planで実施）

- §24の失敗シナリオ表で、送信・受理・文字起こし・生成・保存・応答の各段階で落ちた場合に、
  端末・S3・処理の記録・RDS・外部のどこに何が残り、どこから再開できるかを追跡した。
- 同一操作の再実行（再送・retry・Job再実行）でDotが二重にならないこと、防げない範囲
  （外部AIの消費）を区別して記述した。
- 週次・月次のAI振り返りを混入させていないことを、§5の対象外で確認した。

### 机上での検証をここで打ち切る（2026-09-29の判断）

**状態機械の整合を文書だけで確認する作業は、ここで終える**。別AIのレビューを5巡受け、指摘は
10 → 14 → 7 → 5 → 4件と収束したが、**3巡目以降は指摘の多くが「前の巡の修正が作った矛盾」**
だった。§20の状態表にある状態と遷移、外部資源4種（S3の音声／S3の文字起こし結果／Transcribeのjob／Dot）・
試行番号の組み合わせは、**文章の読み合わせで閉じたと判定するのに向いていない。**

- **遷移IDを振ったので、テストと1対1で対応づけられる**（§20の状態表）。
- **TASK-009で状態遷移テストを先に書き、そこで閉じる**。実装の完了条件に入れた。
- 残った曖昧さは、**実装時にテストが落ちる形で現れる**方が確実に潰せる。
- 人間がこの打ち切りを判断した。「**閉じたことを確認したから終える」のではなく、
  「閉じたかどうかを机上で判定する方法が限界に達したから、検証の場を移す**」である。

### 実装時（後続タスク）

- 録音形式（webm/opus・mp4/aac）が文字起こしで受け付けられることを疎通で確認する（TASK-009）。
- 文字起こし・生成の入出力がログへ出ないことをtestで確認する（TASK-009/015）。
- 冪等性keyの重複で2件目のDotが作られないことをtestで確認する（TASK-009）。
- 退会の受理後に進行中の処理が結果を確定させないことを確認する（TASK-013/015）。
- **§20の状態表にあるすべての遷移を、状態遷移テストで1本ずつ検証する（TASK-009の完了条件）。**
  §24のシナリオのうち遷移に対応しない性質も別にテストする。
- 古いPUTが後から完成した場合の回収を、PUTの実際の挙動を確認したうえで検証する（TASK-009）。

### 人間が実施（公開前）

- §26の9項目の確認と、確認できたことの記録（TASK-003の完了条件7）。

## 15. Definition of Done

- §25の判断が承認され、採用内容が記録されている。
- §24の失敗シナリオが採用内容と一致している。
- TASK-002が残した2つの宿題（処理の記録の削除時期、退会の排他方式）に答えている。
- privacy / journaling / product / architectureが決定内容を反映し、未決定事項が整理されている。
- **決定が流れ込む先の実装タスク（TASK-005 / 009 / 013）に、矛盾する記述が残っていない。**
- **§20の遷移にIDが振られ、TASK-009の完了条件としてテストへ引き渡されている。**
- 完了条件ごとに、検証できたものと後続・人間に残すものを区別して記録している。

## 16. Completion Record

- 状態: 2026-09-29、設計判断として完了。採用内容は§25。**実装は未着手。**
- 実装差異: コードは変更していない。文書のみ。
- 実行したcommand:
  - `node scripts/task-status.mjs TASK-003`（完了条件の一覧取得）
  - `grep`で`docs/`内のTASK-003参照と未決定記述を洗い出し、更新箇所を特定
  - `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm test`（文書のみの変更だが検査は通した）
- 検証結果: §24の机上確認、§14の机上項目。**実機確認・実装・AWSリソースの作成は行っていない。**
- レビュー: 別AI（Codex）に5巡レビューしてもらい、指摘は10 → 14 → 7 → 5 → 4件と収束した。
  **1巡目は事実誤認2件（Transcribeが結果をS3へ書き出すこと、東京でのClaudeの経路）を含み、
  一次資料で訂正した。3巡目以降は指摘の多くが「前の巡の修正が作った矛盾」だった。**
  5巡目のあと、**人間の判断で机上での検証を打ち切り、状態機械の検証をTASK-009のテストへ移した**
  （§14）。閉じたことを確認して終えたのではなく、**判定の場を移した。**
- 完了条件: 7件中6件をこのタスクで満たした。**完了条件7（委託先への9項目の確認）は満たしていない。**
  選定の条件として9項目・確認先・確認方法を§26に記録したが、**一次資料の確認と委託契約の締結は
  人間が実施する**。確認が済むまで公開しない。
- 下流への反映: TASK-005（契約への入力）、TASK-009（実装と全遷移のテスト）、TASK-013（削除連鎖に
  文字起こし結果とTranscribeのjobを追加）を同じ変更で更新した。**TASK-010/011/015は今回確認し、
  矛盾する記述は無かった。**
- **2026-10-03の追記**: providerの比較を一次資料で確認し直し（§18「2026-10-03の再確認」）、その結果
  **所在地方針を`architecture.md`「データ所在地と費用」で変更した**（発話内容の保存と閲覧は日本国内に限り、推論のための一時的な処理は日本国外を
  許容する）。**採用は案Aのままだが、続ける理由が所在地から「委託先を増やさないこと・25MBの上限が
  無いこと・外部裁量に依存しないこと」へ変わり、案Cは不採用から保留になった**。比較表に案D（Google）・
  案E（Azure）を追加した。反映先は§6のとおり。**実装は未着手のまま。確認が済むまでは国内に収まる
  経路で運用する。**
- 関連: TASK-002 Plan（保持・削除の前提）、TASK-005（API契約）、TASK-009/010/011（実装）、
  TASK-013/015（削除と残存の検証）、TASK-017（越境移転の規律）、TASK-018（深掘り対話。本タスクの対象外）。
- 2026-10-08: 完了条件7（委託先への9項目の確認）を[TASK-025](../tasks/TASK-025-vendor-verification.md)へ移管し、
  TASK-003をDoneにした。確認できたから閉じたのではなく、担当を移して閉じた。記録先は引き続き§26である。

---

## 17. 生成の入出力とpromptの方針（採用内容）

生成に渡すもの、返させるもの、文面の方針を決める。**最終的な文面はTASK-009で実データを見て詰める。**

### 入力

- 文字起こし全文。話者分離は使わない（本人1人の独白を前提とする）。
- 録音日（`date`）と録音時間（`durationSec`）。文面の手掛かりに使う。**`date`は`started_at`から
  算出したAsia/Tokyoの暦日で（TASK-004）、生成AIが決める値ではない**。`started_at`自体は
  生成へ渡さない（暦日より細かい時刻を文面の手掛かりにしない）。
- **過去のDotは渡さない**。MVPでは1件の録音だけを入力にする。過去を渡すと、週次・月次のまとめ
  （product.md §3の検証候補）へ踏み込み、保持と説明の範囲が変わる。

### 出力（生成結果として必要な項目）

| 項目 | 内容 | 制約 |
| --- | --- | --- |
| `sentence` | 今日の一文。利用者がその日を一言で思い出せる短い文 | 1文。日本語。本人の言葉を言い換えたもので、助言・評価・診断をしない |
| `summary` | 話した内容の要約。「何を話したか」を後から思い出すためのもの | 数文。**本人が話していないことを足さない**。要約であって解釈ではない |

- **`date`・`started_at`・`duration`は生成結果ではない**。録音attemptと録音の事実から決まる値で、
  AIの出力として受け取らない（TASK-004）。
- **`reflection`と`closing`は生成しない**（TASK-002 §25-6で廃止）。AIからの語りかけは保存しない
  という判断に合わせ、生成そのものを行わない。
- 出力はschemaで検証し、検証を通らなければ保存しない（契約はTASK-005）。
- **文字数の上限を決めて渡す**。上限を超えた出力は失敗として扱い、再試行の対象にする。

### promptの方針

- **役割**: 利用者の言葉を整理する補助であって、助言者・評価者・診断者ではない
  （dot-follow-up.md §2の位置づけと揃える）。
- **足さない**: 文字起こしに無い出来事・数値・固有名詞・感情を書かない。
- **言い換えない**: 利用者の言葉を別の関係へ勝手に置き換えない（privacy.md §2原則4の
  「タカシ」から「長男」と決めつけない、と同じ制約）。**人名が出てきても伏せ字にせず、
  そのまま扱う**（§21で低減を行わないと決めたため、prompt側で中途半端に隠さない）。
- **断定しない**: 「あなたは〜です」の形を避ける。
- **短く**: `sentence`は1文、`summary`は読み返せる長さに収める。
- promptは設定として1か所に置き、変更を意図した変更として行う（model idと同じ扱い）。

### 失敗の扱い

- schema検証に通らない、空、上限超過は**生成の失敗**として扱う。S3の音声は残し、再試行できる。
- 文字起こしが空（無音・極端に短い）の場合は生成へ進まず、**録り直しを案内する**。
  無音に対して生成を走らせると、内容の無いDotが保存される。

## 18. 判断1: 文字起こしと生成のprovider（比較。採用は§25-1）

**前提として、Claude APIは音声入力を受け付けない**（画像とPDF・テキストのみ）。生成にClaudeを使う
以上、文字起こしは必ず別工程になる。したがって比較するのは「音声を直接LLMへ渡すか」ではなく、
**文字起こしと生成をどの委託先に置くか**である。

| 案 | 内容 | 判断の材料 |
| --- | --- | --- |
| **A（採用）: AWSで統一** | Amazon Transcribe（東京）→ Amazon BedrockのClaude | 委託先が1社に集約され、**§26の9項目の確認対象が1つになる**。認証はECS task roleのIAMで行うため**長期固定のAPIキーをアプリで管理しない**（ただしECSはSDKへ一時credentialを供給するので、項目8は消えず内容が変わる）。委託契約（項目6）はAWS DPAがService Termsへ組み込み済みで自動適用される。TranscribeはS3上のobjectを直接入力に取れるため、TASK-002が決めた一時objectの置き場をそのまま使える |
| 案B: Transcribe（東京）+ Anthropic API（first-party） | 生成だけ別ベンダー | 最新モデルを最速で使えるが、**9項目の確認とDPA締結が2社ぶん**になる。APIキーの管理が増え、生成処理が米国へ出るため所在地の説明が増える（product.mdは国内限定を約束していないので致命的ではない） |
| 案C: OpenAIに統一（**採否は保留**） | 音声の文字起こし + GPT | 1社で完結し、**既定で入出力をモデル学習に使わない**。文字起こし結果はHTTP responseで返り、**取得用に保存する記述は出典に無い**（Googleの非同期endpointのように結果を取りに行く仕組みが無い。**不正利用監視ログの保持（最大30日）は別**）。**日本は地域内保存のみで、推論（inference）は選んだ地域の外で行われ得る**（具体的な処理地は出典に記載がない）が、2026-10-03に`architecture.md`を「発話内容の保存と閲覧は日本国内に限る。推論のための一時的な処理は日本国外を許容する」へ変更したため、**これ自体は不採用の理由にならなくなった**。残る不利点は3つ。**(a) 委託先が1社増えて9項目の確認とDPA・`privacy.md §5-1`の行の差し替えが発生する**、**(b) 文字起こしの入力が25MBまで**で録音30分・32MBの上限と衝突し得る、**(c) ZDRはOpenAIの事前承認（sales）に依存し、適用しない限り不正利用監視ログを30日保持する**（承認が得られるかは自分たちで決められない外部裁量である。2026-09-30の補足でも挙げていた論点）。同文書が**委託先の変更は別の判断として残す**としたため、**本Planでは採否を決めず保留する**（下記「2026-10-03の再確認」） |
| 案D: Googleで統一 | Cloud Speech-to-Text + Vertex AIのGemini | **候補から外した**。data loggingはopt-inで既定値は良く（**v1のFAQの記述。v2は未確認**）、**v2は`asia-northeast1`をlocationの候補として持つ**（`ja-JP`の対応は未確認。§18「2026-10-03の再確認」の確認した事実4）ため「東京に無いから」では落とせない。外した主な理由は**基盤として未使用のため委託先が1社増え**、GeminiのTokyo対応・単価・DPAが未調査で確認が案Aの倍になること。加えて**v1では非同期endpointが文字起こしをGoogle側に約5日間保存し、削除を自分たちで制御できない**（案Aは`OutputBucketName`で自前bucketへ出し、ACKで削除処理を始められる。§27）。**ただしこの保持はv1の記述で、東京で使うv2で同じかは未確認**なので、確認作業の量を主因とする（2026-10-03に調査） |
| 案E: Azureで統一 | Azure AI Speech + Azure OpenAI | **候補から外した**。Azure OpenAIは**顧客データをモデルの再学習に使わない**（一次資料で確認）。外した理由は**基盤として未使用のため委託先が1社増え、§26の9項目の確認が案Aの倍になること**。配備の種類とリージョンの可否（Japan Eastで使えるモデルの範囲）、Azure AI Speechの東京対応、単価、DPAは**未確認**（2026-10-03に調査） |

**採用は案A**。決め手はモデル性能ではなく**完了条件7の重さ**である。

### 案Aを採るうえで確認した事実（2026-09-29時点、一次資料）

**確認できたこと（AWS公式ドキュメントで逐語確認）**

1. **AWS AI servicesは既定で顧客コンテンツをサービス改善に使い、利用リージョン外に保存し得る。**
   > "AWS AI services may use and store customer content for service improvement, such as fixing
   > operational issues, evaluating service performance, debugging, or model training. For this
   > purpose, we might store such content in an AWS Region outside of the AWS Region where you are
   > using the service."
   （[AI services opt-out policies](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai-opt-out.html)）
2. **Amazon Transcribeはこのopt-out policyの対象サービス一覧に含まれる。**
   （[List of supported AI services](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai-opt-out_all.html#ai-opt-out-all-list)）
3. **Amazon Bedrockは同じ一覧に含まれない**。Bedrock側の仕組み（既定のゼロデータ保持と、モデルごとの
   data retention mode）で別に確認する必要がある。
4. **opt-outはAWS Organizationsの機能で、組織のmanagement accountで操作する**。設定しない限り
   opt-inのままである。**「既定で学習に使われない」ではない。**
5. **opt-outすると過去分も削除される。**
   > "When you opt out of content use by an AWS AI service, that service deletes all of the
   > associated historical content that was shared with AWS before you set the option."
6. Bedrockでは、東京から呼ぶモデルに **In-Region（単一リージョンで完結）/ Geo（地理を限定した
   cross-region inference）/ Global（世界中へルーティング）** の区別があり、**endpointによって
   可否が違う**。`bedrock-runtime`と`bedrock-mantle`で別の対応表になっている。
   Claude Haiku 4.5のモデルカードを例にとると、
   - Geo: JPの推論profile `jp.anthropic.claude-haiku-4-5-20251001-v1:0` の宛先は
     **東京と大阪だけ**で、日本国外へは出ない。
   - `bedrock-mantle` endpointは **ap-northeast-1でIn-Region対応**（bare model id
     `anthropic.claude-haiku-4-5`）。
   - ただしAWS自身が次のように注意している。
     > "Geo and global inference profiles can route requests outside the source Region and don't
     > provide single-Region data residency. For single-Region inference, use the `bedrock-mantle`
     > endpoint with the bare model ID."
   - Globalは世界中へルーティングされるため、**日本国外へ出る。**
   （[Claude Haiku 4.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html)、
   [Model support by AWS Region](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html)）
   **つまり、日本国内に収める経路は公開資料で特定できる**。Geo: JP（東京・大阪）か、
   `bedrock-mantle`のIn-Region（東京のみ）である（**2026-09-29時点の調査結果。現行の定義は
   `architecture.md`「データ所在地と費用」が正本**）。
7. Transcribeのバッチは **WebMとMP4をコンテナとして対応**し、**S3上のobjectを入力に取る**
   （`Media.MediaFileUri`）。上限は音声8時間・2GBで、本件の30分・32MBは大きく下回る。`ja-JP`は
   バッチ・ストリーミングとも対応する。
   （[Data input and output](https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html)、
   [StartTranscriptionJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html)）
7b. **Transcribeのバッチは、文字起こし結果をS3へ書き出す**。worker のmemoryだけを通る経路は
   バッチには存在しない。
   > "If you do not specify `OutputBucketName`, your transcript is placed in a service-managed
   > Amazon S3 bucket and you are provided with a URI to access your transcript."
   （[StartTranscriptionJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html)）
   `OutputBucketName`を指定すれば自分たちのbucketへ、指定しなければAWSのservice-managed bucketへ
   置かれる。**どちらにせよ、発話内容の全文がRailsの外のストレージに存在する時間が生まれる。**
   初稿の§9が「文字起こしテキストはworkerのmemoryのみ」と書いていたのは**事実として誤り**で、
   レビュー指摘を受けて§9と§27を書き直した。
8. **`ja-JP`はTranscribeのPII Redaction（自動マスク）に対応していない。**
   （[Supported languages](https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html)）
   §21案Bを採る場合でもTranscribeの機能では実現できず、別手段が要るという事実である。
9. **AWS DPAはAWS Service Termsへ組み込まれ、全顧客に自動適用される**。別途の締結を要しない。
   （[AWS Data Processing Addendum](https://docs.aws.amazon.com/whitepapers/latest/navigating-gdpr-compliance/aws-data-processing-addendum-dpa.html)）

**確認できなかったこと（§26へ送る）**

- **どのClaudeモデルを使うかは確定していない**。経路そのものは上記6のとおり公開資料で特定できる。
  確定していないのは、Geo: JPと`bedrock-mantle` In-Regionのそれぞれに**どのモデルが対応するか**の
  全量と、品質・費用・EOL・data retention modeを含めた最終選定である。**本Planではmodel idを
  決めず、TASK-009で対応表とモデルカードを直接読んで決める。**
  （2026-09-29の初稿では「同じ対応表を2回読んで食い違ったため経路を確定できなかった」と書いたが、
  これは`bedrock-runtime`と`bedrock-mantle`の2つの表を混同した読み誤りだった。レビュー指摘を受けて
  モデルカードを読み直し、訂正した。）
- Bedrockのモデルごとの data retention mode（`none` / `default` / `aws_review`）の実際の値。
  **モデルによっては保持とAWSによる人的レビューが必須になり得る**ため、選定時に確認する。
- AWSが日本の個人情報保護法上の委託先に該当すると明言した一次資料。AWSの公開資料は
  責任共有モデルの説明にとどまる。

### 案Aを採るための必須条件（実装の前提）

上記の確認から、案Aは**次を満たして初めて成立する**。満たさないまま公開しない。

1. **Transcribeについて、AWS OrganizationsのAI services opt-out policyを適用する。**
   これは任意の改善ではなく**必須**である。適用しないと、音声が「サービス改善のために
   利用リージョン外へ保存され得る」状態のまま運用することになり、
   `privacy.md §5-2`の「何を送るか、どこへ渡るか」を利用者へ正しく説明できない。
   適用後、effective policyを照会して実際に効いていることを確認する。
2. **Bedrockのモデルの推論経路は、`architecture.md`「データ所在地と費用」に従う**（2026-10-03に
   同文書を「**発話内容の保存と閲覧は日本国内に限る。推論のための一時的な処理は日本国外を許容する**」へ変更したため、**Globalプロファイルも
   選べる**）。**「国内に収まる経路」の定義は同節が正本**（写さない）。**選んだ経路が国内か国外かを
   記録し、国外を選ぶ場合は越境移転の規律の確認を済ませてから使う**（確認が済むまでは国内に収まる
   経路で運用する。該当範囲と手当はTASK-017）。
   **モデルの都合で所在地方針を黙って曲げない**（曲げるなら`architecture.md`を先に直す。
   2026-10-03の変更はその手順で行った）。
3. **使う構成（経路・モデル・設定）について「どこに保存されるか」「誰がどこから閲覧し得るか」を
   一次資料で確認し、記録する。確認できないものは使わない**（`architecture.md`「データ所在地と費用」の
   要求。data retention modeの確認もこの一部である）。確認先は§26の項目2・4、担当はTASK-009。

   **この条件は2026-10-04に、軸の列挙から単一の要求へ畳み直した**。それまでは
   「国外経路では`none`にできるモデルに限る」「経路が国内でも保持データの所在を確認する」のように
   軸ごとに条件を足していたが、**レビューを5巡する間に塞いだ軸の隣から次の軸が現れ続けた。**

   | 巡 | 現れた軸 |
   | --- | --- |
   | 2 | 国外経路 × 保持ありのモデル（開示だけで満たせてしまう構成だった） |
   | 3 | Geo: JPの宛先に大阪が含まれる（「保存は東京」だと国内経路でも違反になる） |
   | 4 | 推論の宛先と保持データの所在は別 |
   | 5 | 保持データの所在と人によるレビューの実施地は別。Geo: JPの宛先はモデルごとに違う |
   | 5（未確認として） | prompt cacheの滞留先 |

   **広い約束（保存と閲覧を日本国内に限る）に対して条件を軸ごとに列挙する形は、実物の資料を持たない
   設計文書の側では網羅できない**。そこで要求を1つにし、網羅の責任を構成を選ぶ側（実物のモデルカードと
   設定を読むTASK-009）へ渡した。**同じ日に原則の表現も「保存は東京」から「保存と閲覧は日本国内」へ
   改めた**（Geo: JPの宛先に大阪が含まれ、東京に限ると国内で完結しているのに違反になる構成が生まれる
   ため。自分たちのRDSとS3は東京のままである）。
4. **録音形式（webm/opus・mp4/aac）の疎通を実ファイルで確認する**。対応表はコンテナ形式までしか
   保証しておらず、コーデックとMediaRecorderが出すヘッダの扱いは実機で確かめる必要がある。
5. **文字起こし結果を自前のS3へ出す（§27で採用）**。上記7bのとおり、バッチは必ずS3へ書き出す。
   `OutputBucketName`の指定、取得後の削除（objectと`DeleteTranscriptionJob`）、削除失敗時の
   再実行と残存検知を条件に含める。
6. **`aws-sdk-bedrockruntime`で呼べる経路から選ぶ**（2026-10-03に更新。変更前は「Geo: JPを既定に
   する。MVPではGeo: JPに限る」だった）。Geo: JPとGlobalはどちらも`bedrock-runtime`で呼べる。
   `bedrock-mantle`のIn-Regionは**呼び出し方が違う**（§11）ため、採る場合はclientの選定をTASK-009の
   判断に加える（国内か国外かの別は`architecture.md`「データ所在地と費用」が正本。ここには写さない）。
   **上記2のとおり、国外経路の使用は越境移転の規律の確認が済んでからとする。**

### 補足（2026-09-30・人間との対話ログからの追記）: なぜ案Aか・opt-outのタイミング

**なぜ案Aか（3行で）**

- 案B（Transcribe東京 + Anthropic直接API）は生成にClaudeを使える点は案Aと同じだが、委託先が2社になり、
  完了条件7（委託先9項目の確認）の対象が2倍になる。
- 案C（OpenAI統一）は1社に見えるが、日本endpointがStorage Yes / Processing Noのため東京原則
  （`architecture.md`「日記内容・音声・AI入力は原則として東京」）を満たせず、ZDR承認もOpenAI側の
  sales承認という外部裁量に依存する。
  **← この行の「東京原則を満たせない」は、2026-10-03に所在地方針を変更したため不採用理由として
  効かなくなった**。Storage Yes / Processing Noという事実自体は正しい（一次資料で再確認済み）。
  **現在の理由は下記「2026-10-03の再確認」にある。**
- 案Aは文字起こし（Transcribe）と生成（Bedrock上のClaude）がどちらもAWSの契約範囲内に収まり、
  委託先確認が1社で完結する。決め手はモデル性能の比較ではなく、この完了条件7の重さである。

**opt-out policyは「適用すれば過去の保存分も消せる」が「適用前に実際に使われた事実は消せない」**

上記1の必須条件について、AWS公式資料は次のとおり説明する（4・5の引用と同一）。

> "When you opt out of content use by an AWS AI service, that service deletes all of the associated
> historical content that was shared with AWS before you set the option."

opt-outを設定すると、それ以前に送った音声の**保存データ自体は削除される**。しかし、opt-outするまでの
間に**実際にサービス改善目的で使われた（処理された）という事実そのものは、後からの削除では取り消せない**。

例:

1. opt-out未設定のまま音声Aを送信した時点で、AWSは音声Aをサービス改善目的（モデル評価等）に
   使える状態にある（既定はopt-in）。
2. その後opt-out policyを適用すると、以降に送る音声は改善目的に使われなくなり、音声Aの保存履歴も
   削除される。
3. しかし1と2の間に、AWSが実際に音声Aを使って改善処理を行っていた場合、その「使われた」という
   事実は後からの削除でも取り消せない。

「音声を1件でも送る前にopt-outを適用する」ことを必須条件（上記1）としているのは、削除できるかどうか
ではなく、**適用前に一度も改善目的の使用が起きないようにする**ためである。

### 2026-10-03の再確認: 候補を広げて確認し直した結果

**なぜ再確認したか**。初稿の案Cの不採用理由は「東京原則から外れ、既存文書が想定していない委託先が
増える」の2行だけだった。一方で案Bの行には「product.mdは国内限定を約束していないので致命的では
ない」と書いており、**同じ論理を案Cに当てていない**という非一貫があった。さらに`architecture.md`の
東京原則そのものが「**国内限定を利用者への法的・契約上の約束にはしない**」と明記しており、
禁止事項ではない。したがって「東京原則から外れる」だけでは不採用理由として弱い。

**確認した事実（2026-10-03、一次資料）**

1. **OpenAIは既定でAPIの入出力をモデル学習に使わない**（2023-03-01以降）。不正利用監視ログの保持は最大
   30日（"up to 30 days"）。ZDR（Zero Data Retention）の対応endpointに`/v1/audio/transcriptions`を含むが、
   **OpenAIの事前承認（sales）が必要**である。
   （[Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data)）
2. **OpenAIのデータレジデンシーは、地域内処理（inference）に対応する地域が限られ、日本は
   「地域内保存のみ」である**。対応する地域として挙がっているのは米国・欧州（EEA+スイス）と、
   一部のモデル向けのUAEである。**判断に効くのは「日本が地域内処理に対応しない」ことである。**
   > "If you select a region that supports regional processing, as specifically identified below, the
   > services will perform inference for your Customer Content in the selected region as well."

   地域表で日本は地域内保存Yes・地域内処理Noである。つまり**日本を選んでも推論は選んだ地域の外で
   行われ得る**。同ページは地域内処理に対応しない地域について "OpenAI **may also process and
   temporarily store Customer Content outside of the Region** to deliver the services" と書いており、
   **具体的な処理地（米国など）は特定していない**。移転先の国は、体制整備の対象を決めるときに別途
   確認する。（同上）
3. **OpenAIの文字起こしの入力上限は25MB。**「Files can be up to 25 MB.」対応形式は
   `mp3, mp4, mpeg, mpga, m4a, wav, webm`で、**結果はHTTP responseのJSON（`text`）で返る**。
   時間の上限は記載がない。
   （[Speech to text](https://developers.openai.com/api/docs/guides/speech-to-text)）
4. **Google Cloud Speech-to-Textのdata loggingはopt-inで、入っていなければ顧客コンテンツをサービス
   提供以外に使わない。**
   > "**If you are not enrolled in the data logging opt-in program,** Google does not use any of your
   > content for any purpose except to provide you with the Cloud Speech-to-Text API service."

   **ただしv1では、非同期（async）のendpointで結果を取得させるために文字起こしがGoogle側に約5日間
   保存される。**
   > "the resulting transcript is stored for a period of approximately 5 days to give you time to
   > retrieve the transcript."

   同期・streamingはmemory上で処理され保存されない。**v1はEUとUSのendpointしか無いが、v2は
   `asia-northeast1`をlocationに持つ。**
   **出典のFAQはv1のドキュメント配下にあり、ページ自身は適用範囲（v2を含むか）を明記していない。
   したがってこの項の2点（opt-inであること・約5日保持）はいずれもv1の記述として扱い、v2で同じかは
   未確認とする**。v2のdata usageに相当する資料は確認できていない（v2のパスへアクセスするとv1の内容が
   返る）。**東京で使うなら構成はv2になるため、採否の判断に使うなら先にv2で確認する。**
   （[Data usage FAQ](https://docs.cloud.google.com/speech-to-text/docs/v1/data-usage-faq)、
   [Supported regional endpoints（v1）](https://docs.cloud.google.com/speech-to-text/docs/v1/endpoints)、
   [Supported languages（v2）](https://docs.cloud.google.com/speech-to-text/v2/docs/speech-to-text-supported-languages)。
   **v2の`asia-northeast1`は、この言語対応表のリージョン絞り込みの候補として現れることを確認した
   だけである**。v2の[locations](https://docs.cloud.google.com/speech-to-text/v2/docs/locations)は
   静的な一覧を持たずLocations APIを使う方式なので、**対応の網羅はこの出典では確認できていない**）
5. **Azure OpenAIは顧客データをモデルの再学習に使わない。**
   （[Azure OpenAI frequently asked questions](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/faq)。
   同ページに書かれているのはこの1点とdata privacyガイドへのリンクだけである）
   **未確認（同ページでは裏付けられない）**: 「OpenAIへも共有しない」、「Regional配備は選んだリージョン
   内で処理し、Global配備は複数リージョンに跨る」、「新しいモデルはJapan Eastに無くGlobal配備が必要に
   なる例がある」の3点は、**検索結果の要約から拾ったもので一次資料で確認していない**（同ページは
   リージョンの可否について model availability guide を見よとだけ書いている）。
   **案Eを外す判断は「委託先が1社増える」で足りるため、この3点に依存させない。**

**学習利用の既定値は、比較したサービスのうちAmazon Transcribeだけが例外である**（音声そのものを
渡す工程がそこなので、一番効く場所で既定値が悪い）。

| 委託先・サービス | 学習利用の既定 |
| --- | --- |
| **AWS Transcribe** | **既定で顧客コンテンツをサービス改善に利用し、利用リージョン外へ保存し得る**。opt-out policyの適用が必須 |
| AWS Bedrock | opt-out policyの**対象外**。既定はゼロデータ保持と説明されるが、**モデルごとのdata retention modeで決まる**（§26項目2。未確認） |
| OpenAI | 使わない |
| Google Speech-to-Text | data loggingはopt-in。**非同期endpointは結果を約5日保存する**（学習利用とは別の話）。**どちらもv1のFAQの記述で、v2は未確認** |
| Azure OpenAI | モデルの再学習に使わない |

したがって、**「案Aを選んだのはプライバシー上有利だから」とは書けない**。正確には「opt-outを適用すれば
並ぶ」であり、だからこそ上記「案Aを採るための必須条件」1でopt-outの適用を必須としている。

**2026-10-03の再確認の途中では「OpenAIの日本レジデンシーはAPI Platformでin-region処理とZDRを含む」と
整理していたが、これは誤りだった**。一般的な発表文と地域別の対応表を混同した読み誤りで、一次資料の
地域表では日本は地域内保存のみである。**2026-09-30に追記された上記の補足（「日本endpointがStorage
Yes / Processing No」）が正しかった**。`bedrock-runtime`と`bedrock-mantle`の2つの表を混同した誤り
（上記「確認できなかったこと」）と同じ種類の取り違えである。**発表文ではなく地域別の対応表を読む。**

**案D（Google統一）・案E（Azure統一）を候補から外した理由**。決め手を「委託先を1社に寄せる＋東京」と
置いた以上、同じ条件を満たし得る候補を並べないままにはできないため、比較表へ行として追加した上で
外した。外した理由は、**「東京に無いから」ではない**（案DのSTT v2は`asia-northeast1`をlocationの候補として持つ。ただし`ja-JP`の対応は未確認）。**どちらも基盤として
未使用のため委託先が1社増え、§26の9項目の確認が案Aの倍になる**。AWSは既にALB / ECS / RDS / S3 として
使用中で、委託先の行が増えない。加えて**案Dはv1では非同期endpointが文字起こしをGoogle側に約5日間
保存し、削除を自分たちで制御できない**（案Aは`OutputBucketName`で自前bucketへ出し、端末のACKで削除
処理を始められる。§27）。**ただしこの保持はv1の記述で、東京で使うv2で同じかは確認できていないため、
外す主因は確認作業の量の側に置く。**

**この再確認の結果、東京原則そのものを見直すことになった**。`architecture.md`が「法的・契約上の約束に
はしない」と明記しており、`privacy.md §2`の5原則にもリージョンの記述は無かった。**越境の手続きは
完了条件7の9項目の項目3（「処理・保存のリージョン。越境する場合に必要な手続き」）として挙げてあったが、
未確認のまま残っていた**（`privacy.md`は個人情報保護委員会のガイドラインを参考文献に挙げている）。
つまり**所在地の方針そのものを法的要件として確認した記録は無く、東京は自分で置いた既定値だった。**
一方でBedrockのモデル選択を縛るコストは継続して払っていた。

**2026-10-03に`architecture.md`「データ所在地と費用」を「発話内容の保存と閲覧は日本国内に限る。推論のための一時的な処理は日本国外を許容する」へ
変更した**。本Planではなく正本の側を直す手順で行った（上記「案Aを採るための必須条件」2に書いた
「モデルの都合で所在地方針を黙って曲げない」に従った結果である）。

**採用は案Aのままである**。ただし**理由が変わった。**

- 変更前: 案Cは東京原則を満たさないため落ちる。
- 変更後: **所在地では落ちない**。案Aを続ける理由は、**委託先を増やさないこと**（AWSは既に
  ALB / ECS / RDS / S3 として使用中で、9項目の確認とDPA・`privacy.md §5-1`の行の差し替えが発生
  しない）、**25MBの上限が無いこと**（Transcribeは8時間 / 2GB。
  [Transcribeのendpointとquota](https://docs.aws.amazon.com/general/latest/gr/transcribe.html)）、**ZDRのような外部裁量に依存しない
  こと**（案CはOpenAIのsales承認が得られないと監視ログの保持（最大30日）が残る）である。
- **案Cは不採用ではなく保留**とする。`architecture.md`が**委託先そのものの変更を別の判断として残した**
  ため、本Planでは採否を決めない。**同じ「国外を許容する」譲歩でも、AWS内に留まる方が安い**という
  判断までが本Planの範囲である。

**残る未決事項**。国外経路を実際に使うには**越境移転の規律**への対応が要る。**委託であっても「外国に
ある第三者への提供」には別の規律がかかる**という整理があり、同意の取得または移転先の体制整備と本人へ
の情報提供が必要になり得る。`privacy.md §1`は要配慮個人情報に当たり得るとも書いている。
**ただし確認のうち、推論経路が国内かどうかで決まらない部分がある**（公開前に終える判定と、判定に
よらず重なる義務。件数と内容は`architecture.md`「データ所在地と費用」が正本で、ここには写さない）。
**確認が済むまでは国内に収まる経路で運用する**（範囲の定義は`architecture.md`「データ所在地と費用」）。該当範囲と手当はTASK-017で判断する（§5）。
**方針を変えたことと、確認が済んだことは別である。**

## 19. 判断2: 実行方式と結果の受け渡し（比較。採用は§25-2）

**同期か非同期かは選べない**。TASK-002 §25-8が録音の上限を30分にした時点で、ALBのidle timeout
（既定60秒）の内側で文字起こしと生成を終える前提が成り立たなくなっている。したがって比較するのは
**非同期をどう実現するか**である。

### Job基盤

| 案 | 内容 | 判断の材料 |
| --- | --- | --- |
| **A（採用）: Solid Queue** | RDSのテーブルをqueueに使う。Active Jobのadapterとして設定する | 常時稼働するmiddlewareが増えない。ElastiCache Redisは最小構成でも月数千円かかり、ALB + Fargate + RDS + 公開IPv4で既に月1万円前後という見積もり（architecture）に足す余地が小さい。RDSに負荷が乗るが、1日あたりの録音件数が小さいMVPの規模では問題になりにくい |
| 案B: Sidekiq + ElastiCache Redis | 実績とダッシュボードが厚い | 上記の費用。RedisはSingle-AZでも常時課金で、使っていない時間も払う |
| 案C: SQS + 別のECSタスク | AWSに寄せられ、Rails外で再試行を管理できる | ECSタスクが増えて費用と運用が増える。1タスク構成という現在の前提（architecture）から外れる。Solid Queueで詰まってから移せる |

### workerの置き場

- **採用: 当面はECSの同一タスク内でPumaと並走させる**。タスク数を増やさない。
- 欠点は、長いJobがPumaと同じCPU・memoryを使うこと、**deployでタスクが入れ替わると進行中のJobが
  落ちる**こと。落ちた分は下記の状態別のstale判定で回収する（期限は回収の手段ではない）。
- 実測してPumaが詰まる、またはdeployのたびに落ちる件数が無視できないなら、workerを別タスクへ分ける。
  **Solid Queueのまま分けられる**ので、Job基盤の選択をやり直さずに済む。

### clientへの結果の渡し方

| 案 | 内容 | 判断の材料 |
| --- | --- | --- |
| **A（採用）: polling** | `GET /api/v1/dots/generations/:処理ID`を一定間隔で叩く | ECS 1タスクで接続を維持しなくてよい。**応答喪失後の結果照会**（TASK-002 Plan §22の表）に同じendpointで答えられる。画面を閉じて戻ってきても結果を取りに行ける |
| 案B: SSE | 待ち時間の表示が滑らか | ALBのidle timeoutと、1タスクで接続数を抱える問題。切れた後の再開を別に作ることになり、結局pollingが要る |
| 案C: ActionCable（WebSocket） | 双方向 | MVPに双方向の要件がない。Redisのadapterを使うなら案Bと同じ費用の話に戻る |

- **pollingの間隔と打ち切りはTASK-005/011で決める**。打ち切ってもJobは止まらず、結果は残る。

### 止まったJobの検知（stale判定）

**24時間は再試行の終了期限であって、障害の検知期限ではない**。初稿は「`processing`が24時間を
過ぎたら`failed`」としか書いておらず、deployでJobが落ちるたびに最大24時間「処理中」に見える
設計になっていた（レビュー指摘で修正）。次を実装の条件にする。

**ただし「最終進捗時刻からN分」だけで再実行してはいけない**。Transcribeの完了を待っている間は、
正常でも分単位で更新が止まる。それをstaleと見なすと、**生きているjobに対して同じ音声で別のjobを
開始する**（2巡目のレビュー指摘5）。Solid Queueのheartbeatはworkerプロセス単位で、
個々のJobが止まったかは判定しない。**状態ごとに別の方法で判定する。**

| 状態 | 判定の方法 |
| --- | --- |
| **HTTPのuploaderが消えた（`uploading`）** | **Jobがまだ存在しないので、Solid Queueは何も知らない**。watchdogが一定時間更新のない`uploading`を拾い、`HeadObject`で実体を見て決める（下記） |
| workerプロセスが消えた | Solid Queueがプロセスの消失として回収する。その結果をアプリ側で拾う |
| Transcribeの完了待ち | **`GetTranscriptionJob`でAWS側の状態を見る**。待っている限りstaleではない |
| Job個体が止まった | 試行回数とlease tokenで排他し、二重実行を防いだうえで再実行する |

**`uploading`の回収を誰がやるかが抜けていた**（3巡目のレビュー指摘2）。record-firstにしたことで、
記録をcommitしたあと・upload完了前にrequestやcontainerが落ちる窓ができた。**この時点ではJobを
enqueueしておらず、Transcribeのjobも無いので、上の3つのどれにも引っかからない。**
pollingは永遠に`uploading`を返し、退会は「進行中の処理がある」まま完了できない。

- **uploadにも試行番号とlease tokenを持たせる。**
- watchdogが、最終進捗時刻から一定時間更新のない`uploading`を検知し、`HeadObject`で判定する。
  - **objectが無い** → `upload_failed`へ。
  - **objectが完成していて、まだenqueueしていない** → `accepted`へ進めてenqueueする。
  - **世代が合わない、または利用者が退会中** → objectを削除して **`cancel_requested`へ**（そこから`cleanup_pending`へ進む）。状態表を飛ばして直接`cleanup_pending`にしない。
- **再uploadを許すのは、旧leaseを失効させて新しい実行権を取った要求だけ。**「既存の記録が
  あればbodyを受け取らない」は、**生きているuploadと放置されたuploadを区別してから**適用する。
  区別せずに再uploadを許すと、元のrequestと再requestが同じkeyへ並行して書く。

- 処理の記録に**最終進捗時刻**を持ち、workerが段階を進めるたびに更新する。判定の材料の1つとして
  使い、**単独の根拠にしない。**
- 具体値と実装はTASK-009で、Solid Queueの実際のlease・heartbeat・異常終了後の再取得の挙動を
  確認して決める。
- 24時間の期限は、stale判定とは別に**再試行できる上限**として残す。
  **「24時間を過ぎたら`failed`」をstale検知の代わりに使わない。**
- TASK-009の検証条件に、worker concurrency・DB poolの数・CPU/memory割当・deploy中断時の
  回収時間を含める。`RAILS_MAX_THREADS`はSolid Queueの実行並列数そのものではないため、
  別に確認する。

**Transcribeの完了待ちでworkerのthreadを占有し続ける方式は、実測で成立しなければ分割する。**
TranscribeはEventBridgeへ完了・失敗のイベントを出せるため、「開始するJob」「完了を受けて生成へ
進むJob」に分ければthreadを長時間持たない。**新しいAWS構成が増えるためMVPの必須にはしないが、
ECS 1タスクで30分の音声を扱う現実性が足りなければここへ移る**（TASK-009で実測して判断）。

## 20. 判断3: 冪等性と処理の記録（比較。採用は§25-3）

TASK-002 Plan §17の「処理の記録」行と`privacy.md §5-1`が、**成功した処理の記録をいつ消すかを
TASK-003と相互確認する**として未確定のまま残している。ここで答える。

### 冪等性keyの置き場

| 案 | 内容 | 判断の材料 |
| --- | --- | --- |
| **A（採用）: `dots`の列に持つ** | **serverが録音開始操作に対して発行する録音attemptの識別子**を処理IDとして使い、`dots`の列にunique index付きで保存する（別々のIDを持たない）。処理の記録は進行中・失敗中・cleanup待ちのものだけ残す | TASK-002 §8の「**長く残るものをDot 1行に収める**」と一致する。Dotを消せば冪等性keyも一緒に消え、削除連鎖と退会時の回収対象が増えない。応答喪失後に同じkeyで再送されたらunique制約で衝突し、既存のDotを返せる（結果照会が成立する） |
| 案B: 成功した記録も別テーブルに一定期間残す | 削除済みDotへの再送を区別できる。結果照会をDotに依存せず行える | **記録自体が個人データ**（誰がいつ録音したかが分かる）で、`privacy.md §5-1`に新しい保持期間の行が増える。退会時に消す対象も増える。得られるのは稀なケースの区別だけ |
| 案C: 冪等性を持たず、二重のDotは利用者が削除する | 実装が軽い | 外部AIの消費が二重になる。journaling.md §4の受け入れ条件を、より弱い方（利用者に結果を示す）でしか満たせない |

**採用は案A**。案Aの弱点（削除済みDotへの再送を区別できない）は§13に記録した。

#### 一回性の起点をTASK-004の録音attemptへ寄せる（2026-09-29に統合）

初稿は**clientが録音ごとに発行するUUID**を処理IDにしていた。TASK-004が`started_at`の根拠として
**録音attempt**（録音開始操作に対して**serverが**発行する識別子。正本は
[dot-history.md §2](../dot-history.md)）を採用したため、**一回性の起点をそちらへ寄せる。**

- **clientが発行するUUIDをやめ、録音attemptの識別子を処理IDにする。**
- これで、**§20の「命名」で足したprovider IDの層を廃止した**。provider IDを導入した理由は
  「client発行の処理IDは利用者単位でしか一意でないため、AWSのjob名やS3のkeyに使うと利用者間で
  衝突する」というものだった（2巡目のレビュー指摘13）。**録音attemptはserver発行なので、
  AWSアカウント内で一意にできる**。層を1つ減らせる。
  - ただし**録音attemptの識別子がAWSアカウント内で一意であることを、TASK-005の契約で満たす**
    必要がある。満たせない形（利用者ごとの連番など）になるなら、server発行の別IDを1つ足してAWSの名前をそこから導く（廃止したprovider IDの層を戻すことに相当する）。
- **未送信の録音attemptをserverに保存する必要はない**。TASK-004 §18-3が
  「一回性は署名の検証だけでは保証できない。初回のuploadで、attemptの識別子を処理の記録へ
  **原子的に関連付ける**ことで担保する」としているとおり、**署名済みの値を端末のmemoryに置く方式でも、
  処理の記録側のunique制約で一回性が成立する。**
  - したがって`privacy.md §4`が置いた分岐（server保存を選ぶ場合は§5へ未送信attemptの保持・期限・
    削除を追加する）は**発火しない見込み**である。採否はTASK-005の範囲なので、
    **server保存を選ぶ場合は§5への追記が要る**ことだけ書き残す。

#### TASK-004から渡された不変条件への対応

| TASK-004 §18-3の不変条件 | 本Planでの扱い |
| --- | --- |
| attemptはcurrent_userに紐づき、**1つのattemptは1件のDot生成にしか使えない** | 処理の記録の`(user_id, 処理ID)`のunique制約で担保する。初回uploadで利用者の行をlockして記録を作るのと同じtransactionで行う |
| 同じattemptの再送は**同じ処理を返すか明示的な競合を返す**（どちらかはTASK-003/005で決める） | **「同じ処理を返す」を採用する**。既存の記録があればbodyを受け取らず、既存の状態を返す（§20の冪等性と同じ規則） |
| **upload受理後の24時間再試行はattemptの再利用ではなく処理の記録を使う** | 一致する。受理後の再試行・cleanupはすべて処理の記録で認可する（§20の入口の手続き）。**attemptを使用済みにしたことが正規の再試行を拒否する理由にならない** |
| 再試行やJob再実行でも**元のattempt由来の`started_at`を維持する** | `started_at`は受理時に記録と`dots`へ書き、再試行・Job再実行で書き換えない（定義は[dot-history.md §2](../dot-history.md)） |
| 録音をやり直したら新しいattemptを発行し、古いattemptを流用できない | 本Planの範囲外（TASK-010がFrontendで扱う）。server側は使用済みのattemptを受け付けないことで担保する |

**識別子の寿命と、attemptが使える期間は別である**。録音attemptは受理の時点で使用済みになり、
2回目のuploadには使えない（TASK-004 §18-3の「1つのattemptは1件のDot生成にしか使えない」）。
一方、**その識別子は処理IDとして`dots`に残り続け、pollingとACKのURLに出る。**

- **「attemptが使用済み／期限切れだからpollingも拒否する」としない**。受理後の照会・再試行・
  cleanupはすべて処理の記録と`dots`で認可する（§20の入口の手続き）。
- 別Userへ入り直した後に前のUserのattemptを使えないこと（TASK-004）は、
  本Planの認可（`current_user`へscopeする）で満たす。

**録音attemptの期限と、本Planの期限の関係**。時計の起点が違うので直接は競合しない。

- **録音attemptの期限は受理より前**の区間に効く（`dot-history.md §2`が「最長30分の録音と、
  停止から送信までの時間・失敗後の再試行の猶予を含めて設定する」としている）。
- **本Planの「受理から24時間」と実行権（lease）の失効は、受理より後**に効く。
- 両者が重なるのは、**`uploading`／`upload_failed`からの再upload**（§24-2・34）だけである。
  ここでは同じattemptを使い続けるので、**再uploadを許す窓は録音attemptの期限を超えない。**
  期限が切れていれば再uploadも受け付けず、録り直しになる。具体値は`dot-history.md §2`の条件に従い、
  本Planでは決めない。

### 処理の記録に持つ項目（採用）

TASK-002が必須とした項目に、このタスクの決定で必要になるものを足す。

| 項目 | 目的 |
| --- | --- |
| **処理ID（＝冪等性key＝録音attemptの識別子）** | **serverが録音開始操作に対して発行する**（TASK-004）。結果の照会と重複の判定を**同じ識別子**で行う。**成功時に`dots`の行へ引き継ぐ**ので、記録を消した後もこのIDでDotを引ける。server発行なのでAWSアカウント内で一意にでき、**S3のkeyとTranscribeのjob名もここから導く**（下記「命名」） |
| **`started_at`** | **定義は[dot-history.md §2](../dot-history.md)を見る**（TASK-004が決めた基準時刻。本Planでは写さない）。本Planが決めるのは扱いだけで、**受理時に記録へ書き、再試行・Job再実行で書き換えない**。`dots`へも同じ値を書く |
| 所有者（user_id） | upload後の再試行・Job実行・削除の認可。**IDを所有権の代わりにしない** |
| 音声のobject key・文字起こし結果のobject key | cleanupの対象を特定する。処理IDから導けるが、**記録にも持つ**（導出規則を変えたときに過去分を回収できなくなるため） |
| Transcribeのjob名 | 同上。非終端jobの照会（`GetTranscriptionJob`）と削除に要る |
| 受理時刻・再試行期限 | 期限の判定と、画面に出す期限日時 |
| 状態 | 下記「状態の一覧」の9つ。`uploading` / `upload_failed` / `accepted` / `transcribing` / `generating` / `failed` / `succeeded_cleanup_pending` / `cancel_requested` / `cleanup_pending` |
| 最終進捗時刻 | 止まった記録を検知するため（§19のstale判定） |
| 利用者の世代番号 | 退会との排他（下記） |
| 失敗の種類 | 再試行できるかの判定と、画面の文言の出し分け |

**unique制約は`dots`だけでなく処理の記録にも要る**。記録側にも`(user_id, 処理ID)`のunique制約を
置く。Dotがまだ無い間に同じ処理IDのPOSTが並行すると、**記録が2件でき、Jobが2本enqueueされ得る**
（2巡目のレビュー指摘4）。衝突したら新しく作らず、既存の記録の状態を返す。

**処理IDと冪等性keyを別々にしない**。別にすると、成功時に記録を消した時点で処理IDとDotの対応が
消え、pollingが結果を引けなくなる（初稿はこの穴を持っていた。1巡目のレビュー指摘で修正）。
`dots`のunique制約も`(user_id, 処理ID)`にし、照会は常に`current_user.dots`にscopeする。
clientが他人のIDを推測しても、所有者が一致しなければ存在しない扱いにする。

#### 語の定義（TASK-004の「録音attempt」と混同しない）

TASK-004が`started_at`の根拠として**録音attempt**（録音開始操作に対してserverが発行する識別子。
正本は[dot-history.md §2](../dot-history.md)）を採用したため、**本Planでは「attempt」という語を
使わない**（2026-09-29にTASK-004の担当と調整。同じ語を別の概念に使うと読み手が混乱するため、
内部実装語である本Plan側を改名した）。

| 本Planの語 | 意味 | TASK-004の「録音attempt」との違い |
| --- | --- | --- |
| **試行番号** | 再試行の世代。S3のkeyとTranscribeのjob名に含め、古いPUTが後から完成したときの孤児を回収する（upload試行番号／文字起こし試行番号） | 録音attemptは録音開始の受理証で、1件のDot生成にしか使えない（**本Planではその識別子を処理IDとして使う**）。試行番号は1つの処理の中で増える |
| **実行権**（lease token） | 同じ処理を二重に動かさないための排他。入口で発行する | 同上 |
| **世代番号** | 利用者ごとの番号。退会との排他に使う | 処理ではなく利用者に紐づく |

#### 命名: 処理IDをそのままAWSの名前に使わない

**`TranscriptionJobName`はAWSアカウント内で一意でなければならず、衝突すると`ConflictException`に
なる**（[StartTranscriptionJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html)）。
**初稿は処理IDをclient発行のUUIDにしていた**。DBのunique制約が`(user_id, 処理ID)`だったため、
別の利用者が同じ値を送れてしまい、そのままAWSの名前に使うと次が起き得た（2巡目のレビュー指摘13）。

- 他人と同じ値を送るだけでjobの開始を妨害できる。
- S3のkeyも処理IDだけから作ると、**利用者をまたいで上書き・誤読が起き得る。**

**現在の処理IDはserver発行（TASK-004の録音attempt）なのでこの経路は塞がっているが、
一意性を前提にした設計であることは変わらない**。AWSの名前はその処理IDから導く。

- 処理IDは**録音開始操作に対してserverが発行する**（TASK-004の録音attempt。旧案はserver側でUUIDを
  もう1つ発行する案だった）。**AWSアカウント内で一意**であることを満たす必要がある（TASK-005で契約化）。
  **処理IDは処理ごとに1つで、試行番号が変わっても変わらない。**
- **名前は処理IDと試行番号の2つから導く**。処理IDだけからは導かない
  （5巡目のレビュー指摘3。4巡目に試行番号ごとのkeyを足したとき、「1つのIDだけから決定的に導く」
  という元の規則と衝突したまま両方が残っていた）。

| 資源 | 導出規則 | 試行番号が変わる契機 |
| --- | --- | --- |
| 音声のobject key | `audio/<処理ID>/<upload試行番号>` | 再upload |
| Transcribeのjob名 | `<処理ID>-<文字起こし試行番号>` | 文字起こしからの再試行 |
| 文字起こし結果のobject key（`OutputKey`） | `transcripts/<処理ID>/<文字起こし試行番号>.json` | 同上 |

- **記録は「現在有効な試行番号」と、そこから導いた現在有効なkey・job名を持つ。**
  Transcribeへ渡す入力は現在有効な音声key、cleanupの第一の対象は現在有効なkeyである。
- **古い試行のkeyは、prefixを列挙して回収する**（下記「孤児の回収」）。
- 試行番号を固定したまま同じ名前で照会できるので、**応答喪失時に`GetTranscriptionJob`で
  既存jobへ合流する**という規則（§20のTranscribeのjobの回収）はそのまま成り立つ。
- **user_id・email・録音日など、推測できる値や個人情報をAWSの名前に入れない。**
- **`TranscriptionJobName`には文字種と長さの制約がある**。AWSアカウント内で一意であることに加え、
  `^[0-9a-zA-Z._-]+`、最大200文字である
  （[StartTranscriptionJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html)）。
  **制約が掛かるのは処理ID単体ではなく、`<処理ID>-<文字起こし試行番号>`として組み立てた後の
  job名全体である**。試行番号を付けた後の長さと文字種で判定する。形式はTASK-005の契約で定め、
  実際の値での確認はTASK-009で行う。

- 置き場は**RDSの表**にする。Solid QueueがRDSを使うため、Jobと記録の整合を同じDBで扱える。
- **記録自体も個人データ**として`privacy.md §5-1`の対象に残す。

#### 状態の一覧（これを正とする）

2巡目・3巡目のレビューで状態を足したため、**ここに一覧を置き、他の節はここを参照する。**

| 状態 | 意味 | 遷移（ID・先・検証するシナリオ） |
| --- | --- | --- |
| `uploading` | 記録はcommit済み、S3へのuploadが進行中または放置 | **T1** → `accepted`（§24-1） ／ **T2** → `upload_failed`（§24-2・30） ／ **T3** → `cancel_requested`（§24-19） |
| `upload_failed` | objectが完成しなかった | **T4** → `uploading`（新しい実行権を取った要求だけ。§24-34） ／ **T5** → `cancel_requested`（§24-33） |
| `accepted` | objectが完成し、Jobをenqueueした | **T6** → `transcribing`（§24-1） ／ **T7** → `cancel_requested`（§24-3・33） |
| `transcribing` | Transcribeのjobを開始し、終端を待っている | **T8** → `generating`（§24-1・25） ／ **T9** → `failed`（§24-4・12） ／ **T10** → `cancel_requested`（§24-26） |
| `generating` | 生成中 | **T11** → `succeeded_cleanup_pending`（§24-1） ／ **T12** → `failed`（§24-5・6・8・13） ／ **T13** → `cancel_requested`（§24-14） |
| `failed` | 失敗。期限内なら再試行できる | **T14** → `transcribing`（音声から。§24-4） ／ **T15** → `generating`（全文から。§24-5・6） ／ **T16** → `cancel_requested`（§24-16・33） |
| `succeeded_cleanup_pending` | **Dotは保存済み**。cleanupだけが残っている | **T17** → 自分自身（cleanup失敗→新しい実行権で再実行。§24-23・32） ／ **T18** → 削除（cleanup完了。§24-1） ／ **T22** → `cancel_requested`（この状態のままDotの完全削除・退会を受理した。**T17の自己遷移より優先する**） |
| `cancel_requested` | 退会・期限到来・明示削除。**これ以降、生成へ進まない** | **T19** → `cleanup_pending`（§24-26・33） |
| `cleanup_pending` | 外部資源の後片付け中。非終端jobの終端待ちを含む | **T20** → 自分自身（cleanup失敗→新しい実行権で再実行。§24-32） ／ **T21** → 削除（cleanup完了。§24-19） |

**遷移IDはシナリオ側から参照する**（5巡目の任意指摘）。**上表のどの遷移にも、対応するシナリオが
無い状態を作らない**。遷移を足したら、同じ変更でシナリオも足す。

**§24には遷移に対応しない行もある**。polling時の判定（9・21・22）、認可（15・28）、冪等性
（10・11・27・29）、個別の資源のcleanup失敗（17・18・31）、stale判定の方法（7）、
外部への応答喪失（24）などで、これらは遷移そのものではなく**遷移の前後で守る性質**を見ている。
対応が無いことを漏れと扱わない。

**cleanupの失敗は終端ではない**（4巡目のレビュー指摘2）。`succeeded_cleanup_pending`と
`cleanup_pending`は**状態を保ったまま新しい実行権を取って再実行する**（自己遷移）。

- 再実行はcleanupの認可条件（下記の5契機の表）で入る。leaseで二重実行を防ぐ。
- **既に消えている資源への再実行は冪等に成功として扱う**。S3のobjectもTranscribeのjobも、
  無ければ「消えている」ので失敗にしない。
- **`succeeded_cleanup_pending`からDotを作り直さない**。この状態の記録はcleanup専用で、
  生成の入力には使わない。
- 全部消えてから記録を削除する。**途中で落ちてもこの状態に留まるので、必ず再開できる。**

**再uploadは`uploading`へ戻す**（4巡目のレビュー指摘3）。新しい実行権（lease token）を発行し、
古い実行権を失効させたうえで`upload_failed` → `uploading`と遷移させる。状態を据え置いて
実行権だけ更新する形にはしない（`uploading`が「upload中」を表す状態のままになるため）。

**旧leaseを失効させても、開始済みのS3 PUTは止まらない**（4巡目の任意指摘🔵）。失効の直後に
古いPUTが完成し得る。**object keyに試行番号を含めて試行ごとに別のkeyにする**ので、新しい試行の
objectを壊すことはない。取り残される旧keyは「孤児の回収」（prefixの列挙とlifecycle）で拾う。
**「lease失効だけで古いPUTが無効になる」と仮定しない。**

**すべての遷移は条件付き更新（現在の状態を条件に含めるUPDATE）で行う**。状態を確保してから
S3の読み出しや外部サービスの呼び出しへ進む。読んでから更新するのでは、下の競合を防げない。

**`cancel_requested`と`cleanup_pending`は`transcribing`と別の状態にする**。同じ`transcribing`から
「終端後に生成へ進む」と「終端後に削除する」の両方へ分岐させると、**退会したのにBedrockへ
全文を送る経路**が残る（3巡目のレビュー指摘3）。

#### 入口の手続き（retry・再upload・cleanupに共通）

**新しい処理を始める側は、すべて同じ手続きを通す**。利用者の操作による再試行も、自動回収による
再実行も区別しない。**共通なのは手続きであって、認可の条件ではない。**

1. **利用者の行を`FOR UPDATE`でlockする。**
2. **現在の状態が遷移元として妥当であることを確認する。**
3. **下表の認可条件を確認する。ここだけ処理ごとに違う。**
4. 条件を満たせば実行権（lease token）を発行し、状態を条件付きで更新してからcommitする。
5. **外部の呼び出しはcommitのあとに行う。**

| 処理 | 認可の条件 | 消す対象 |
| --- | --- | --- |
| retry（生成・文字起こしの再試行） | 利用者が`active`・世代一致・**期限内** | — |
| 再upload | 同上。加えて旧leaseが失効していること | — |
| cleanup / **成功の確定**（Dotの保存まで完了） | 記録が`succeeded_cleanup_pending`であること | **音声だけ**（文字起こし結果はACKを待つ） |
| cleanup / **ACKの受領** | `current_user.dots`と`(user_id, 処理ID)`で認可（§27） | **文字起こし結果とTranscribeのjob** |
| cleanup / **期限到来** | 受理から24時間を過ぎたこと | **その処理の全部**（音声・文字起こし結果・job・記録） |
| cleanup / **Dotの完全削除** | 本人の削除要求（`current_user.dots`で認可） | **そのDotを作った処理の分だけ**。同じ利用者の他の録音には触れない |
| cleanup / **退会** | 退会の受理 | **本人の全処理の分** |

**cleanupは1つの条件で括れない**（5巡目のレビュー指摘1）。4巡目に「期限到来・退会・明示削除」と
書いたが、**正常完了時の音声の削除とACK後の削除もcleanupである**。その2つが表に無いと、
一覧どおりに適用したときに正常系のcleanupを開始できない。**契機ごとに認可条件と消す対象が違う**
ので、上表のように分ける。

**cleanupに`active`と期限内を要求してはいけない**（4巡目のレビュー指摘1）。期限到来・退会による
cleanupの契機はまさに「退会した」「期限が過ぎた」なので、retryと同じ条件を当てると
**`cancel_requested`と`cleanup_pending`から永久に抜け出せなくなる。**

### 孤児の回収（5巡目のレビュー指摘2）

**旧leaseを失効させても、開始済みのS3 PUTは止まらない**。cleanupがkeyを消した後に古いPUTが
完成すると、**消したはずのkeyが再び現れる**。記録を削除済みなら、記録を辿る回収もできない。

- **記録を削除する前に、進行中の実行権が無いことを確認する**。leaseが失効していること、
  および`HeadObject`で現在の実体を確認することを条件にする。
- **それでも取りこぼす**。PUTの完了を外から確実に止める手段はないため、
  **記録に依存しない回収を別に置く。**
  1. cleanupのたびに`audio/<処理ID>/`と`transcripts/<処理ID>/`を**prefixごと列挙して
     消す**。現在有効なkeyだけを消す形にしない。
  2. **prefixにS3のlifecycleを掛ける**（TASK-002 Plan §18案A2と同じ位置づけで、**保険であって
     削除時刻の根拠にしない**）。記録が消えた後に現れたobjectは、これが最後の受け皿になる。
  3. 残存を検知できるようにする。検知の方法はTASK-013/015。
- **「必ず消える」とは書かない**。lifecycleの日数指定は「削除対象になるまで」で、その後の削除も
  遅延し得る。`privacy.md §5-2`の約束できる／できないの分け方をそのまま使う。
- PUTの実行と終了の実際の挙動は**TASK-009で確認する**。確認するまで「lease失効で止まる」と
  仮定しない。

- **retryとcleanupは同じ記録を奪い合う**。`failed`から`transcribing`/`generating`へ進める更新と、
  `failed`から`cancel_requested`へ進める更新を**どちらも条件付きにして、片方だけを成功させる**
  （3巡目のレビュー指摘5）。上表のとおり条件が重ならないので、両方が勝つことはない。
- **退会の受理後にretryを受け付けない**。retryの入口が利用者の行をlockして`active`を見るので、
  自動回収も含めてここで止まる。TASK-002の「退会の受理以降は新規の保存・再試行・結果の確定を
  止める」を満たす。**cleanupは止めない。**
- **保証できる境界を明示する**。退会より前に始まったBedrockのrequestは止められない。
  約束できるのは「**退会の受理後に新しいBedrockのrequestを開始しない**」ことと、
  「**退会後に結果を確定させない**」ことである。

#### 状態遷移: Dotの保存とcleanupを分ける

**「Dotを保存 → 音声を削除 → 記録を削除」を1本の流れにすると、途中で落ちたときに成功が消える。**
Dotの保存直後にworkerが止まると、Dotと`generating`の記録が同時に存在し、pollingは記録を先に見る
ため**保存済みなのに「処理中」と返してしまう**（2巡目のレビュー指摘10）。stale回収が走れば、
削除済みの音声から再生成しようとする。

- **Dotの保存と、記録を`succeeded_cleanup_pending`にする更新を同じtransactionで行う。**
- **pollingはDotの存在を先に見る**。`dots`に同じ処理IDがあれば成功として返し、
  残っている記録はcleanup用として扱う。**`succeeded_cleanup_pending`の記録を生成の再試行に使わない。**
- cleanup（音声・文字起こし結果・Transcribeのjob）が全部終わってから記録を削除する。
  途中で落ちても記録が残るので、**再実行できる。**

**この結果、Q3の判断は「成功した時点で記録を削除する」から「cleanupが終わった時点で削除する」へ
実質的に変わった**（3巡目のレビュー指摘1）。成功後も記録が残る時間が生まれる。

- 残す理由は**cleanupの再実行に必要だから**である。処理ID・両方のobject key・job名を
  持っているのはこの記録だけで、Dotの保存と同時に消すと**消し残しを回収できなくなる。**
- 残っている間、この記録は**cleanup専用**で、生成の再試行には使わない。
- **記録自体が個人データ**（誰がいつ録音したか）なので、`privacy.md §5-1`の行をこの実態に
  合わせる。「成功時は記録ごと削除」ではなくなった。
- 保持の長さはcleanupの完了に従う。ACKが届けば数秒〜数分、届かなければ期限のあと、
  削除に失敗すればさらに長い。**消え終わる時刻は約束しない。**

#### 冪等性: 同じ処理IDに別の音声を載せられないようにする

**処理IDはserver発行になったので、clientが値を選ぶことはできない**（2026-09-29の統合）。
ただし**clientは受け取った録音attemptを手元に持つので、同じattemptで別の録音を送ることは
技術的に可能**である（2巡目のレビュー指摘12。指摘を受けた時点の理由は「clientがUUIDを発行する
ため」だったが、server発行にしても経路自体は残る）。先のrequestが処理中に別requestが同じkeyを上書きすると、
Jobがどちらの音声を読むか決まらない。

- **object keyはserverが処理IDから決め、clientの値で上書きさせない。**
- 同じ処理IDの記録が既にあれば、**bodyを受け取らずに既存の状態を返す。**
- 再uploadを許すのは、状態が`uploading`または`upload_failed`で、**完成したobjectがまだ無い場合だけ**。

### 退会と進行中処理の排他（TASK-002からの必須条件への回答）

TASK-002 Plan §20は「退会の受理以降は新規の保存・再試行・結果の確定を止め、あとから現れた残存を
回収してから完了とする」を必須条件とし、**方式をTASK-003/005へ渡した**。採用する方式は次のとおり。

**状態の確認と記録の作成を別々に行うと排他にならない**。次の順で競合する。

1. POSTが利用者の状態を確認する（まだactive）
2. 退会が`withdrawing`へ変更し、既存のobjectと記録を列挙して削除する
3. 1のPOSTがS3 objectと処理の記録を**あとから**作る

「列挙のあとにもう一度確認する」を何回足しても、最後の確認の直後に同じことが起き得るので排他に
ならない（初稿はこの形だった。レビュー指摘で修正）。採用する方式は次のとおり。

**順序はrecord-firstに統一する**。S3へ置いてから記録を作ると、upload完了後・記録作成前に退会が
走ったときに**そのobjectを列挙できない**（2巡目のレビュー指摘1。初稿の§9はこの順だった）。

1. **利用者の行をlockし、`active`の確認と`uploading`の記録の作成を同じtransactionで行う。**
   受理時に`SELECT ... FOR UPDATE`で利用者の行を取り、`active`であることを確認したうえで
   記録を作り、そのときの世代番号を記録へ写して**commitする**。退会の状態遷移も同じ行のlockを
   取るため、**「activeを確認したのに記録が作られない」も「退会後に記録が作られる」も起きない。**
2. **commitのあとにS3へuploadする**。object keyは記録が持つ（処理IDから導く）。
   uploadが完成したら記録を`accepted`にし、**そこで初めてJobをenqueueする。**
   完成前にenqueueすると、Jobが存在しないobjectを読む。
3. **upload完了時に世代番号を再確認する**。ずれていれば、または記録が消えていれば、
   **手元のobject keyでそのobjectを削除し、cleanupが終わったことを記録する。**
   記録が消えている場合に何もしないと、object だけが残る。
4. **退会は`uploading`の記録を即削除しない**。cancel対象として残し、uploaderが片付けるのを待つ。
   数えて消すだけだと、この記録が指すobjectが後から完成して取り残される。
5. **Jobの最終書き込みでも、同じ利用者の行を`FOR UPDATE`でlockする**。世代番号の確認とDotの
   insertを同一transactionに入れる。lockを取らずにtransactionへ入れるだけでは、
   **確認した直後・insertの直前に世代が変わる経路**を塞げない。
6. **退会の完了条件は「その利用者の進行中の処理が0であること」**。DBの行数ではなく、
   **upload・Transcribeのjob・cleanupのいずれも未完了のものが無い状態**を指す。
   非終端のTranscribeのjobが残っている間は完了としない（§25-9）。
7. 削除の順序はTASK-002のとおり（先にS3、成功してからRDS）。
8. logoutとは扱いが違う。logoutは受理済み処理を残してよいが（TASK-001 Plan）、
   **退会は受理済み処理を残したまま終われない。**

### Transcribeのjobの回収（2巡目のレビュー指摘2）

**objectを消してもTranscribeのjobは残る**。そしてjobが非終端（`IN_PROGRESS`等）のときの
`DeleteTranscriptionJob`は`BadRequestException`になり得る
（[DeleteTranscriptionJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_DeleteTranscriptionJob.html)。
`StartTranscriptionJob`のエラー節にも "if it's in a non-terminal state (such as `IN PROGRESS`)" とある）。
**削除を要求しただけでは、退会や期限のあとにjobが完了して全文を書き出す経路が残る。**

- **`StartTranscriptionJob`のresponseを失っても、新しいjobを作らない**。job名は処理IDと文字起こし試行番号から
  決まるので、`GetTranscriptionJob`で既存のjobへ合流する。
- **非終端のjobが残っている間は処理の記録を消さない**。終端になるまでreconcileし、
  終端後にobjectとjobを削除してから記録を消す。
- 退会の「進行中0」の判定に、この非終端jobを含める。

**終端後にどちらへ進むかは、状態で決める**。同じ`transcribing`から「生成へ進む」と「削除する」の
両方へ分岐させない（3巡目のレビュー指摘3）。

- 退会・期限到来・明示削除を受理した時点で、記録を **`cancel_requested`** にする。
  非終端jobはこの状態のまま終端を待つ。
- **Transcribeが終端したら、Bedrockへ送る前に入口の共通条件をもう一度通す**
  （利用者の行のlock・`active`・世代・期限・現在の状態）。
  - `transcribing`のままで条件を満たす → `generating`へ進む。
  - `cancel_requested` → **生成へ進まず`cleanup_pending`へ**。全文をBedrockへ送らない。
- これがないと、**退会を受理したあとに発話内容の全文を新しくBedrockへ送る**経路が残る。
  Dotのinsertは世代確認で防げても、外部への送信自体は防げていなかった。

**生成のcancel UIはMVPで持たない**（TASK-002 Plan §24-11）。退会時に結果を確定させないことと、
利用者が生成を中断できることは別の話である。

## 21. 判断4: AIへ送る前の固有名詞の低減（比較。採用は§25-4）

| 案 | 内容 | 判断の材料 |
| --- | --- | --- |
| **A（採用）: 低減処理を入れない** | 録音前の案内で言い換えを促し、生成後は編集・ゴミ箱・即時完全削除・退会で対応する | `privacy.md §2原則5`がMVPの手段を「Dot本文の編集、1件ごとの削除、退会」と既に定めており、それと一致する。低減の実効性を謳わずに済む |
| 案B: 文字起こし後・生成AIへ送る前にPII検出でマスキング | 生成AIへ渡る人名が減る | **効果は限定的だが、ゼロではない**。元音声がTranscribeへ渡ることは防げないが、**Bedrockへ渡すテキスト、Bedrock側の保持・レビューの対象、生成結果へ固有名詞が伝播する範囲は減らせる**（TranscribeとBedrockは同じAWSでも別サービスで、保持の仕組みも別。§18のとおりopt-out policyの対象かどうかすら違う）。その効果より、`privacy.md §2原則4`が戒める誤判定と文脈を壊す置換、実装・検証の費用を重く見て採らない。なお`ja-JP`はTranscribeのContent Redactionに非対応のため、採るなら別手段が要る |
| 案C: 端末内文字起こしを採用し、音声を外部へ出さない | 唯一、外部へ渡る境界そのものを無くせる | TASK-002 Plan §18案Cが「成立しないからではなく、対応範囲と検証コストがMVPに見合わないため」不採用と判断したばかりで、**それを覆す新しい材料が今ない** |

**採用は案A**。理由は「効果が無いから」ではなく、**限定的な効果より誤検出・文脈破壊・実装費を
重く見たから**である（初稿は「同じ委託先だから境界を1つも減らせない」を主理由にしていたが、
法人単位ではなくサービス処理境界で見ると不正確だった。レビュー指摘で修正）。
再評価する条件は、**§18で委託先を分ける判断へ戻ったとき**（分かれれば効果が大きくなる）、
または**生成結果への固有名詞の伝播が実際に問題になったとき**。

### 採用の帰結（利用者への説明）

- **低減したとは表示しない。**「匿名化済み」「個人情報を除去しました」と書かない
  （`privacy.md §1`）。
- 録音前の案内は、TASK-002 Plan §22の7項目をそのまま使う。項目7「固有名詞の置換を行う場合でも
  見逃しがあるため『匿名化済み』とは言わない」は、**置換を行わないので該当しない。**
  代わりに「他人の実名・住所・連絡先は、必要がなければ言い換えられること」（項目5）と、
  「外部へ渡った内容の即時削除は保証できないこと」（項目6）で説明する。
- **promptでも中途半端に伏せない**（§17）。人名が出てきても伏せ字にせず扱う。伏せると、
  利用者が編集で直そうとしたときに何が残っているか分からなくなる。
- 再検討の条件: 委託先を分ける判断へ戻ったとき、生成結果への固有名詞の伝播が問題になったとき、
  または端末内文字起こしが日本語・長時間で実用になると確認できたとき。

## 22. 費用の見積もり（概算。実値は公開前に再確認）

product.mdの基盤費は月5,000円目標・1万円前後許容で、**音声保存・文字起こし・AI・通信量は別従量予算**
と定めている。本節はその別予算の側である。

| 項目 | 単価（東京） | 30分の録音1件あたり |
| --- | --- | --- |
| Amazon Transcribe バッチ | $0.006 / 分（[Price List API, ap-northeast-1](https://aws.amazon.com/transcribe/pricing/)） | **約 $0.18** |
| Bedrock の Claude 入力 | モデルによる | 文字起こし1〜2万字で概ね $0.05〜$0.10 |
| Bedrock の Claude 出力 | モデルによる | 数百字で概ね $0.01 未満 |
| S3 一時object | 成功時に削除処理を始める | 月1円未満（TASK-002 §25-9） |
| **合計** | | **約 $0.23〜$0.28（1ドル150円で約35〜42円）** |

- **費用の7割はTranscribeである**。生成側ではなく文字起こし側が支配的で、**録音の長さにほぼ比例する。**
  月1,000件なら約$230〜$280（約3.5〜4.2万円）で、**基盤費より大きくなる。**
- Claudeの単価はモデルと、Global / Geo のどちらで呼ぶかで変わる。**model idを確定していないため
  （§18）、生成側の金額は幅を持った概算である。**
- 費用を下げる余地は、短くするなら**録音の上限か無音区間**にある。生成側のprompt cachingは
  効くが、元々小さい方を削ることになる。
- **再試行の粒度も費用に効く。**§25-5で「文字起こし結果が残っていれば生成からやり直す」に
  変えたため、生成だけが失敗した場合にTranscribeを再実行しなくなる。支配項目を繰り返さずに済む。
- **公開前にPricing Calculatorで実構成の再見積もりを行う**（product.mdの既存方針）。

## 23. 人間に判断を求めた項目（2026-09-29・回答済み）

| # | 決めたこと | 回答 |
| --- | --- | --- |
| Q1 | 文字起こしと生成のproviderの組み合わせ（§18 A/B/C） | **A**（委託先をAWSに統一。Transcribe東京 + BedrockのClaude） |
| Q2 | Job基盤と結果の受け渡し方（§19 A/B） | **A**（Solid Queue + 同一タスク内worker + polling） |
| Q3 | 成功した処理の記録をいつ消すか（§20 A/B/C） | **A**（冪等性keyは`dots`の列。**2026-09-29にclient発行のUUIDからserver発行の録音attemptへ変更**）。**ただし2巡目・3巡目のレビューを受けて「成功時に削除」から「cleanupが終わった時点で削除」へ変わった**（§20の状態遷移） |
| Q4 | 固有名詞の低減をどこまでやるか（§21 A/B/C） | **A**（低減しない。編集・削除・退会で対応） |
| Q5 | 文字起こし結果の置き場（§27 A/B/C/D） | **A**（自前のS3へ置く。**端末の削除ACKを受けた時点で削除処理を始め、届かない場合の期限をfallbackに置く**） |

Q5はレビュー指摘で初稿の事実誤認が判明したあとに追加した質問である。

Q2の回答には「補足：録音上限は〜分」が付いていたが、値が未記入だった。録音の上限は
TASK-002 §25-8で**30分**と確定しているため、その値をそのまま使った（§25-6）。

質問せずに既定で採用した事項は§25-5・§25-7にある。再試行の粒度と音声形式は、いずれも
既に決まっている制約から一意に決まるため質問していない。

## 24. 机上シナリオ検証（採用内容）

TASK-003の「必要な検証」に対応する。**外部AIの応答前後の切断、応答喪失、保存失敗、同一操作の
再実行**について、結果の判定と再開点を追跡した。残存データの追跡はTASK-002 Plan §24が正本で、
ここは**生成の再開点と冪等性**を見る。

| # | シナリオ | 結果の判定 | 再開点 |
| --- | --- | --- | --- |
| 1 | 正常終了 | Dotが保存され、記録が`succeeded_cleanup_pending`になり、cleanupのあとに記録を削除する | なし |
| 2 | uploadの途中で切れる | **`uploading`の記録は存在し得る**（record-firstのため）。objectは未完成 | **watchdogが拾う**（§19）。`HeadObject`でobjectが無ければ`upload_failed`、完成していればenqueueへ進める。端末のBlobが残っていれば再送できるが、**旧leaseを失効させて新しい実行権を取った要求だけ**に許す |
| 30 | **`uploading`のまま放置される**（requestやcontainerが落ちる） | Jobをenqueueしていないので、Solid QueueもTranscribeも何も知らない | **§19のwatchdogが唯一の回収手段**。これが無いとpollingが永遠に`uploading`を返し、退会が完了できない（3巡目のレビュー指摘2） |
| 3 | 受理後、Jobがenqueueされる前に落ちる | 記録は`accepted`のまま。objectは残る | 再試行で同じobjectからやり直す。期限を過ぎたら削除処理へ |
| 4 | 文字起こしが失敗 | 記録を`failed`（再試行可）にする。**元音声は既に委託先へ渡っている** | 同じobjectから文字起こしをやり直す |
| 5 | **外部AIへ送る前に切断** | 生成は始まっていない。記録は`failed`。**文字起こし結果は自前S3にある** | **生成からやり直す**（§25-5。Transcribeを再実行しない） |
| 6 | **外部AIの応答後に切断（応答喪失）** | 生成は消費済みだがDotは無い。記録は`failed` | **生成からやり直す。外部AIの消費は繰り返される**（§13） |
| 7 | worker停止・deployでJobが落ちる | **状態ごとに判定する**（§19）。Transcribe待ちなら`GetTranscriptionJob`で生きているか見る。worker消失ならSolid Queueの回収結果を拾う | 生きているjobを二重に開始しない。**「24時間を過ぎたらfailed」をstale検知の代わりに使わない** |
| 8 | 保存（RDS）が失敗 | Dotは無い。objectは残る（TASK-002の「成功」の定義） | 文字起こし結果が残っていれば生成から、無ければ文字起こしからやり直す |
| 9 | **保存は成功したが応答が届かない** | Dotは存在する。記録は`succeeded_cleanup_pending`か削除済み | **再試行しない**。pollingは**まずdotsを見る**ので、記録が残っていても成功として返す（§9） |
| 22 | **Dotの保存直後にworkerが止まる** | Dotと記録が同時に存在する。cleanupは未了 | **pollingはDotを優先するので成功として返せる**（記録が残っていても「処理中」にしない）。残った記録は**cleanup専用**で、生成の再試行には使わない（2巡目のレビュー指摘10） |
| 23 | 音声を削除したあと、記録を削除する前に止まる | 記録が`succeeded_cleanup_pending`で残る | **状態を保ったまま新しい実行権を取って再実行する**（自己遷移）。既に消えているものは冪等に成功として扱う |
| 32 | **cleanupが繰り返し失敗する** | `succeeded_cleanup_pending`または`cleanup_pending`に留まる | **終端にしない**。cleanupの認可条件（§20の5契機）で何度でも入れる。期限到来・退会・Dotの完全削除による場合は`active`も期限内も要求しない（4巡目のレビュー指摘1）。残存を検知して運用で拾う |
| 33 | **退会・期限到来でcleanupが入口を通る** | 利用者は`active`でなく、期限も過ぎている | **通る**。cleanupの認可条件はretryと別で（§20の5契機の表）、`active`と期限内を要求しない。ここを共通にすると`cleanup_pending`から抜け出せない |
| 35 | **`succeeded_cleanup_pending`のままDotの完全削除・退会を受理する** | Dotは既に消える／消えた。記録はcleanup待ち | **T22で`cancel_requested`へ移す（T17の自己遷移より優先）**。進行中のcleanupの実行があっても、最終的にcancel側の後片付けへ収束させる。ACKを待たずに文字起こし結果とjobも削除へ回す。pollingは以後、全文を返さない（§27の「返さない条件」） |
| 34 | **`upload_failed`から再uploadする** | 古い実行権が失効している | 新しい実行権を発行して **`uploading`へ戻す**。旧leaseで始まったPUTが後から完成し得るため、**keyを試行番号ごとに分け、記録が持つ有効なkey以外を残存として回収する** |
| 10 | 同じ冪等性keyで再送 | `dots`のunique制約で衝突する | **2件目のDotを作らず、既存のDotを返す** |
| 11 | cleanup完了後にDotを完全削除し、同じ処理IDで再送する | `dots`にもcleanup済みの記録にも無いため、**新しい録音として受理される** | これは穴ではない。**cleanupが終わるまで記録が残る**（§20）ので、消し残した音声がある間は記録も残り、unique制約が効く。**旧objectが残ったまま新しいDotが作られる経路は無い**（3巡目のレビュー指摘6で訂正。2巡目の記述は「成功時に記録を即削除する」前提だった） |
| 31 | **ACKの処理後にresponseが届かない／ACKが重複・並行して届く／fallbackのcleanup後に遅れて届く** | 対象が既に無い場合がある | **所有者を確認したうえで、冪等に成功として扱う**。object・job・記録のいずれが無くても失敗にしない。ACK自体は保存しない（§27） |
| 12 | 文字起こしが空（無音・極端に短い） | 生成へ進まず失敗として扱う | 録り直しを案内する（§17） |
| 13 | 生成結果がschema検証に通らない | 生成の失敗として扱い、保存しない | 同じobjectからやり直す |
| 14 | 退会の直前に始まった処理が、退会の削除処理のあとに完了する | Jobは最終書き込みで**利用者の行を`FOR UPDATE`でlockし**、世代番号の確認とinsertを同一transactionで行う。ずれていれば書き込まない | 再開しない。退会側が残存を回収してから完了を表示する（§20） |
| 15 | 他人の処理IDを指定して照会・再試行する | 記録の所有者と`current_user`が一致しないため拒否する | なし。**推測困難な処理IDを権限の根拠にしない** |
| 16 | 再試行の期限を過ぎてから再試行する | 受け付けない。**objectと記録は削除処理の対象になるが、削除に失敗したり遅延すれば残存し得る**（`privacy.md §5`が保証するのは削除処理の開始条件まで） | 録り直しを案内する |
| 17 | 成功後のS3削除が失敗する | Dotは保存済み。**音声objectが残る** | 削除済みと表示せず再実行する。残存を検知できるようにする（TASK-013/015） |
| 18 | 文字起こし結果の削除が失敗する | 発話内容の全文が自前S3に残る | 削除済みと表示せず再実行する。残存を検知できるようにする。**objectとTranscribeのjobの両方が対象**（§27） |
| 19 | 退会の直前に受理されたuploadが、退会の削除処理のあとにS3への保存を終える | 記録は利用者の行のlockの中で先に作られる（record-first）。**退会は`uploading`の記録を即削除せずcancel対象として残す** | uploaderが世代のずれを見てobjectを削除し、cleanup完了を記録する。**記録が消えていても手元のkeyで消す**。進行中の処理が0になるまで退会を完了としない（§20） |
| 20 | 成功したあと、clientがACKを送らないまま期限が過ぎる | Dotは保存済み。**文字起こし結果は削除処理の対象になる** | 全文は取り戻せない。Dotは残るので`sentence`と`summary`は読める |
| 21 | 期限を過ぎた後にpollingが来る | `dots`に処理IDがある | Dotを返す。**objectが残っていても全文は返さない。**「取得できなかった」ではなく「保持期間を過ぎた」と示す（§27） |
| 24 | **`StartTranscriptionJob`のresponseを失う** | AWS側ではjobが受理されている可能性がある | **同じ名前で新しいjobを作らない**。job名は`<処理ID>-<文字起こし試行番号>`から決まるので（§20の命名表）、試行番号を変えない限り同じ名前で`GetTranscriptionJob`へ合流できる |
| 25 | worker停止中にTranscribeが完了する | 自前S3に全文が書き出されている。記録は`transcribing`のまま | reconcileで`GetTranscriptionJob`を見て、完了していれば生成から進む。**Transcribeを再実行しない** |
| 26 | 期限到来・退会の時点でTranscribeのjobが非終端 | `DeleteTranscriptionJob`が`BadRequestException`になり得る | **削除要求だけで終わらせない**。終端になるまでreconcileし、終端後にobjectとjobを消してから記録を消す。**それまで退会を完了としない**（§20） |
| 27 | 同じ処理IDで別の音声を送る | 既存の記録がある | **bodyを受け取らず既存の状態を返す**。object keyはserverが処理IDと試行番号から決めるので上書きされない。再uploadは`uploading`／`upload_failed`で完成objectが無い場合だけ（§20） |
| 28 | 別の利用者が同じ処理IDを送る | **処理IDはserver発行になったので利用者が値を選べない**（2026-09-29にTASK-004の録音attemptへ統合）。他人の処理IDを推測して送っても、記録の所有者と`current_user`が一致せず拒否される | **処理IDがAWSアカウント内で一意であることが前提**。満たせない形なら、server発行の別IDを足してAWSの名前をそこから導く（§20）。client発行のUUIDのままだと`ConflictException`や他人のobjectの上書きが起き得た（2巡目のレビュー指摘13） |
| 39 | **ACKを送ったあと、cleanupが終わる前にpollingが来る** | 文字起こし結果のobjectはまだ残っている可能性がある | **全文を返さない**（§27の「返さない条件」にACK受領を含める）。**物理削除の完了に依存させない**。端末は`sessionStorage`から読む |
| 40 | **異なる利用者の録音attemptが同じAWSの名前を作る** | S3のkeyや`TranscriptionJobName`が衝突し、`ConflictException`や他人のobjectの上書きが起き得る | **処理IDがAWSアカウント内で一意であることが前提**（§20）。`TranscriptionJobName`の文字種と長さ（`^[0-9a-zA-Z._-]+`、最大200文字）も満たす。満たせない形式なら、server発行の別IDを足してAWSの名前をそこから導く |
| 36 | **同じ録音attemptで2回uploadする** | 処理の記録の`(user_id, 処理ID)`のunique制約に掛かる | **新しい処理を作らず、既存の状態を返す**（TASK-004 §18-3が許した2案のうち「同じ処理を返す」を採用）。署名済みの値を端末に置く方式でも、この制約で一回性が成立する |
| 37 | **録音attemptの期限が切れてから再uploadする** | attemptの検証で弾かれる | 受け付けず録り直しを案内する。**受理後の再試行とは別の時計**で、受理後は処理の記録で認可するため期限切れの影響を受けない |
| 38 | **再試行やJob再実行を経てDotが保存される** | `started_at`は受理時の値のまま | **書き換えない**。再試行で新しい時刻に置き換えると、TASK-004の「話した日から動かない」が崩れる |
| 29 | 同じ処理IDのPOSTが並行して届く | 処理の記録の`(user_id, 処理ID)`のunique制約で衝突する | **2件目の記録を作らず、Jobも二重にenqueueしない**。既存の記録の状態を返す（2巡目のレビュー指摘4） |

**週次・月次のAI振り返りは混入していない。**§17の入力は1件の録音の文字起こしだけで、過去のDotを
渡さない。§5の対象外にも明記した。

## 25. 人間の判断と採用内容（2026-09-29）

§23の質問に対する回答と、その理由・帰結。

1. **provider = §18案A（委託先をAWSに統一）**。Amazon Transcribe（東京）で文字起こしし、
   Amazon BedrockのClaudeで生成する。決め手はモデル性能ではなく**完了条件7の重さ**で、9項目の
   確認が1社分で済み、鍵の項目（項目8）は長期固定キーの管理が不要になる（項目自体は消えない）。
   **ただし採用後の調査で、案Aの成立には§18の6つの必須条件（Transcribeのopt-out適用、
   モデルの推論経路の選定、使う構成の保存先と閲覧元の確認（data retention modeを含む）、録音形式の疎通、文字起こし結果を
   自前S3へ出すこと、`aws-sdk-bedrockruntime`で呼べる経路から選ぶこと）が要ることが分かった。**
   判断そのものは変えないが、これらを満たさないまま公開しない。
   **2026-10-03に案Aを続ける理由が変わった**。所在地方針を「発話内容の保存と閲覧は日本国内に限る。推論のための一時的な処理は日本国外を
   許容する」へ変更したため、案Cは所在地では落ちない。**続ける理由は3つ。委託先を増やさないこと（9項目の
   確認とDPA・`privacy.md §5-1`の行の差し替えが発生しない）、25MBの上限が無いこと、ZDRのような外部裁量に
   依存しないことである。案Cは不採用ではなく保留**（§18「2026-10-03の再確認」）。
2. **実行方式 = §19案A**。Solid Queueで非同期にし、workerは当面ECSの同一タスク内でPumaと並走させ、
   clientはpollingで結果を取得する。同期/非同期はTASK-002の30分上限で既に決まっていた。
3. **冪等性と処理の記録 = §20案A**。冪等性keyと処理IDと録音attemptの識別子を同一にして`dots`の
   列に置く。**2026-09-29にTASK-004の`started_at`採用へ合わせ、client発行のUUIDから
   server発行の録音attemptへ変えた**。これによりprovider IDの層を廃止した。
   **処理の記録は、音声・文字起こし全文・Transcribeのjobのcleanupが終わった時点で削除する。**
   TASK-002が残した相互確認事項への回答であり、`privacy.md §5-1`の「未確定」を解消する。
   - **初稿は「成功した時点で削除する」だった**。2巡目で`succeeded_cleanup_pending`を入れ、
     3巡目の指摘1で**判断そのものが変わっていると分かった**ため、削除の契機を書き換えた。
     成功後も記録が残る副作用（誰がいつ録音したかを示す個人データ）を受け入れる代わりに、
     **消し残しを回収できる**状態を選んだ。
4. **固有名詞の低減 = §21案A（行わない）**。Bedrockへ渡すテキストと生成結果への伝播は減らせる
   ので**効果はゼロではない**が、その限定的な効果より誤検出・文脈破壊・実装費を重く見た。
   低減したとは表示しない（初稿の「境界を1つも減らせない」は撤回済み。§21）。
5. **再試行は、文字起こし結果が残っていれば生成からやり直す。残っていなければ文字起こしから
   やり直す**。journaling.md §5の「文字起こしまで成功した後の失敗で、録り直さずにテキストから
   再生成できるようにするか」への回答である。どちらでも録り直しにはならない。
   - **初稿は「必ず文字起こしからやり直す」としていた**。理由は「全文を保存しないので制約から
     一意に決まる」だったが、**§27で全文を自前のS3へ置くと決めた時点でこの根拠は失われた**
     （2巡目のレビュー指摘6）。全文が手元にあるのに毎回Transcribeを再実行するのは、
     **費用（§22の支配項目）も失敗点も増やすだけである。**
   - 生成から再開できるのは、文字起こし結果がまだ削除されていない間（ACK前、または期限内）。
     ACKを受けて消した後に生成が失敗することは無い（ACKは成功後に来るため）。
   - 外部AIの消費は、生成から再開する場合でも繰り返される。二重消費を防がないことは変わらない。
6. **録音の上限は30分のまま（質問への補足が未記入だったため、TASK-002の確定値を使う）。**
   Q2の回答に「補足：録音上限は〜分」とあったが値が入っていなかった。上限はTASK-002 §25-8で
   30分と確定しており、**変更するならTASK-002の再判断になる**ため、ここでは変えていない。
7. **音声形式は`audio/webm;codecs=opus`と`audio/mp4`をserverで受容し、文字起こしの対応形式を
   確認する（既定として採用。質問していない）**。TASK-002 Plan §13がSafariだけ失敗するリスクとして
   挙げた項目で、確認はTASK-009の疎通で行う。
8. **文字起こし結果の置き場 = §27案A（自前のS3へ置く）**。レビュー指摘で「workerのmemoryのみ」が
   事実として誤りと分かったため、追加で判断した。音声と同じbucketの別prefixに同じ条件で置く。
   **clientが受け取ったら削除ACKを送り、serverがその時点で削除処理を始める**。削除の契機は
   **ACKの受領・受理から24時間の経過・そのDotの完全削除・退会の4つ**（`privacy.md §5-1`が正本。
   §20の認可表に契機ごとの削除範囲がある）。初稿は「取得の有無をserverが持つと成功した処理の記録を
   残すことになる」として取得後削除を採らなかったが、**この理由は成立していなかった**
   （2巡目のレビュー指摘3。成功後も`dots`に処理IDが残るため記録なしで認可できる）。
   **それでもTASK-002の前提に対しては後退である**ことを§27に記録した。

### 2026-10-03の人間の判断（所在地方針の変更）

**判断の主体は人間である**。providerの比較を一次資料で確認し直した結果（§18「2026-10-03の再確認」）を
10件の選択式の質問にまとめて提示し、人間が回答した。**所在地方針については「原則を外す。ただし
まずAWS内でGlobalを許すところまでとし、委託先の変更は別判断にする」を選んだ。**

| 項目 | 判断 |
| --- | --- |
| 東京原則の採否 | **外す**。`architecture.md`「データ所在地と費用」を「発話内容の保存と閲覧は日本国内に限る。推論のための一時的な処理は日本国外を許容する」へ変更する |
| 範囲 | **AWS内に限る**。Bedrockの推論経路の制約を外すだけで、**委託先そのものの変更は別の判断として残す** |
| 見直しの範囲 | 判断1（provider）だけを再検討する。判断5（文字起こしの置き場）は変えない |
| 案Cの採否 | 所在地では落ちなくなったため、**不採用ではなく保留**とする（再検討条件は`product.md §5`） |
| 比較対象 | AWSとOpenAIに絞り、**Google・Azureを候補から外した理由を明記する**（案D・案E） |
| 「保存は東京」の射程（2026-10-04に追加で判断） | **原則の表現を「保存は日本国内」へ改める**。自分たちのRDS・S3は東京のまま。Geo: JPの宛先に大阪が含まれるため、東京に限ると国内経路でも方針違反になる構成が作れてしまう。保持ありモデルを`bedrock-mantle` In-Regionだけに限る案、retention modeを常に`none`に限る案は採らず、**国内に収まっていればよいこととした** |

**この変更はproviderの都合で方針を曲げたものではない**。必須条件2が「モデルの都合で所在地方針を黙って
曲げない（曲げるならarchitecture.mdを先に直す）」としているとおり、**正本の側を先に直す手順で行った。**
なお、**「方針を変えたこと」と「越境移転の規律の確認が済んだこと」は別である**（§5、TASK-017）。

## 26. 委託先に確認する9項目（TASK-025。**未確認**）

TASK-003の完了条件7が求める9項目について、**確認先と確認方法を定めた。項目別の状態は下表のとおりで、
一次資料で確認できた項目もあるが、9項目全体の確認・AWSアカウントの設定・日本の個人情報保護法上の
評価は完了していない**。確認していない項目を「問題ない」と扱わない。確認が済むまで公開しない。

委託先は**Amazon Web Services 1社**（Amazon Transcribe と Amazon Bedrock）。

2026-10-08に、この確認をTASK-003の完了条件7から[TASK-025](../tasks/TASK-025-vendor-verification.md)へ切り出した
（経緯は[切り出しのPlan](2026-10-08-task-025-vendor-verification-split.md)）。確認の記録先は引き続き本節である。

| # | 確認する項目 | 確認先 | 現状 |
| --- | --- | --- | --- |
| 1 | 入力を学習・モデル改善に使わないこと | Transcribe: AWS OrganizationsのAI services opt-out policyを適用し、effective policyを照会。Bedrock: モデルの data retention mode | **要対応。**§18のとおり、Transcribeは**既定ではopt-inのまま**。設定しない限り改善に使われ得る |
| 2 | 保持期間と削除方法 | Bedrockの data retention mode（`none`が選べるか）と**保持データの所在リージョン**、Transcribeのjob記録の保持 | Bedrockは**未確認**。既定でゼロデータ保持と説明されるが、**モデルにより保持必須のものがある**。保持ありを選ぶなら**所在リージョンの確認が必須**（§18必須条件3）。**Transcribeのjob記録は各リージョンで90日保持（調整不可）** で、[endpointとquota](https://docs.aws.amazon.com/general/latest/gr/transcribe.html)に記載があり**確認済み**。`privacy.md §5-1`は`DeleteTranscriptionJob`で消す設計なので矛盾しない |
| 3 | 処理・保存のリージョン。越境する場合の手続き | Bedrockの In-Region / Geo / Global の別。Transcribeのopt-out前の保存先 | **方針は2026-10-03に決定済み**（`architecture.md`「発話内容の保存と閲覧は日本国内に限る。推論のための一時的な処理は日本国外を許容する」）。**手続きは未確認。委託であっても「外国にある第三者への提供」には別の規律がかかる整理があり、同意の取得または移転先の体制整備と本人への情報提供が必要になり得る**（TASK-017）。**確認が済むまでは国内に収まる経路で運用する**（範囲の定義は`architecture.md`「データ所在地と費用」）。opt-outしない限りTranscribeも利用リージョン外へ保存され得る |
| 4 | 人によるレビューの有無と条件、**その実施地とアクセス経路** | Bedrockの `aws_review` モードの要否、abuse detectionの条件、**レビューをどこから行うか**、**prompt cache等の滞留先** | 未確認。**モデルによってはAWSによる人的レビューが必須**になり得る。**`architecture.md`「データ所在地と費用」が求める「誰がどこから閲覧し得るか」の確認はここで行う**（実施地が国外なら、保存が国内でも要求に反する）。cacheの滞留先も同じ理由で含める |
| 5 | サブプロセッサの開示 | AWSのサブプロセッサ一覧 | 未確認 |
| 6 | 委託契約（DPA相当）を結べること | AWS DPA（Service Termsへ組み込み済み・自動適用） | **確認済み**。別途の締結を要しない。ただし**日本の個人情報保護法上の委託先としての評価は自分たちで行う** |
| 7 | 事故発生時の通知義務と期限 | AWS DPAの該当条項 | 未確認。TASK-017の漏えい対応と接続する |
| 8 | 鍵の最小権限・ローテーション・漏えい時の失効 | ECS task roleのIAM policy、credential取得経路 | **一部を設計で解決。長期固定のAPIキーは持たない**が、**ECSはSDKへ一時credentialを供給する**ため項目は残る。確認対象は(a)roleの最小権限（対象bucketと対象モデルだけ）、(b)credential取得経路の保護、(c)侵害時のrole/policy無効化とtask停止の手順。policyの内容はTASK-009 |
| 9 | 第三者認証の有無 | AWS Artifact（SOC 1/2/3、ISO 27001/27017/27018） | 未確認。**これだけを根拠にしない** |

追加の確認対象（レビュー指摘で判明。9項目の外だが同じ確認の中で扱う）:

| 対象 | 確認すること | 現状 |
| --- | --- | --- |
| Transcribeの文字起こし結果 | `OutputBucketName`が実際に効いて自前bucketへ出ること、service-managed bucketへ出ていないこと | **§27で自前bucketへ置くと決めた**。設定が効いていることの確認はTASK-009/015 |
| Transcribeのjob記録 | 出力objectと別に残るjob自体の記録の保持期間と、`DeleteTranscriptionJob`で消える範囲 | **保持期間は確認済み**（各リージョンで90日・調整不可。上記の項目2と同じ出典）。**残る未確認は`DeleteTranscriptionJob`で実際に消える範囲。objectを消してもjobが残る**ため、削除の対象に含めたうえで実際に消えることを確認する。**実際に消える範囲の確認はTASK-009が行う**（2026-10-08に担当を決めた。jobのcleanupを完了条件に持つため） |

### 確認の担当と時期

- **担当は人間**。項目1〜5・7・9はAWSアカウントの設定と契約資料の確認で、TASK-003の範囲外である（2026-10-08からTASK-025が担う。TASK-025は項目6と項目8の(b)(c)も担い、項目8の(a)は下記のとおりTASK-009が担う）。
- **ただし項目2・4のうち、使う構成（経路・モデル・設定）の保存先と閲覧元の確認はTASK-009が行う**
  （2026-10-05に追記。`architecture.md`「データ所在地と費用」が担当をTASK-009と定め、
  TASK-009の完了条件にも入っている）。**契約資料・アカウント設定の側の確認は人間のままである。**
  同じ項目番号を2つの主体で分担するので、どちらの確認かを記録に書き分ける。
- 2026-10-08に、項目1のうちBedrockのmodel idごとの違いと、項目8の(a)（IAM policyの内容）もTASK-009の担当にした。
  TASK-025のDoneに含めると、TASK-025に依存するTASK-009と互いを待つためである（分け方は
  [TASK-025](../tasks/TASK-025-vendor-verification.md)）。
- **時期は公開前**。項目1（Transcribeのopt-out）と項目3（リージョン）は、**実際に音声を外部へ送る
  変更（TASK-009）の前**に済ませる。設定していない状態で音声を送ると、後から
  opt-outしても「送った時点では改善に使われ得た」という事実は消えない
  （過去分は削除されるが、それは削除であって未送信ではない）。
- 確認できた内容は本節へ追記し、`privacy.md §5-1`の外部provider行から参照させる。

## 27. 判断5: 文字起こし結果の置き場（比較。採用は§25-8）

### 何が問題だったか

初稿の§9は「文字起こしテキストはworkerのmemoryのみ。DBにもS3にも書かない」と書いていたが、
**これは事実として誤りだった**。Amazon Transcribeのバッチは、文字起こし結果を必ずS3へ書き出す。

> "If you do not specify `OutputBucketName`, your transcript is placed in a service-managed
> Amazon S3 bucket and you are provided with a URI to access your transcript."
> — [StartTranscriptionJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html)

つまり**発話内容の全文が、Railsの外のストレージに存在する時間が必ず生まれる。**
`privacy.md §5-1`の「文字起こし全文（server）」の行は「処理中のmemoryだけを通過する。DBにも
S3にも書かない」となっており、**現状の記述は実態と合わない。**

あわせて、非同期にしたことで**別の穴**も開いた。TASK-002は「responseで文字起こし全文を端末へ返し、
`sessionStorage`にタブを閉じるまで置く」と決めているが、生成が別requestのJobで進むため、
**pollingのresponseを返す時点でworkerのmemoryはもう無い**。全文を返すには、どこかから読み直す
必要がある。この2つは同じ判断で決まる。

### 選択肢

| | 内容 | トレードオフ |
| --- | --- | --- |
| **A（採用）** | **`OutputBucketName`に自分たちのS3を指定する**。Jobが読み出し、pollingのresponseで全文を返す | 置き場を自分たちで制御でき、削除・暗号化・bucket設定を音声の一時objectと同じ条件で掛けられる。TASK-002の「全文を端末へ返す」も守れる。**ただし`privacy.md §5-1`に新しいデータ行が1つ増える**（文字起こし全文・S3一時object） |
| B | **service-managed bucketのまま**、URIで取得してすぐ`DeleteTranscriptionJob`する | 自前bucketを増やさない。**ただし置き場がAWS管理で、保持と削除の制御が弱い。**「いつ消えるか」を利用者へ説明しにくく、削除失敗の検知もしづらい |
| C | **Transcribeのstreamingを使う**（バッチをやめる） | 結果がストリームで返るため、S3への書き出しが無く「memoryのみ」を保てる。**ただし単価が$0.006/分→$0.010/分に上がり**（約1.7倍。§22の支配項目なので全体費用が約4割増える）、録音済みファイルを実時間より速く流せるかの検証が要る |
| D | **全文の端末返却をMVPから外す**。pollingではDotだけを返す | 返す必要が無くなるので置き場の要件が軽くなる。**ただしTASK-002が採用した「`/reflection`で`summary`と文字起こしを表示する」を撤回することになる**（TASK-002の再判断） |

### 採用（案A。2026-09-29に人間が判断）

削除の制御を自分たちで持てること、TASK-002が採用済みの「全文を端末へ返す」を撤回せずに済むことを
理由に案Aを採った。案Cは支配的な費用項目が約1.7倍になり、案Bは削除の完了を自分で確かめられない
（`privacy.md §2原則5`が求める「削除が実体を消すことを設定で確認してから消えると説明する」を
満たしにくい）。

### 採用の条件

- **音声の一時objectと同じbucketに、別のprefixで置く**。bucketを増やさない。条件は音声と同じで、
  非公開（public access block）・保存時に暗号化・**versioningを有効にしない**・keyは推測不能な
  UUIDにする。versioningの前提はTASK-002 Plan §18案A2と同じで、有効だと削除がdelete markerを
  付けるだけになる。
- **`OutputBucketName`（と`OutputKey`）を必ず指定する**。指定を省くとservice-managed bucketへ
  置かれ、保持と削除を自分たちで制御できない。
- **読み出したあと、Transcribeのjobも削除する（`DeleteTranscriptionJob`）**。objectを消しても
  jobの記録が残るため、object・job・処理の記録の3つを削除の対象にする。
- **clientが受け取ったら即座に消す。期限はその取りこぼしのためのfallbackにする。**
  1. pollingのresponseで全文を返す。
  2. clientが`sessionStorage`へ保存したら、**削除ACKをserverへ送る。**
     （以下、番号は続く）
  3. serverは`current_user.dots`と処理IDで認可する。**そのうえで処理の記録を引くときも、
     必ず`(user_id, 処理ID)`で引く。IDの一意性にかかわらず、ID単独では認可せず所有者でscopeする**
     （3巡目のレビュー指摘4。指摘を受けた時点の理由は「処理IDは利用者単位でしか一意でない」
     だったが、server発行へ変えた後もこの規則は変えない。一意性を認可の根拠にしないため）。
  4. 記録が持つS3 keyとTranscribeのjob名について、**その時点で削除処理を始める**（完了時刻は約束しない。失敗したら§20の自己遷移で再実行する）。
  5. ACKにも通常のCookie認証とCSRFを適用する。
  4. ACKが来ない場合にだけ、**受理から24時間**で削除処理を始める。
  - **ACK自体を保存する必要はない**。削除を冪等にすれば、ACKの再送も重複も扱える。
  - ACKのAPIの形はTASK-005で決める。**「取得後に消すかどうか」はこのタスクで確定した。**
  - 2026-09-29の初稿では「取得したかどうかをserverが持つには成功した処理の記録を残すことになり、
    §20案Aと衝突する」として取得後削除を採らなかったが、**この理由は成立していなかった**
    （2巡目のレビュー指摘3）。**成功後も`dots`に処理IDが残るため、記録を残さずに認可できる。**
    正常に取得できた場合の全文の露出は、24時間から数秒〜数分に縮む。
- 削除の順序と失敗時の扱いはTASK-002のとおり。**先にS3、成功してからRDS**。削除に失敗したら
  削除要求全体を失敗として扱い、削除済みと表示せず再実行し、**残存を検知できるようにする。**
- Dotの個別削除・退会の削除連鎖に含める。範囲の分け方は音声と同じで、個別削除は**そのDotを作った
  処理のobjectだけ**、退会は**本人の全objectと記録**。

### bucketを共用するための権限の分け方（2巡目のレビュー指摘8）

同じbucketを使う以上、**prefixごとに権限を分けないと、Transcribe用の権限が音声側へ広がる。**
次を採用の条件に含める。

- **Transcribeへ渡すrole**: 文字起こしのprefixへの`PutObject`だけ。音声prefixへの書き込み・
  削除の権限を与えない（読み取りは入力に要る範囲に限る）。
- **RailsのECS task role**: 音声prefixのread/delete、文字起こしprefixのread/delete。
  必要な範囲だけにする。
- `ListBucket`が要る場合は`s3:prefix`条件を付け、bucket全体を列挙させない。
- KMSを使う場合は、key policyも**同じ主体・同じ用途**に限定する。

### 採用の帰結（正直に書く）

**ACKが届けば全文の露出は数秒〜数分で終わる。届かなかった場合に、受理から24時間で削除処理を
始める**。それでも、TASK-002が「文字起こし全文は処理中のmemoryだけを通過する」という前提で
保持・削除を決めていたことに対しては、**データを減らす方向に対する後退である。**
得るものは「録音の直後に、話した内容を端末で読み返せる」という体験（TASK-002 §25-4の目的）である。

- `privacy.md §5-1`へ**新しいデータ行を1つ追加する**。保持しないデータとして扱わない。
- **削除の完了は約束しない**。24時間は削除処理を始める時刻であって、消え終わる時刻ではない。
  障害時には残り得る。`privacy.md §5-2`の約束できる／できないの分け方をそのまま使う。
- **endpointの振る舞いを物理的な削除の結果と切り離す。**「objectが消えたから返せない」ではなく、
  **仕様として返さない条件**を決める。cleanupが終わるまでの間にpollingが来ても、
  下表に当たれば全文を返さない（6巡目のレビュー指摘3。従来は期限しか書いていなかった）。

| 返さない条件 | 理由 |
| --- | --- |
| **端末から削除ACKを受け取った** | 端末が受け取り終えたので、serverに置く目的が消えた。**削除処理の完了を待たずに、受理した時点から返さない**（ACK後に再pollingされても、消し残しがあれば返せてしまうため） |
| 受理から24時間の期限を過ぎている | 保持期間を過ぎたため |
| **そのDotの完全削除を受理した** | 利用者が消すと決めたものを、後片付けの途中に返さない |
| **退会を受理した** | 同上。退会の受理後は結果の確定も取得もしない |

  いずれも**cleanupの完了を待たずに、受理した時点から返さない**。物理削除が終わっていない間に
  返してしまうと、「削除した」と操作した利用者へ削除対象の中身を返すことになる。
- 録音前の案内（TASK-002 Plan §22の7項目）の項目3「音声と文字起こし全文を残さず」は、
  **文字起こし結果を一時的に預かる事実と合わなくなる**。音声と同じ言い方（処理のあいだ預かり、
  やり直せる期限のあとに削除処理を行う）へ揃える。文言の確定はTASK-010。
- 24時間はfallbackの値で、**実測根拠はない**。ACKが届く割合と届かない理由を運用で見て、
  短くできるなら短くする。
