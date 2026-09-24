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

## 決定済み

- Frontendは `apps/web/` に配置する。
- Backendは `apps/api/` にRuby on Railsで配置する。
- FrontendとBackendは同じrepositoryで管理する。
- アプリケーション機能としてのAI処理はBackend側に置く。
- 開発支援AIに関する指示・文書・workflowはroot、`docs/`、`.github/` 側で管理する。
- User、認証、Dot、音声、AI処理は将来の変更で実装する。
- 最初のプロダクトAPIをWebから利用する変更で、API契約の管理を始める。その時点ではOpenAPIを
  推奨候補とするが、型生成・生成物の管理・契約検証toolは別の判断とする。
- API、Web、契約は同じPRで更新する。同一PRでもWebとAPIのデプロイ時差があり得るため、
  request / responseの互換性と段階的な配布を考慮する。

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
将来の音声・文字起こし・AI → 東京を基本配置（TASK-002/003で詳細決定）
```

- Rails + Deviseがメールアドレス＋パスワード、Confirmableの確認メール、Recoverableの
  パスワード再設定を担当する。GoogleはOmniAuthで連携する。確認前のメールUserにDot操作を
  許可しない。Googleの確認情報の扱い・再設定の詳細は後続で決める。
- 内部User UUIDを所有権の正本とし、Googleは検証済みprovider/uidから一意に対応付ける。
  email一致だけでアカウントを統合しない。衝突時の案内・登録可否は未決定で、明示的連携は将来対応。
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
  全端末logout用DB sessionは将来要件。具体的な有効/idle/絶対期限・remember_me・再認証は未決定。
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
ALB metricsと機密を除いたRailsログを使う。保持・削除と復元時の整合はTASK-002で決める。

### データ所在地と費用

日記内容・音声・AI入力は原則として東京に置き、文字起こし・AI処理も東京を優先する。
**国内限定を利用者への法的・契約上の約束にはしない。** Google・メール・外部AI等の全処理が
国内であるとは扱わない。送信先・目的・保持/削除と説明はTASK-002/003で確認する。
Cookie sessionは利用者のブラウザに保存され、東京DB内の保存に限定されない。
厳密なD2の個別例外管理はMVPの採用条件から外し、将来要求が変わった時の検討事項に残す。

基盤費は**月5,000円を目標、安全な公開MVP運用のため月1万円前後まで許容**する。音声保存・
文字起こし・AI・通信量は別従量予算。DB backup・監視・認証メール等は基盤見積もりに含める。
ALB/Fargate/RDS/公開IPv4の小規模例でも、1ドル150円・消費税10%の仮定で月約10,390円に
追加従量費がかかるため、5,000円や厳密な1万円以内で成立するとは説明しない。
公開前に**AWS Pricing Calculator、AWS Budgets、Cost Anomaly Detection**を初期設定し、
実構成・実負荷で再見積もりする。通知は請求額の強制上限ではない。

選択理由・比較履歴・費用の計算と一次資料・残判断は
[TASK-001 Plan §45–49](implementation-plans/2026-09-21-task-001-identity-design.md)を参照。
認証・配信の実装、AWS作成、実機検証は今回行っていない。

## 未決定

- プロダクト機能を追加する際のRails内部architectureとdirectory構成
- Cookieの有効/idle/絶対期限・remember_me、録音前ログイン、共有端末の再認証、password再設定後のCookieの扱い
- 確認/再設定メールの期限・再送、password方針・濫用防止の具体値、Googleの確認情報・同一メール衝突時のUX
- 実domain、task/DBサイズ、backup保持/復元目標、公開前の監視・費用設定の具体値
- background job基盤
- API契約でOpenAPIを採用するか、採用時の型生成・生成物管理・検証方法
- AI providerとその実装方法

これらは、関連仕様と個別のImplementation Planで選択肢・影響を確認した上で、後続の変更で決定・実装する。
