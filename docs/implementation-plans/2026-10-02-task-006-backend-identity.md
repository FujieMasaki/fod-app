# TASK-006 利用者・認証・認可のBackend基盤 Implementation Plan

## 1. Status

実施中（2026-10-02）。TASK-001から移管された4つの判断は、2026-10-02に人間が決めた（§12-5）。

## 2. Goal

Rails APIに、採用済みの認証方式（Devise + OmniAuth Google + Rails CookieStore）を組み込む。
利用者が次の操作をできるようにする。

- メールアドレス＋passwordで登録し、メールで確認する。
- loginとlogoutをする。
- passwordを再設定する。
- Googleでloginする。

後続のDot API（TASK-008 / 009 / 013）が、認証済みの`current_user`を所有者の根拠として使える
基盤を提供する。

## 3. Background

- TASK-001で認証方式・期限・メール・衝突時の案内・再認証を採用した（[TASK-001 Plan §45–§46・§50–§56](2026-09-21-task-001-identity-design.md)）。
- TASK-005でendpoint・schema・error codeを契約にした（[`contracts/openapi.yaml`](../../contracts/openapi.yaml)、
  [`contracts/README.md`](../../contracts/README.md)）。
- 採用Gemのversionとstrategyの挙動に依存する4点は、TASK-001から本Planへ移管された
  （[TASK-006](../tasks/TASK-006-backend-identity.md)「TASK-001から移管した判断」）。

## 4. Current State

- 開始時点はmain `33616c9`（PR #47まで）。branchは`feat/task-006-backend-identity`。
- Rails 8.1.3.1、API-only（`ApplicationController < ActionController::API`）。routeは`GET /up`だけ。
  User model、Devise・OmniAuth、Cookie/session middleware、CSRF、mailer設定はない。
- `config.cache_store`はdevelopmentで`:memory_store`、testで`:null_store`。productionは未設定。
  そのため、productionではプロセス間でcounterを共有できない（TASK-001 Plan §57の指摘のとおり）。
- request specは`committee-rails`で契約と照合する設定がある（`spec/support/api_contract.rb`）。
- 調査時点（2026-10-02）のRubyGems最新版: devise 5.0.4、omniauth 2.1.4、
  omniauth-google-oauth2 1.2.3、omniauth-rails_csrf_protection 2.0.1、solid_cache 1.0.10。
- omniauth-google-oauth2 1.2.3は`email_verified`を`info`に含め、ID tokenのiss/aud/exp/nbfを
  検証する。ただし、authorize paramsに`max_age`を持たず、`auth_time`も検証しない
  （gemのsource `AUTHORIZE_OPTIONS`を確認）。

## 5. Scope and Non-goals

### 対象

- endpoint: `GET/POST/DELETE /api/v1/session`、`POST /api/v1/registration`、
  `POST/PATCH /api/v1/confirmation`、`POST/PATCH /api/v1/password`、
  `POST /auth/google_oauth2`、`GET /auth/google_oauth2/callback`
- User model（UUID主キー）と、Googleのprovider/uidとの一意な対応
- 7日固定の絶対期限、メール確認前の拒否、Google再認証の時刻の記録
- 後続のControllerが使う認証concern
  - `authenticate_user!`相当で`401 unauthenticated` / `401 session_expired` / `403 email_unconfirmed`を返す。
  - `current_user`を提供する。
- CSRF（`X-CSRF-Token`、Origin照合）、`Cache-Control: no-store`、RFC 9457のerror
- 確認/再設定メールの送信制限と、login試行の制限
- ログのparameter filter（password・token・code・emailを出さない）
- 確認・再設定・既登録案内・Google専用者への案内のmailerと文面

### 対象外

- 退会（`DELETE /api/v1/account`、`GET /api/v1/account/deletion`）はTASK-013。
  Sessionの`account_status`は、TASK-013で退会の状態が加わるまで常に`active`を返す。
  `409 account_deletion_in_progress`のguardもTASK-013で足す。
- Dot・録音attempt・生成のendpointは、それぞれTASK-008 / 009 / 013で扱う。
- メール/password変更のendpoint。契約にないため、TASK-014で採用されたときに扱う。
- 本番のメール配送（SES）とGoogle OAuth clientの登録。外部サービスの設定のため人間が行う。
  コードはENVから読む形にし、productionの`delivery_method`は配送基盤の設定時に決める。
- Webの接続はTASK-007。

### 今回確定しない事項

- password再設定後の既存Cookieの実動作。specで確かめた範囲だけを記録し、実機検証はTASK-015。

## 6. References and Documents to Update

- 参照
  - [AGENTS.md](../../AGENTS.md)、[backend.md](../development/backend.md)、`rails-conventions.md`
  - [architecture](../architecture.md)「認証詳細」、[privacy](../privacy.md)、
    [journaling](../journaling.md) §3–§4、[product](../product.md) §2
  - 契約（`contracts/`）、[TASK-001 Plan](2026-09-21-task-001-identity-design.md)、
    [TASK-005 Plan](2026-10-01-task-005-api-contract.md)
  - [backend review](../code-review/backend/README.md)、[security](../code-review/backend/security.md)
- 同じ変更で更新する文書
  - architecture: 「認証詳細」の実装済み範囲と未決定欄（§12の決定）
  - product / journaling: TASK-006で決める項目の欄
  - backend.md §1「保留」: 認証が未追加という記述
  - privacy: 認証情報の保存・ログ
  - 契約: `Credentials.password`の`minLength`と説明（§12-1の決定後）

## 7. Proposed Approach

1. **依存とUser**
   - Gemを追加する: devise・omniauth・omniauth-google-oauth2・omniauth-rails_csrf_protection（versionを固定）。
   - `users`のcolumn: UUID、email（正規化して一意）、encrypted_password（Google専用はnull）、
     confirmable / recoverableのcolumn。
   - `user_identities`のcolumn: user_id、provider、uid。`(provider, uid)`を一意にする。
   - Deviseのmodule: database_authenticatable・registerable・confirmable・recoverable・
     validatable・omniauthable。Rememberable / Timeoutableは使わない。
2. **API-onlyへのsession/CSRF組込み**
   - CookieStoreのmiddlewareを明示的に追加する。設定は`_focus_on_dot_session`、
     HttpOnly / Secure（production）/ SameSite=Lax、Domainなし。
   - `ActionController::RequestForgeryProtection`を有効にし、`X-CSRF-Token`を検証する。
     失敗は`403 csrf_invalid`のProblemにする。Origin headerがあれば許可originと照合する。
   - 共通のProblem renderer、`no-store` header、parameter filterを追加する。
3. **認証concernと期限**
   - login成功時にsessionをresetし、`authenticated_at`をsessionへ入れる。
   - 毎requestで`authenticated_at + 7日`を検証する。値の欠落・期限切れはsignoutして`401 session_expired`にする。
   - Cookieの`expires`も同じ時刻に揃える。
   - 未確認のメールUserは`403 email_unconfirmed`にする。
4. **session / registration / confirmation / password**
   - Deviseのcontrollerを継承せず、薄いAPI controllerからDeviseのmodel APIを呼ぶ。
     Deviseのcontrollerは、HTML・flash・redirectを前提にしているため。
   - `paranoid`相当の共通応答にする。
   - 確認は24時間、再設定は6時間、使用後の再利用は拒否する。`sign_in_after_reset_password=false`にする。
   - 再設定tokenの消費は、行lockで1回だけ成功するようにする。
   - 登録済みのメールへの登録には、既登録案内メールを送って`202`を返す。
   - Google専用Userへの再設定要求は、Google案内メールを送ってtokenを発行しない。
5. **Google**
   - 開始はPOST（omniauth-rails_csrf_protection）。`intent`・`return_to`はsessionへ保存する。
     `return_to`は`\A…\z`で照合する。
   - callbackでは`(provider, uid)`でUserを探す。無ければ次のとおり扱う。
     - 確認済みemailが既存のpassword Userと一致する: `google_email_conflict`
     - それ以外: 新規作成（§12-2に従う）
   - `intent=reauthenticate`は、いまのUserのidentityと一致した場合だけ、sessionへ`google_reauthenticated_at`を記録する。
     「直近」の判定方法は§12-3に従う。
6. **送信制限とlogin試行制限**: §12-1・§12-4の決定に従って実装する。
7. **文書・契約の更新**、spec、Completion Record。

## 8. Why This Approach

- Deviseのmodel層（password hash・token・Confirmable/Recoverableの期限）は再利用する。
  HTTP層は契約（JSON・Problem・共通応答）に合わせて自前で書く。
  Deviseのcontrollerを上書きして契約に合わせるより、読む範囲が小さく、列挙対策の応答を揃えやすい。
- User UUIDとidentityの表を分けると、将来の明示的連携（TASK-001 Plan §53）で表を変えずに済む。
  provider/uidの一意制約で、同時callbackでの重複を防げる。
- 7日の期限をDeviseのTimeoutable / Rememberableで代用しない（TASK-001 Plan §51）。

## 9. Data Flow

```text
Web（同一origin）
  → GET /api/v1/session ……… CSRF token・認証状態（no-store）
  → POST /api/v1/session（X-CSRF-Token）
       → Controller → Devise model（password照合・confirmed?）
       → reset_session → sign_in → session[authenticated_at]
       → 暗号化Cookie（HttpOnly / SameSite=Lax）
以後の保護API
  → Cookie復号 → Warden → User取得 → 期限・確認の検証 → current_user → 各Controller（TASK-008〜）
Google
  → form POST /auth/google_oauth2（authenticity_token）→ Google
  → GET /auth/google_oauth2/callback（state検証）→ identity照合 → sign_in → SPAへredirect
```

認証状態の正本はserver（Cookie内の暗号化session＋RDSのUser）。Webのstateは表示用。

## 10. Files to Change

- 変更: `apps/api/Gemfile`・`Gemfile.lock`、`config/application.rb`（session middleware）、
  `config/initializers/devise.rb`（新規）・`omniauth.rb`（新規）、`filter_parameter_logging.rb`、
  `config/routes.rb`、`app/controllers/application_controller.rb`
- 新規
  - `app/models/user.rb`、`user_identity.rb`、migration
  - `app/controllers/concerns/`（認証・Problem・no-store）
  - `app/controllers/api/v1/{sessions,registrations,confirmations,passwords}_controller.rb`
  - `app/controllers/auth/google_callbacks_controller.rb`
  - `app/mailers/user_mailer.rb`とview、送信制限
- spec: `spec/requests/api/v1/*`、`spec/requests/auth/*`、`spec/models/*`、factory
- 文書: §6のとおり。契約は§12-1の決定で`minLength`を足す。

## 11. Libraries / APIs

| Gem | 用途 | 理由 |
| --- | --- | --- |
| devise 5.0.4 | password hash、Confirmable・Recoverableのtokenと期限 | TASK-001で採用済み |
| omniauth 2.1.4 / omniauth-google-oauth2 1.2.3 | Google認証、state・ID tokenの検証 | TASK-001で採用済み |
| omniauth-rails_csrf_protection 2.0.1 | 開始POSTのCSRF検証（CVE-2015-9284対策） | TASK-001 Plan §47の一次資料 |

## 12. 判断が必要な点（TASK-001から移管）

### 12-1. password方針とlogin試行制限

確認済みの事実:

- 契約では`maxLength: 128`。
- Lockableは、失敗回数でアカウントを止める。このため第三者が本人を締め出せる。
  また、ロックの有無が応答に出ると登録の有無を推測できる。
- 契約にはlogin（`POST /api/v1/session`）の`429 rate_limited`が既にある。

| 案 | 内容 | トレードオフ |
| --- | --- | --- |
| A（推奨） | 最小12・最大128文字。文字種の強制なし。Lockableは使わない。loginは「メール単位で15分に10回」「IP単位で1時間に50回」の失敗で`429`。未登録のメールにも同じ数え方を適用する | 第三者による締め出しと列挙を避けられる。NIST SP 800-63B（長さ重視・構成規則なし）に沿う。総当たりは速度制限だけで抑える |
| B | 最小8文字＋Lockable（10回失敗で1時間ロック、解除メール） | 総当たりへの耐性は強い。一方で締め出しと列挙の経路が増え、解除メールの運用も増える |
| C | Aに加え、漏えいpasswordとの照合（HIBPのk-anonymity API） | 弱いpasswordを防げる。代わりに外部サービスへの送信（hashの先頭5文字）と障害時の扱いが増える |

### 12-2. Googleの確認情報とConfirmable

| 案 | 内容 | トレードオフ |
| --- | --- | --- |
| A（推奨） | `email_verified=true`のGoogleだけで新規Userを作り、作成時に`confirmed_at`を設定する（確認済みとして扱う）。`false`・欠落は`google_auth_failed`。Google専用Userは`encrypted_password`をnullにする。password loginと再設定は、§7-4のとおり共通応答で拒否・案内する | Googleで所有を確認済みのメールに、再度確認メールを送らずに済む。未確認メールのGoogleは使えない |
| B | Google Userにも確認メールを送り、確認まで`email_unconfirmed` | 確認が二重になり、Googleを選ぶ利点が薄れる |

### 12-3. Google専用Userの再認証の「直近」と要求方法

| 案 | 内容 | トレードオフ |
| --- | --- | --- |
| A（推奨） | strategyを拡張してGoogleへ`max_age=0`と`prompt=select_account`を送る。ID tokenの`auth_time`がcallback時点から5分以内であることを検証する。そのcallbackの時刻から5分以内を「直近」とする | Googleに実際の再入力を求めたことをserverで確認できる。gemが`max_age`を扱わないため、小さな拡張とその保守が要る |
| B | `prompt=select_account`だけを送る。callbackの時刻から5分以内を「直近」とする | 実装は小さい。ただし、Googleにloginしたままなら、password入力なしで通り得る |
| C | Aと同じで、有効時間を10分にする | 退会画面で迷う時間に余裕ができる。代わりに盗まれたsessionで使える時間も延びる |

### 12-4. 送信制限の共有counter

| 案 | 内容 | トレードオフ |
| --- | --- | --- |
| A（推奨） | RDSに`rate_limit_counters(key_digest, window_started_at, count)`を作り、1つのUPSERTで原子的に加算する小さなServiceにする。keyはHMACでdigestにし、生のメールを保存しない。期限切れの行は定期的に削除する | 依存を足さない。evictionが起きないので制限が緩まない。controllerをまたいだ合算（確認＋再設定）も自然に書ける。掃除の処理は自前で持つ |
| B | Solid Cache（RDS）＋Railsの`rate_limit` | 標準の仕組みに乗れる。一方で次のコストがある。<br>- gemとcache用tableが増える。<br>- 容量超過時のevictionでcounterが消え得る。<br>- `rate_limit`のkeyがcontrollerごとに分かれるため、確認＋再設定の合算や「制限時も202」には独自のcallbackが必要 |

### 12-5. 人間の判断（2026-10-02）

| 判断 | 選択 | 内容 |
| --- | --- | --- |
| 12-1 | B | password 8〜128文字（文字種の強制なし）、Lockable採用 |
| 12-2 | A | `email_verified=true`のGoogleだけ確認済みとして新規作成 |
| 12-3 | A | `max_age=0`と`auth_time`の検証。有効時間5分 |
| 12-4 | A | RDSの専用tableで原子的に加算 |

12-1のBを契約と実装に落とすため、次の3点はPlan作成者（Claude）が既定値として決めた。
変えるときは人間が判断する。

- **ロック中のlogin**: password一致でも`401 invalid_credentials`を返す。
  - ロックの有無を応答に出さないため（未登録・不一致と同じ応答）。
  - 解除メールはロックした時点で1回だけ送る。
- **解除の方法**: Deviseの`unlock_strategy = :both`、`unlock_in = 1時間`、`maximum_attempts = 10`。
  - 1時間で自動解除し、メールのリンクからも解除できる。
  - リンク用に`PATCH /api/v1/unlock`（body `{token}`、成功`204`、`422 token_invalid`）を契約に足す。
  - endpointの追加なので、1回のreleaseで入れてよい変更にあたる（`contracts/README.md` §3）。
  - 解除メールの再送endpointは作らない。1時間で自動解除されるため。
- **IPごとの制限の併用**: login失敗がIPごとに1時間50回を超えたら`429 rate_limited`。
  - Lockableはアカウント単位なので、多数のアカウントへ順に試す攻撃を止められないため。
  - IPの制限は他人を締め出さない。
  - 数え方は12-4の共有counterを使う。

## 13. Risks / Things to Watch

- API-onlyへのsession・CSRFの組込み漏れ。GET以外のすべてで`csrf_invalid`になることをspecで確かめる。
- Deviseのfailure app・redirectがJSON APIへ漏れる。Wardenの失敗をProblemに変換する。
- Cookie再発行で7日が延びる。`authenticated_at`はlogin成功時だけ設定し、specで期限前後を確かめる。
- 再設定tokenの同時消費、Googleの同時callbackでの重複User。一意制約と行lockで防ぎ、specで確かめる。
- 応答時間の差による列挙（未登録時はメール送信をしない等）。処理の経路を揃え、残る差はPlanに記録する。
- ログへのtoken・code・emailの混入。filterとspecで確かめる。

## 14. Verification

### Automated（request spec / model spec）

- 成功・失敗・終了・失効・未認証:
  - login成功・失敗
  - 未確認
  - logout（二重logoutも`204`）
  - 7日の前後
  - 期限欠落・改ざんCookie
  - 削除済みUser
- CSRF: tokenの欠落・不一致で`403 csrf_invalid`。許可外Originを拒否する。
- 確認・再設定:
  - 期限切れ・使用済み・再送の挙動
  - 再設定の同時消費
  - 既登録への登録
  - Google専用Userへの再設定
- Google（OmniAuth test mode）:
  - 新規作成・既存login
  - `email_verified=false`
  - 衝突時の`google_email_conflict`
  - state不正・失敗
  - `return_to`の改行・外部URL
  - 再認証の一致・不一致・未login
- 送信制限・login試行制限の境界値。宛先の制限は`202`、IPの制限は`429`。
- 2人の利用者を混同しないこと。clientが送った`user_id`を無視すること。
- 全responseを`assert_response_schema_confirm`で照合する。個人responseの`no-store`も確かめる。
- ログ・responseにpassword・token・code・生のemailが出ないこと。

### Manual

- 実Google・実メール送信・実配信でのCookie属性はTASK-015。外部設定が必要なため、本タスクでは行わない。

## 15. Definition of Done

TASK-006の完了条件5件をspecと文書で確認し、Completion Recordへ記録する。
実機で確かめる項目が残る場合は、In progressのままにする。

## 16. Completion Record

- 状態: 2026-10-02、実装・自動検証済み。In progressのまま（§12-5の既定値3点と、下記の実装差異の
  人間による確認待ち）。

### 実装差異（Planから変えた点と理由）

| 変更 | 理由 |
| --- | --- |
| **json gemを`~> 2.21`に固定した** | mainのjson 3.0.2はActiveSupport 8.1.3.1の`JSON.decode`（`JSON.parse(json, options)`）と合わず、JSONのrequest bodyを一切解釈できなかった（mainから続く不具合。これまでJSON bodyを送るspecが無く表に出なかった）。Rails 8.1.4へ上げる案より変更が小さい。Railsが対応したら外す |
| Deviseの`omniauthable`ではなく、OmniAuthのmiddlewareを直接使う | Deviseのomniauth routeは`/users/auth/...`が前提で、契約のpath（`/auth/google_oauth2`）と合わない。Deviseのmappingは`devise_for :users, skip: :all`でsign_inにだけ使う |
| Deviseの`validatable`を使わず、Userでvalidationを書く | Google専用Userをpasswordなしで作るため |
| CSRF不一致の例外を包み直す | omniauth-rails_csrf_protectionはRailsの例外を投げるが、OmniAuthが失敗として扱うのは`OmniAuth::AuthenticityError`だけで、そのままでは契約の`403 csrf_invalid`にならない |
| test環境の`allow_forgery_protection`をtrueにした | 無効のままだと、Googleログイン開始POSTのCSRF検証がtestで素通りになり、検証の抜けを検出できなかった（実際に一度素通りした） |
| CSRF検証の前にrequest bodyを解釈しておく | verifierがenvを複製してbodyを読むため、後のbefore_request_phaseでintent・return_toが空になった |
| Cookieの有効期限を認証から8日にした（判定は7日） | Railsの暗号化Cookieは有効期限を中に持ち、過ぎると読めない。7日ちょうどにすると`session_expired`と`unauthenticated`を区別できない |
| Googleへ`access_type=online`・scope `openid email`を指定した | gemの既定は`offline`（refresh tokenを求める）と`email profile`。本人の識別と確認済みメール以外は不要 |
| requestのparameterでGoogleへのauthorize optionsを上書きさせない | gemの既定では`prompt`・`redirect_uri`・`hd`などをrequestから上書きできる |
| 入力の長さ不足は`validation_failed`の`out_of_range` | 契約のFieldErrorに`too_short`が無い。enumを足すとWebの互換性の段階が要るため、既存の値を使い契約の説明に書いた |
| JSONとして読めないbodyは`422 validation_failed`（field `body`） | 既定では`500`になっていた |
| メール配送の失敗は`202`のまま、error reportへ送る | 登録の有無によって応答が変わらないようにするため（配送されたとは約束しない） |
| rubocopで、migrationのDocumentation・MethodLengthを除外し、specのexpectation数（5）と長さ（15行）を緩めた | migrationは列の定義が説明になる。request specは1操作の結果（status・code・header・契約）をまとめて確かめるため |

### 検証結果

`apps/api`で実行した。

- `bundle exec rspec`: 291 examples, 0 failures（既存の契約spec含む）
- `bundle exec rubocop`: 74 files, no offenses
- `bundle exec brakeman --no-pager -q`: Security Warnings 0
- `bundle exec bundler-audit check --update`: No vulnerabilities found
- `pnpm lint:contract`（Redocly）・生成した型の最新確認: 通過

完了条件ごとの証跡:

| 完了条件 | 結果 | 証跡（spec） |
| --- | --- | --- |
| 識別・開始・終了・失効、未認証の拒否 | 確認 | `requests/api/v1/sessions_spec.rb`、`requests/authentication_spec.rb`（7日ちょうどで`session_expired`、利用で延長しない、改ざん・削除済み・ロック中・再設定後のCookieを拒否） |
| clientのuser IDを根拠にしない | 確認 | `authentication_spec.rb`（`user_id`を送っても無視、2人を混同しない）。Google（`requests/auth/google_spec.rb`）はprovider/uidで対応付け、emailで接続しない |
| 資格情報の保護、CSRF/CORS | 確認 | Cookie属性（HttpOnly・SameSite=Lax・Domainなし。Secureはproductionの設定）、tokenの欠落・他sessionのtoken・許可外Originで`403`、CORS headerを返さない、Google開始POSTのCSRF |
| response/ログに秘密を出さない、契約との一致 | 確認 | `requests/sensitive_logging_spec.rb`、全responseを`assert_response_schema_confirm`で照合 |
| 実装範囲を文書で区別 | 確認 | architecture「認証詳細」、backend.md、product、journaling、privacy |

### 未実施の確認と理由

- 実Google・実メール配送・HTTPS配信でのCookie（Secure）とCSRF。OAuth clientと配送基盤の設定が
  必要で、外部サービスの設定は人間が行う。TASK-015で横断検証する。
- `rate_limit_counters`の定期削除の実行（rake taskだけ用意した）。job基盤・公開基盤が未構築のため。

### 残るリスク（PRで確認してもらう）

- **ロック中のsessionは切れる**: 第三者が10回失敗させると、ロックの間、本人のlogin中のsessionも
  `401`になる（DeviseのActivatable）。1時間で解け、解除メールでも解ける。
- **未確認の登録が、同じメールのGoogle新規作成を妨げる**: 他人が本人のメールで登録だけして確認しないと、
  本人のGoogleログインは`google_email_conflict`になる。本人はpassword再設定と確認メールで取り戻せる。
- **確認tokenはDBに平文で残る**（Deviseの仕様）。確認だけではloginしないため影響は小さい。
- **固定の時間枠**のため、枠の境目をまたぐと短時間に上限の2倍まで通り得る。
- **CookieStoreのため、コピーされたCookieはlogoutしても7日まで使える**（TASK-001で受け入れ済み）。

- 関連: 契約の変更は`contracts/openapi.yaml`（`PATCH /api/v1/unlock`、`NewCredentials`）。
  退会はTASK-013、Webの接続はTASK-007。
