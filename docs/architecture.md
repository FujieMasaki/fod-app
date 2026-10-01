# Architecture

この文書は、Focus on Dotの現在の実装と、将来に向けて決定済み・未決定の事項を区別して
記録する。将来方針は、実装が追加されるまで実装済みとして扱わない。

## 実装済み

- 現在稼働しているFrontendは `apps/web/` のVite + React + TypeScript SPAである。
- TanStack Routerが `apps/web/src/router.tsx` で `/`、`/record`、`/processing`、`/dot`、
  `/reflection` のクライアントルートを管理する。
- `apps/web/src/providers.tsx` がTanStack QueryとSession Providerを提供する。
- Session ProviderはReact stateを画面間で共有し、録音時間と現在のDot sessionを
  `fod.session.v1` というkeyでブラウザの `localStorage` に保存・復元する。
- Dot生成はTanStack Queryのmutationから呼び出す。`VITE_DOT_API_URL` が設定されている場合は
  `dot` endpointへPOSTし、設定されていない場合はローカルmockをZodで検証して返す。
- 録音処理はブラウザのMediaDevices / MediaRecorder APIを利用する。
- Frontendのbuild、test、型検査設定とweb固有dependencyは `apps/web/` が管理する。
- `apps/api/` はRuby on RailsのAPI backendである。現在実装済みなのはRails基盤、
  PostgreSQL接続、RSpec、品質・security検査、CIまでである。
- `apps/api/` の公開APIは将来 `/api/v1` namespaceに追加する。
- repository全体のコマンド、ESLint、Lefthook、命名チェック、CI、開発文書はrootが管理する。
- Claude Codeの共有設定（`.claude/settings.json`のhook・permission、`.claude/skills/`）と、hookが
  呼ぶ`scripts/claude-*.mjs`・`scripts/task-status.mjs`もrootが管理する。

## 決定済み

- Frontendは `apps/web/` に配置する。
- Backendは `apps/api/` にRuby on Railsで配置する。
- FrontendとBackendは同じrepositoryで管理する。
- アプリケーション機能としてのAI処理はBackend側に置く。
- 開発支援AIに関する指示・文書・workflowはroot、`docs/`、`.github/` 側で管理する。
- User、認証、Dot、音声、AI処理は将来の変更で実装する。
- **API契約の正本は手書きのOpenAPI（[`contracts/openapi.yaml`](../contracts/openapi.yaml)）とする**
  （2026-10-01にTASK-005で採用）。契約を実装より先に人が決め、WebとAPIがそれに合わせる。
  コードから契約を生成する方式（バックエンドを正にする）は採らない。
  - 契約自体はRedocly CLIでlintする（書式・参照・examplesとschemaの一致）。
  - Webは契約から型だけを生成してcommitし（openapi-typescript）、responseを検証するZod schemaを
    その型と完全一致させる。通信関数やZodの生成は、endpointが大きく増えるか、Zodと契約のずれによる
    不具合が出たときに再検討する。
  - APIはコードを生成せず手で書き、request specでresponseを契約と照合する（committee-rails）。
  - 契約のexamplesを、WebのZodとAPIの検証器の両方で読み、同じ意味で解釈することを確かめる。
  - 運用・error code・互換性の規則は[`contracts/README.md`](../contracts/README.md)。
- API、Web、契約は同じPRで更新する。同一PRでもWebとAPIのデプロイ時差（古いタブ、deploy中の
  新旧タスクの併存）があり得るため、1回のreleaseでは両方向で壊れない変更だけを入れ、それ以外は
  expand → migrate → contractの段階を踏む（[`contracts/README.md`](../contracts/README.md) §3）。

### 公開MVPの配信と認証（2026-09-24 Devise採用・未実装）

公開基盤はAWS東京（`ap-northeast-1`）の **ALB + ECS Fargate + RDS PostgreSQL** とする。
初期はECS 1タスク・RDS Single-AZ。Reactのbuild成果物をRails releaseへ同梱し、同一HTTPS
originから配信する。CloudFrontは初期導入せず、ECS複数タスク・RDS Multi-AZとともに負荷・
障害状況・費用を見て追加する。ALB自体の複数AZ配置と、アプリ/DBの冗長化は区別する。

```text
Browser
  └─ 同一HTTPS origin → ALB東京（ACMでHTTPS終端）
       → ECS Fargate東京：Rails + React build成果物（定常1タスク）
          ├─ React静的asset / SPA画面
          ├─ Devise：メール＋パスワード / 確認メール / パスワード再設定
          ├─ OmniAuth：Googleへredirect → Google callbackで認証結果を検証
          ├─ Rails CookieStore / CSRF / current_userのDot所有者認可
          ├─ 非公開RDS PostgreSQL東京（Single-AZ）
          │    └─ User・password hash・確認/再設定関連情報・Google対応・Dot
          └─ 確認/再設定メール配送（SES東京を候補、設定は未実施）

認証成功 → 暗号化Cookie sessionをBrowserへ（HttpOnly / Secure / SameSite=Lax）
通常API → Cookie検証・User取得 → 本人のDot scope → DB
将来の音声・文字起こし・AI → 東京を基本配置（経路と保持はTASK-002で採用、providerはTASK-003）
```

- Rails + Deviseがメールアドレス＋パスワード、Confirmableの確認メール、Recoverableの
  パスワード再設定を担当する。GoogleはOmniAuthで連携する。確認前のメールUserにDot操作を
  許可しない。確認/再設定の期限は下記「認証詳細」、Googleの確認情報の扱いはTASK-006で決める。
- 内部User UUIDを所有権の正本とし、Googleは検証済みprovider/uidから一意に対応付ける。
  email一致だけでアカウントを統合しない。衝突時は重複登録せず下記「認証詳細」のとおり案内し、明示的連携は将来対応。
  Google専用Userにpassword resetを通じて無条件に別のログイン手段を追加しない。
- 通常認証はRails標準の**CookieStore**を使う。認証状態は暗号化・改ざん検知されたCookieに
  必要最小限だけ保持し、Rails/Devise/WardenがrequestごとにUserを取得・有効性を確認する。
  通常認証用DB sessionテーブルは作らない。CookieにDot本文・password・Google tokenを保存しない。
- Cookieは`HttpOnly; Secure; SameSite=Lax; Path=/`、`Domain`なしを基本とする。認証成功時に
  sessionを更新し、変更操作はRailsのCSRF tokenとOriginを検証する。同一originのWeb/API間に
  CORS許可は不要。API-onlyへのCookie/session/CSRF・Deviseの組込みは未実装。
- Google認証開始はCSRF保護したPOSTを基本とし、OmniAuth/strategyでstateと認証応答を検証する。
  Google callbackは必要だが、旧CognitoのOIDC callback/token検証を組み込む設計ではない。
  API/認証responseはno-store、SPA fallbackは画面GET/HEADのみ。Google秘密情報をWebへ渡さない。
- logoutはCSRF保護した操作でsign_out/session resetとブラウザCookieの消去を行う。
  **CookieStoreではコピー済みCookieの即時失効をlogoutだけでは保証しない。** 端末ごとの失効・
  全端末logout用DB sessionは将来要件。期限・再認証は下記「認証詳細」のとおり。
  password再設定後の既存Cookieの扱いはDeviseのversion/設定で検証し、一括失効済みと推定しない。
- Railsは常に認証済みcurrent_userを基準とする。一覧はcurrent_user.dots、詳細・更新・削除は
  current_user.dots.find相当で統一し、保存時の所有者もserverが決める。clientのuser_idや
  localStorageを本人性の根拠にしない。Userの停止/削除とDB障害時も認可を省略しない。
- MFA、passkey、運営者の手動アカウント復旧はMVP対象外。password復旧はDeviseの再設定メール、
  Google側の復旧はGoogle標準機能へ案内する。メール喪失やGoogle停止を自動統合で迂回しない。
- Cognito、メールOTP、Cognito固有の利用者対応は現行構成から外す。Google停止時の新規Google
  loginと、既存Rails sessionの利用可否を分ける。メール配送失敗は確認/再設定の完了と扱わない。

ネットワークの初期案は、public subnetのFargateに公開IPv4を付け、受信はALBのSecurity Group
からだけ許可し、外向き通信はInternet Gatewayを使う方式。RDSは非公開・TLS接続とし、ECSから
だけ許可する。NAT Gatewayは初期案に含めず、構築時に経路とSecurity Groupを検証する。
定常1タスクでもdeployment時には一時的に新旧タスクが併存し得る。無停止は保証しない。

RDS暗号化、自動backup・保持期限・復元試験、秘密情報管理、障害/容量/費用の監視を公開前に整える。
ECSのローカルdiskを永続データの正本にしない。日記本文・音声・AI入力・Cookie/token・Google
callbackのcode・確認/再設定tokenを通常ログへ出さない。ALB access logもqueryを記録し得るため、
初期案では有効化せず、
ALB metricsと機密を除いたRailsログを使う。保持・削除と復元時の整合は次の
「音声・文字起こしの経路と保持」で採用した。

### 音声・文字起こしの経路と保持（2026-09-28採用、未実装）

[TASK-002 Plan](implementation-plans/2026-09-28-task-002-data-lifecycle.md)で採用した。実装済みの
構成ではない。比較は同Plan §18–§21、データごとの保持・削除は同§17。

```text
Browser（音声は memory のみ。storage へ書かない）
  → POST /api/v1/dots（同一origin・multipart・Cookie + CSRF・最長30分 / 32MB）
       → Rails：認証再確認 → current_user で所有者決定 → content type と size を検証
          → S3東京：一時object（非公開・暗号化・versioning無効・keyはUUID）
             ＋ server側の記録：処理ID・所有者・key・受理時刻・再試行期限・状態
          → Amazon Transcribe（東京）    ← 元音声が第三者へ渡る最初の地点
          → Amazon Bedrock の Claude（Geo:JP または mantle In-Region）
          → RDS：dots（sentence / summary / date / started_at / duration）
          → 成功（＝Dotの保存まで完了）：一時object（音声）の削除処理を始める
             （記録は後片付けが終わってから消す。2026-09-29にTASK-003で確定）
          → 失敗：受理から24時間は再試行可。期限が来たらアプリが削除（lifecycleは保険）
  ← response：Dot と文字起こし全文（音声URLは返さない）
       → Browser：文字起こしは sessionStorage にタブを閉じるまで。logout・User切替で削除
```

- **音声原本を長期保存しない。**処理が終わるまでの一時的な預かりとしてS3東京へ置く。bucketは非公開
  （public access block）で保存時に暗号化し、keyは推測不能なUUIDにする。uploadを受け付ける時点の
  所有者はrequestの`current_user`で決め、clientから渡されたkeyやuser_idを信用しない。
  **presigned URLとCORSは使わない。**
- **bucketのversioningを有効にしない。**versioningが有効だと、`DeleteObject`もlifecycleの
  expirationも現行versionにdelete markerを付けるだけで、音声の実体はnoncurrent versionとして残る。
  **下記の削除に関する記述は、すべてversioningが無効であることを前提にしている。**他の理由で有効に
  する場合は、noncurrent versionのexpiration・期限切れdelete markerの削除・実体が消える削除方法を
  セットで必須とする。設定は構築時に確認し、検証対象に含める（TASK-009/015）。
  replication・backup・object lockも、有効なら別の場所や別の期間で残り得るため同様に確認する。
- **server側に処理ID・所有者・object key・受理時刻・再試行期限・状態の記録を持つ。**別requestでの
  再試行、別containerで動くJob、退会時の削除は初回requestの外で所有者を判断するため、この記録で
  認可する。**推測困難なkeyを所有権の代わりにしない。**記録の置き場と項目はTASK-003/005で確定する。
  この記録自体も個人データとして保持・削除の対象にする。**処理の記録は、音声・文字起こし結果・
  Transcribeのjobの後片付けが終わった時点で削除する**（2026-09-29にTASK-003で確定。Dotの保存
  時点ではない。後片付けに必要な情報を持っているのがこの記録だけのため）。冪等性keyは`dots`の
  行へ引き継ぐため、応答喪失後の結果照会は記録が無くてもDotで答えられる。
- 一時object（音声）は**DotがRDSへ保存されるまで完了した時点**で即削除する（文字起こしや生成が通った時点ではない。保存で落ちたときに再試行できるようにするため）。失敗した場合は**受理から24時間**を再試行の期限とし、
  期限が来たら**アプリが削除する**。削除に失敗したら再実行し、残存を検知できるようにする。
  RDSへは入れない。
- **S3のlifecycleは保険であり、削除時刻の根拠にしない。**日数指定の期限は翌日のUTC 0時へ切り上げ
  られるため、`Days: 1`でもobjectが**削除対象になる**のは作成から約24〜48時間後で、その後の削除も
  非同期に行われる。**削除が完了する時刻に上限はない。**約48時間を新たな保証として扱わない。
  lifecycleだけを根拠に「◯時間で消える」と文書にも画面にも書かない。
- 削除の範囲は、Dot個別削除では**そのDotを作った処理のobjectだけ**、退会では**本人の全objectと記録**。
  個別削除で他の録音の一時objectまで消すと、再試行を待っている録音を巻き込む。
- **退会は、進行中の処理と競合しない条件を満たすまで完了としない。**退会より前に認証を通過した
  uploadが削除処理のあとに完了する経路と、S3を読み出し済みのJobが結果を書き込む経路があるため、
  数えて消すだけでは足りない。退会の受理以降は新規の保存・再試行・結果の確定を止め、あとから
  現れた残存を回収してから完了を表示する。状態遷移と排他方式はTASK-003/005で決める。
- RDSとS3にまたがるため削除は単一transactionで完結しない。**先にS3を消し、成功してからRDSの行と
  記録を消す。**S3の削除に失敗したら削除要求全体を失敗として扱い、削除済みと表示せず再実行する。
- S3を使うのは再試行のためだけではない。最長30分の音声は同期HTTPで処理しきれず非同期になるため、
  requestを受けたcontainerとJobを実行するcontainerが同じとは限らず、deployでも入れ替わる。
  **ECSのローカルdiskを受け渡しに使わない**方針から、リージョン内の置き場が要る。
- browserからS3へ直接uploadする方式（presigned URL）は採らない。Pumaのthreadを占有する点は
  `RAILS_MAX_THREADS`既定3・1プロセス・ECS 1タスクという現構成では実測前に判断できないため、
  実測して問題になった時点で、同じbucketとlifecycleのまま移す。
- **文字起こし全文をRDSへ保存しない**（列を作らない）。保存するのは話した内容の要約`summary`で、
  Dotと同じ行に置く。Dotを削除すれば必ず一緒に消える。AIからの語りかけは生成も保存もしない。
- 削除はDot 1件ごとの削除と退会の両方を備える。**1件ごとの削除はゴミ箱（論理削除）で、受理から7日で
  アプリが削除処理を始める。ゴミ箱を経由しない即時の完全削除も備える。**退会はゴミ箱を経由せず、
  ゴミ箱の中も含めて消す。一部だけ消えた状態で「すべて削除しました」と表示しない
  （2026-09-29に物理削除のみから変更）。**期間と削除の契機は[privacy.md §5](privacy.md)を正本とする。**
- ゴミ箱の中のDotをDay・一覧・詳細から除外する。**除外は明示的なscopeで行い、暗黙の既定scope
  （`default_scope`等）に頼らない。**暗黙の除外は、ゴミ箱の中身が一覧へ漏れる事故と、逆にゴミ箱が
  空に見える事故の両方を起こしやすい。実現方法はTASK-008で確定する。
- **`dots`は`started_at`（定義は[dot-history §2](dot-history.md)。MVPの音声入力では録音開始操作の受理時刻・UTC）を持ち、`date`はそこから算出した
  Asia/Tokyoの暦日と
  する**（2026-09-29にTASK-004で採用。正本は[dot-history.md](dot-history.md) §2）。作成時刻を日付の
  根拠にしない。送信・生成・保存の失敗を24時間以内に再試行しても日付が動かないようにするため。
  `started_at`の定義は[dot-history §2](dot-history.md)を正本とする。**MVPの入力手段は音声だけなので、
  実際には録音開始操作の受理時刻になる。**実際の録音開始操作に対して発行する
  録音attemptの受理時刻であり、認証確認の時刻やclientが計測した値を採用しない。実際に話し始めた
  瞬間との差が残ること（一定の秒数以内とは保証せず、日付境界をまたぐ遅れでは日付がずれ得ること）を
  受け入れる。attemptは本人に紐づき、1件のDot生成にしか使えず、
  やり直しで新しくなり、別Userでは使えず、未送信には期限（発行から2時間）がある。**serverが
  暗号化・署名したtokenを端末のmemoryにだけ置き、serverには保存しない**（2026-10-01にTASK-005で
  決定）。一覧の並びと「最新」の判定にも
  `started_at`を使い、同値のときはDotの識別子で決める。
- **`sentence`と`summary`の更新APIを持つ**（2026-09-29に追加）。`date`・`started_at`・`duration`は
  更新させない。
  **アプリは編集前の値を保存しない**（版も履歴も持たない）。消したかった記述が編集履歴に残るのを
  避けるため。ただし**編集より前に取得したbackupには編集前の本文が残る。**「編集前の値はどこにも
  残らない」とは書かない。
- 削除済みデータはRDS自動backupの保持期間内はbackupに残る。**復元手順に「復元後の削除要求の再適用」を
  含める。**含めないと、消したはずのDotが復元で再出現する。
- **編集についても同じ問題がある。**編集されたDotは削除対象ではないため、復元すると本文が編集前へ
  巻き戻る。復元手順は**編集で取り除いた内容の再公開も防ぐ**。実現方法はTASK-013/015で決めるが、
  どの方法でも編集前の本文をアプリの保存領域へ持たない制約は維持する。
- 音声・文字起こし・Dotの本文をログへ出さない。出すのはuser_id・dot_id・処理段階・結果・所要時間まで。
- 保持期間の既定はログ14日、RDS自動backup 7日、音声の一時objectは再試行期限の24時間。実値は下記
  「未決定」のとおり公開前に確定する。S3の実費は成功時に即削除する運用では月1円未満の見込みで、
  Pricing Calculatorで再確認する。

### 生成の実行方式（2026-09-29採用、未実装）

[TASK-003 Plan](implementation-plans/2026-09-29-task-003-generation-design.md)で採用した。
実装済みの構成ではない。比較は同Plan §18–§21、採用内容は同§25。

```text
POST /api/v1/dots（同期）
  → Rails：認証・所有者・形式・size検証 → S3東京へ一時object
     ＋ 処理の記録（処理ID・所有者・key・冪等性key・受理時刻・再試行期限・状態）
  → Solid Queue へ enqueue → 処理IDと再試行期限を返して request は終わる

Job（非同期。worker は当面 ECS 同一タスク内で Puma と並走）
  → Amazon Transcribe（東京）: S3 の object を入力に文字起こし
  → 文字起こし結果を自前 S3 へ書き出させる（OutputBucketName を指定。下記）
  → Amazon Bedrock の Claude: sentence と summary を生成
  → 利用者の行を FOR UPDATE → 世代番号を確認 → dots へ保存（処理ID を同じ行に持つ）
     ＋ 記録を succeeded_cleanup_pending へ（同一 transaction。ここで成功が確定する）
  → cleanup: 音声の一時object の削除処理を始める。文字起こし結果は client の ACK を待つ
  → cleanup が全部終わってから処理の記録を削除する
  → 失敗: 記録を failed で残す。期限内は再試行できる
  → 期限到来: 音声object・文字起こし結果・Transcribe の job・残る記録の削除処理を始める

GET /api/v1/generations/:処理ID（client は polling）
  → **まず dots を見る。**同じ処理ID の Dot があれば成功として返す
    （記録が cleanup 待ちで残っていても「処理中」とは返さない）
POST .../transcript_ack（client が全文を保存し終えたら送る。冪等）
  → 文字起こし結果と Transcribe の job の削除処理を始める
```

- **文字起こしと生成の委託先をAWSに統一する。**委託先が1社に集約され、確認すべき9項目
  （[privacy.md §5-1](privacy.md)の外部provider行）の対象が1つになる。**認証はECS task roleの
  IAMで行い、**長期固定のAPIキーをアプリで持たない**（ECSはSDKへ一時credentialを供給するため、
  鍵の確認項目が無くなるわけではない）。対象bucketと対象モデルだけを許す最小権限にする。
  **9項目は未確認で、確認は公開前に人間が行う。**
- **Transcribeについて、AWS OrganizationsのAI services opt-out policyの適用を必須とする。**
  AWSのAIサービスは**既定では顧客コンテンツをサービス改善に利用し、利用リージョン外へ保存し得る**。
  Transcribeはこのopt-out policyの対象サービスで、**設定しない限りopt-inのままである。**
  適用せずに音声を送ると、上記「日記内容・音声・AI入力は原則として東京」が成り立たない。
  適用後にeffective policyを照会して効いていることを確認する（TASK-009/015）。
  なおBedrockはこのopt-out policyの対象外で、モデルごとのdata retention modeで別に確認する。
- **Bedrockのモデルは、推論が日本国外へ出ない経路で使えるものから選ぶ。**日本国内に収まるのは
  **Geo: JPの推論profile（宛先は東京と大阪）**か、**`bedrock-mantle` endpointのIn-Region（東京のみ）**
  である。**Globalプロファイルは世界中へルーティングされる。**endpointによって可否が違うため、
  `bedrock-runtime`と`bedrock-mantle`の対応表を取り違えない。**model idはTASK-009で決める。
  モデルの都合で所在地方針を黙って曲げない。**
- **文字起こし結果は自前のS3へ置く。**Transcribeのバッチは結果をS3へ書き出すため、
  「workerのmemoryだけを通る」経路は存在しない。**`OutputBucketName`を必ず指定し**、音声の一時
  objectと同じbucketの別prefixへ、同じ条件（非公開・暗号化・versioning無効・keyはUUID）で置く。
  指定を省くとservice-managed bucketへ置かれ、保持と削除を自分たちで制御できない。
  **端末が受け取って削除ACKを送ったら、その時点で削除処理を始める。**ACKが来ない場合の期限を
  別に置く。**始める契機は約束できるが、消え終わる時刻は約束しない**（[privacy.md §5-2](privacy.md)）。
  削除では**objectとTranscribeのjob（`DeleteTranscriptionJob`）の両方**を消す。
  **jobが非終端の間は削除できない**ため、終端になるまで追ってから消す。
  **端末から削除ACKを受け取った、期限を過ぎた、そのDotの完全削除を受理した、退会を受理した、
  のいずれかに当たると、objectが
  残っていても端末へ返さない。**いずれもcleanupの完了を待たず、受理した時点から返さない。
  期間と契機の正本は[privacy.md §5](privacy.md)、判断は
  [TASK-003 Plan §27](implementation-plans/2026-09-29-task-003-generation-design.md)。
  選定するモデルのdata retention modeも確認し、保持とAWSによる人的レビューが必須のモデルを
  使う場合は、それを録音前の案内に書く。
- **Job基盤はSolid Queue**（RDSのテーブルを使う）。ElastiCache Redisを常時稼働させないため、
  基盤費の目標（月5,000円、許容1万円前後）を増やさない。**workerは当面ECSの同一タスク内で
  Pumaと並走させ、Puma占有やdeployでの中断が実測で問題になれば別タスクへ分ける。**
  Solid Queueのまま分けられる。
- **clientへの結果の受け渡しはpolling。**ALBのidle timeoutとECS 1タスクという構成で接続を
  維持しない。**応答喪失後の結果照会にも同じendpointで答えられる。**
- **止まったJobを状態ごとに検知する（stale判定）。**再試行の期限は障害の検知期限ではない。
  **「最終進捗時刻からN分」だけで再実行しない**（Transcribeの完了待ちは正常でも分単位で止まる
  ため、生きているjobを二重に開始してしまう）。worker消失はSolid Queueの回収結果を拾い、
  Transcribe待ちは`GetTranscriptionJob`でAWS側の状態を見て、Job個体の停止はlease tokenで
  排他する。具体値はTASK-009で決める。`RAILS_MAX_THREADS`はSolid Queueの実行並列数そのもの
  ではないため、concurrency・DB pool・CPU/memoryは別に実測する。
- **処理IDと冪等性keyと録音attemptの識別子を同一にし、`dots`の列へ`(user_id, 処理ID)`のunique制約で持つ。**
  **serverが録音開始操作に対して発行する**（2026-09-29にTASK-004の`started_at`採用へ合わせて変更。
  当初はclient発行のUUIDだった）。処理の記録にも同じunique制約を置く。
  別々のIDにすると、成功時に処理の記録を消した時点で処理IDとDotの対応が消え、**pollingが結果を
  引けなくなる。**同じkeyでの再送は2件目のDotを作らず既存を返す。
  **二重のDotは防ぐが、外部AI処理の二重消費は防がない。**処理の記録にも同じunique制約を置き、
  同じ処理IDのPOSTが並行しても記録とJobを二重に作らない。**AWSのjob名とS3のkeyは、clientが
  発行する値ではなく**serverが発行する処理ID（＝TASK-004の録音attemptの識別子）から導く**（job名はAWSアカウント内で一意で
  なければならず、利用者間で衝突し得るため）。
- **再試行は、文字起こし結果が残っていれば生成からやり直す。**残っていなければ文字起こしから
  やり直す。Transcribeは費用の支配項目なので、手元に全文があるのに再実行しない。
- **再試行とcleanupは同じ記録を奪い合うため、どちらも条件付き更新にして片方だけを成功させる。**
  再試行・再upload・cleanupは同じ入口（利用者の行のlock → `active`・世代・期限・現在の状態の
  確認 → 実行権の発行）を通す。自動回収も同じ入口を通る。
- **Transcribeが終端したあと、Bedrockへ送る前にもう一度この入口を通す。**退会や期限到来を
  受理していれば生成へ進まず後片付けへ回す。**退会の受理後に新しいBedrockのrequestを開始しない。**
  既に始まっているrequestは止められないので、そこは約束しない。
- **退会は利用者の行のlockと世代番号で排他する。**状態の確認だけでは、確認を通過したuploadが
  退会の削除処理のあとに完了する経路を塞げない。受理時に利用者の行を`SELECT ... FOR UPDATE`で
  lockし、`active`の確認と処理の記録の作成を同じtransactionで行い、世代番号を記録へ写す。
  **記録を先に作ってからS3へuploadする**（先にuploadすると、記録が無いobjectを退会時に
  列挙できない）。**upload完了時に世代番号を再確認し、ずれていれば手元のkeyでobjectを消す。
  Jobの最終書き込みでも同じ利用者の行を`FOR UPDATE`でlockし、世代の確認とDotのinsertを同一
  transactionに入れる。**退会は`uploading`の記録を即削除せず、uploaderが片付けるまで待つ。
  退会の完了条件は「数えて消した」ではなく**「その利用者の進行中の処理が0であること」**とする。
  生成のcancel UIはMVPで持たない。
- **model idとpromptは設定で固定する。**固定しないと、ある日から生成結果の調子が変わる。
- Bedrockのrequest / responseと文字起こしテキストは発話内容そのものなので、SDKのdebug logや
  error trackingへ出さない（上記「ログへ出さない」と同じ対象）。

### データ所在地と費用

日記内容・音声・AI入力は原則として東京に置き、文字起こし・AI処理も東京を優先する。
**国内限定を利用者への法的・契約上の約束にはしない。** Google・メール・外部AI等の全処理が
国内であるとは扱わない。送信先・目的・保持/削除と説明は上記「音声・文字起こしの経路と保持」で
採用し、委託先ごとの実際の保持設定はTASK-003で一次資料を確認する。
Cookie sessionは利用者のブラウザに保存され、東京DB内の保存に限定されない。
厳密なD2の個別例外管理はMVPの採用条件から外し、将来要求が変わった時の検討事項に残す。

基盤費は**月5,000円を目標、安全な公開MVP運用のため月1万円前後まで許容**する。音声保存・
文字起こし・AI・通信量は別従量予算。DB backup・監視・認証メール等は基盤見積もりに含める。
ALB/Fargate/RDS/公開IPv4の小規模例でも、1ドル150円・消費税10%の仮定で月約10,390円に
追加従量費がかかるため、5,000円や厳密な1万円以内で成立するとは説明しない。
公開前に**AWS Pricing Calculator、AWS Budgets、Cost Anomaly Detection**を初期設定し、
実構成・実負荷で再見積もりする。通知は請求額の強制上限ではない。

選択理由・比較履歴・費用の計算と一次資料・残判断は
[TASK-001 Plan §45–57](implementation-plans/2026-09-21-task-001-identity-design.md)を参照。
認証・配信の実装、AWS作成、実機検証は今回行っていない。

### 認証詳細（2026-09-25採用、未実装）

[TASK-001 Plan §50–54・§56](implementation-plans/2026-09-21-task-001-identity-design.md)で採用した。
実装済みの設定ではない。

- 自分専用端末では認証成功から7日の絶対期限。通常操作で延長せず、server側で検証する。
  Rememberableの自動再ログインと別のidle期限は使わない。共有端末向け短期モードはMVP外。
- 録音前と音声送信時に認証を確認する。別Userへの入り直し後に元の録音を送信しない。
- メール確認24時間、password再設定6時間、使用後の再利用拒否。確認後・再設定後はログイン画面へ戻す。
  再送は確認/reset合算で宛先60秒に1回・1時間5回、IPごと1時間20回、RDSの共有counterで制限し共通応答。
  Devise 5.0.4の確認期限は標準では無期限なので変更が必要。導入版は未確定。
- Google同一メール衝突時は自動統合も重複User作成もしない。Googleが確認済みとしたメールに限り
  登録方法を案内する。将来の連携は既存Userへのログイン/再認証と追加手段の確認後に限定。
- メール/password変更・退会はcurrent password、Google専用UserはGoogle再認証を要求する。
- 端末一覧・遠隔logoutはMVP外。全端末logoutのみならUser世代番号の照合でも構成可能で、
  DB session移行が必須とはしない。既存Cookieが期限まで残るリスクと追加コストはPlan §54。

## 未決定

- プロダクト機能を追加する際のRails内部architectureとdirectory構成
- password方針・ログイン試行制限の具体値、Googleの確認情報とConfirmableの関係、Google再認証の有効時間（TASK-006で決定）
- password再設定後の既存Cookieの実動作（実機検証）
- 実domain、task/DBサイズ、backup保持/復元目標、公開前の監視・費用設定の具体値
  （ログ14日・backup 7日は既定案であり、実値は未確定）
- promptの最終文面、Bedrockのmodel idとdata retention mode（TASK-009で確定）
- 委託先（Amazon Transcribe / Amazon Bedrock）への9項目の確認結果（公開前に人間が実施）
- 音声受信時のPuma占有時間の実測（`RAILS_MAX_THREADS`既定3・ECS 1タスク）、presignedでの直接uploadへ移す条件、受容するaudioのcontent typeの確定、S3 bucketとIAMの具体設定

これらは、関連仕様と個別のImplementation Planで選択肢・影響を確認した上で、後続の変更で決定・実装する。
