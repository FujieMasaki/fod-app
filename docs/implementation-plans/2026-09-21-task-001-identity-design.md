# TASK-001 認証と利用者識別の設計比較 Implementation Plan

## 1. Status

完了（2026-09-25、MVPの認証詳細を採用し、残る実装依存の判断をTASK-006へ移管）。ユーザーはRails + Deviseのメールアドレス＋パスワード、確認メール、パスワード再設定、OmniAuthによるGoogleログイン、Rails標準CookieStoreを採用した。**採用済みの基礎方針は§45–48、認証詳細は§50–54（§56で採用・一部変更）、残作業は§57**。§49・§55は前回までの検証記録。公開基盤はAWS東京のALB + ECS Fargate + RDS PostgreSQL、初期1タスク・Single-AZ・React同梱の同一originを維持する。

Cognito、Cognito用OIDC callback/token検証/利用者対応、メールOTP、通常認証用DB sessionは現行設計から外す。MFA・passkey・手動本人確認による復旧・明示的アカウント連携はMVP対象外。端末別失効・全端末logout用DB sessionは将来要件。国内限定を約束しない。

§4は開始当時の記録、§16–44は過去の比較・変更途中の記録として折り畳んで保存する。過去の推奨・採用表・失効保証・完了記録を現行仕様に適用しない。password方針・ログイン試行制限等はTASK-006へ移し、TASK-001はDone（§57）。機能実装・実機検証は未実施。

## 2. Goal

Devise + CookieStoreの採用済み方針を維持し、7日固定期限、録音前ログイン、確認/再設定メール、将来のアカウント連携と端末管理を判断できる初期案にする。Devise標準値・提案・要実機検証を区別する。

## 3. Background

ユーザーは個人MVPの認証をRails側へ集約し、メール＋パスワードとGoogleを採用した。管理型IdPやDB sessionを前提とした過去案とは運用責務・失効特性が異なるため、単なる名称置換ではなく認証フローと後続契約の条件を更新する。TASK-001に依存タスクはない。TASK-002/003はTodo・Plan未作成で、保持/削除やAI/Jobの決定・実証を補完したとは扱わない。

## 4. Current State

- 開始ブランチは`main`。HEAD、`origin/main`、`git ls-remote origin refs/heads/main`は`4b5365b17437df07f52620edd0ecb98cbe0eaf47`で一致。PR #26までマージ済み。
- 追跡済みファイルの差分はなく、未追跡`.worktrees/`がある。そこには触れない。コミット・push・PRは行わない。
- Railsは8.1.3.1のAPI-only構成。`ApplicationController < ActionController::API`で公開routeは`GET /up`のみ。User、認証、Dotモデル、認証用Gem、Cookie/session/CSRF/CORSの設定は未追加。
- production設定はSSL終端reverse proxyを想定するが、実際の配信先・ドメイン・proxyは確定していない。Vite設定にもAPI proxyはない。
- WebのSession Providerは`fod.session.v1`へ録音時間と現在のDotを保存し、利用者を区別しない。認証sessionではない。
- `createDot`は本文なしPOSTで、資格情報やCSRF対策を指定していない。routerにも認証guardはない。実サービス契約として流用しない。
- Rails基盤Planは認証・CORSを明示的に対象外にしている。同Planには実行結果の完了記録がなく、今回runtime成功を推定しない。タスク整理Planの検証は文書の整合確認であり、認証の実証ではない。

## 5. Scope and Non-goals

本Plan、TASK-001/005、architecture、product、journalingの6文書を更新する。PR #27はマージ済みで、現在のbranchはcodex/task-001-auth-details。未追跡.worktrees/を保護する。今回の内容は初期案であり、承認済み仕様や実装済みの挙動にはしない。コード・設定・Gem/lockfile、AWS、外部登録、branch、commit、push、PRは変更・作成しない。

TASK-002の保持期間、TASK-003のAI/Job、TASK-004の履歴、TASK-005の正式API契約を先に確定しない。参考サービスの固有情報は記録しない。

## 6. References and Documents to Update

- 規約: AGENTS.md、個人規約とRails規約、両領域の実装規約・レビュー入口・security、PR template。
- 仕様: [product](../product.md)、[journaling](../journaling.md)、[architecture](../architecture.md)。
- タスク: [TASK-001](../tasks/TASK-001-identity-design.md)、[TASK-002](../tasks/TASK-002-data-lifecycle-design.md)、[TASK-003](../tasks/TASK-003-generation-design.md)、[TASK-005](../tasks/TASK-005-product-api-contract.md)。
- 関連記録: [Rails基盤Plan](2026-09-18-rails-api-foundation.md)、[タスク整理Plan](2026-09-20-mvp-task-inventory.md)。
- 対象コード: apps/apiのGemfile、ApplicationController、application/routes/production設定、apps/webのVite設定・Session Provider・createDot。認証・Dot API未実装を確認し、変更しない。
- 更新する現行文書: §5の6文書。今回の一次資料は§52、初期案の導線と残判断を正本文書から参照する。

## 7. Proposed Approach

1. branch・差分・マージ済み仕様・規約・タスク全文と関連実装を確認する。
2. 現行Devise releaseとversion固定sourceを確認し、未導入の本repoと区別する。
3. §50–54に初期案、利用者/実装への影響、代替案を整理してから現行文書の未決定欄へ参照を追加する。
4. A/B/未認証/期限切れ、メール再送・使用済み・衝突・端末管理を机上検証する。
5. 差分・リンク・過去記録・task状態を確認し§55へ記録する。初期案への判断が残るためDoneにしない。

## 8. Why This Approach

今回の人間の選択を正本へ反映し、本人確認をRailsで管理する利点と、パスワード・メール運用を引き受ける負担を同時に示す。CookieStoreの簡素さを採用しつつ、DB session相当の失効を保証しない。

## 9. Data Flow

[architecture](../architecture.md)の図と§46を正本として参照する。メール＋パスワードまたはGoogle → Devise/Warden → 暗号化Cookie session → requestごとにUser取得 → 本人のDot scope → DB。UIの認証stateは表示用で、既存localStorageを本人性の根拠にしない。

## 10. Files to Change

本Plan、TASK-001/005、product、journaling、architecture。機能コード・設定・lockfileは変更しない。過去のCurrent Stateは保持する。

## 11. Libraries / APIs

設計採用はDevise、OmniAuthとGoogle用strategy、Rails CookieStore/CSRF。具体的なGem versionとAPI-onlyへの統合はTASK-006で検証する。devise_token_auth、JWTによる通常API認証、DB session、Cognito SDKは追加しない。

## 12. Alternatives Considered

過去比較は§17–39。今回の比較と採用理由は§45。外部IdP + DB sessionの再採用や、明示的アカウント連携は今回実装しない。

## 13. Risks / Things to Watch

CookieStoreのコピー済みCookie再利用、パスワード再設定を使ったGoogle専用Userへの認証手段追加、email一致の自動統合、確認前のDot利用、API-onlyでのCSRF欠落、tokenのログ漏えい、旧利用者のbrowser cacheを重点確認する。未決定の仕様や未実証の安全性を確定扱いにしない。

## 14. Verification

文書の経路と状態をA/B/未認証/期限切れ・コピー済みCookie・認証失敗で机上確認する。相対リンク、旧方式の現行文書への残存、TASK ID/状態、過去Current State、変更範囲、空白を検証する。文書のみのため認証実機試験/buildは行わない。今回はpushせず、アプリコードに変更がないため型検査・アプリtestは再実行しない。認証の実機検証はTASK-006/007/015へ渡す。

## 15. Definition of Done

この文書更新は初期案と既存仕様の境界、一次資料、差分/リンク/机上検証までを対象とする。TASK-001全体は4完了条件と必要な判断が揃うまでDoneにしない。具体期限、確認・復旧の細部、衝突時UX等は§48へ残す。

<details>
<summary>過去の比較・作業記録（§16–44。現行設計には適用しない）</summary>

§40–44はDevise切替前のローカル更新途中の記録。§44のPR更新・検証は当時未完了であり、今回の実施結果は§49を参照する。

## 16. Completion Record

- 状態: In progress（2026-09-21）。人間による方式・成立条件・期限/失効範囲の判断待ち。
- 実施内容: 本人確認6案、アプリ資格情報3案、配信3構成を比較。推奨構成、Userの正本、資格情報経路、脅威対策、2人/未認証/失効の操作表、後続への論点を作成した。
- 計画との差異: なし。認証コード・dependency・設定・現行仕様は変更していない。変更は本PlanとTASK-001/005のみ。TASK-005への追加は未確定資料の参照で、契約作成や状態変更ではない。
- 開始確認: `git status --short --branch`、`git branch -vv`、`git log -6 --oneline`、`git ls-remote origin refs/heads/main`でmainと最新マージ済み状態を照合。最初のls-remoteはsandbox内のDNS解決で失敗し、読み取り専用の再実行で一致を確認した。
- 机上検証: §9のCookie/OIDC code/server token/DBの経路を§20–21と照合。§22のA/B/未認証/失効と5操作を追跡し、所有権・資格情報・失効の境界を説明できることを確認した。成功後の応答喪失・logout失敗・受理済み処理・遅延responseも区別した。
- 独立レビュー: AGENTS.mdに従い別AIへ設計レビューを依頼。両領域のsecurity指針・関連仕様と照合し、LGTM（Critical / High / Mediumの修正必須指摘なし）。認証/session/配信の分離、所有者境界、失効・応答喪失・利用者切替、未承認と後続タスクの境界を確認した。これは設計資料への評価であり、実装の安全性やprovider適合性の証明ではない。
- 機械検証: Pythonで変更3文書の相対リンク/見出しリンク18件、Planの24節、タスク16件のID/パス/依存節の維持、TASK-001以外の状態不変を確認。追跡済みdiffがTASK-001/005だけであることとindex不変を確認した。
- 空白検証: `git diff --check`、新規Planへの`git diff --no-index --check -- /dev/null docs/implementation-plans/2026-09-21-task-001-identity-design.md`を通過。
- 差分確認: 認証設計の範囲、他人のデータ参照、失敗・中断・再試行、未承認の境界、架空のdomain/主体だけを使っていることを確認。秘密情報や実利用者データを記載せず、`.worktrees/`に触れていない。コミット・push・PRは未実施。
- 未実施: アプリtest/build、実providerのcallback/失効試験、配信・browserのCookie/CSRF/CORS試験。文書のみで、採用provider/domainも未決定のため。実動作の証跡はTASK-006/007/015等で取得する。
- 次の作業: 採用判断後にproduct/journaling/architectureへ確定内容を反映し、TASK-005へ確定条件を渡す。新たにBlocked解除できる後続はない。依存なしのTASK-002/003/004は従前どおり比較検討に着手可能であり、今回実施していない。

### TASK-001完了条件ごとの結果

| 条件 | 結果 | 根拠 / 残作業 |
| --- | --- | --- |
| 認証方式・正本・開始/終了/失効を決定し、人間が理由を確認 | 未完了 | §17–20に推奨案。§24の人間判断と配信/providerの成立条件が未確定 |
| 選択肢を配信・脅威・運用負荷で比較 | 完了 | §17–21の比較表・理由・脅威表。一次資料を参照し、構成の推奨は設計上の評価として区別 |
| 採用方式の資格情報、CSRF/CORS、認可境界を明文化 | 未完了（案の明文化済み） | §9/20–22に具体案と机上検証。方式未承認のため「採用方式」としては未完了 |
| product/journaling/architectureへ決定反映しTASK-005へ渡す | 未完了（論点の引継ぎ済み） | TASK-005から§23への参照を追加。正本仕様の更新と確定契約への引継ぎは承認後 |

TASK-001をDoneにしていない。必要な検証2項目（主体の説明、経路図と脅威レビュー）は提案に対する机上確認として実施し、採用承認や稼働試験の代替にはしていない。

## 17. 認証手段と利用者識別の比較（未承認）

以下の§17–39は2026-09-21〜22の検討履歴。現在の採用条件は§40以降を優先する。

「CookieかIdPか」は二者択一ではない。本人確認の手段、ログイン後の資格情報、配信構成を別々に選ぶ。以下の負荷は現行のSPA/Rails/PostgreSQLを前提とする設計評価で、providerの見積りや実測ではない。

| 本人確認の選択肢 | 利点 | 欠点・主な脅威 | 運用負荷・適用条件 | 評価 |
| --- | --- | --- | --- | --- |
| 管理型IdPのhosted login + OIDC | パスワード・MFA・復旧処理をサービスに任せられる。Railsは検証と対応付けに集中できる | IdP障害・アカウント乗っ取りの影響、利用条件・費用・移行制約。アプリの認可は自前で必要 | 中。登録、redirect管理、鍵更新、費用監視、復旧案内、障害対応が残る | 推奨候補。料金・利用対象・復旧手段を確認して1 providerに絞る |
| 特定のsocial IdPへ直接OIDC接続 | 利用者が既存アカウントを使える。仲介サービスを減らせる | そのアカウントを持てない利用者を除外。provider固有の審査・停止・復旧に依存 | 中。対象者がそのIdPを使えるなら有力 | 対象者が未確定なので一律採用しない |
| Railsでメールmagic link / OTP | アプリ用パスワード不要。social accountを要求しない | mailbox乗っ取り、リンク転送・漏えい、再利用、OTP総当たり、メールscannerによる誤消費 | 中〜高。配送・遅延・spam対策、期限・一回使用・rate limit・復旧窓口が必要 | 外部IdPを避けたい場合の有力代替。運用者がメールと不正利用対応を引き受ける |
| Railsでメール + パスワード | UXとアカウント方針を自分で管理できる | password再利用、総当たり、漏えい、復旧経路の悪用 | 高。安全なhash、リセット・検証メール、MFA、監視・インシデント対応 | 小規模MVPでは責務が重い。自主管理要件がある場合に再検討 |
| Passkeyを直接管理 | フィッシング耐性を期待でき、日々の入力が少ない | 端末紛失、複数端末・復旧設計、対応環境で利用差がある | 中〜高。WebAuthn検証、credential lifecycleと復旧が必要 | 初回から自前で導入せず、IdP側対応を選定条件にできる |
| 匿名の端末ID / localStorage UUID | 登録操作がない | 改ざん・端末共有・消去・紛失で本人性や復旧を保証できない | 当初は低いが、本人への帰属・移行対応が難しい | server保存の本人限定条件に不適。認証方式として採用しない |

Passkey案の技術的な前提は、origin/RPに結び付いた公開鍵credentialを扱う[W3C WebAuthn](https://www.w3.org/TR/webauthn-3/)を参照。ここでの比較は認証手段の分類であり、利用者端末での成立性を検証したものではない。本文の外部資料は2026-09-21に確認した。

### 内部の利用者識別

推奨はアプリDBの不変な`User UUID`。外部IdPを使う場合は検証済みの`(issuer, subject)`をそのUserへ一意に対応付ける。Dot等はUser UUIDに紐付け、メールアドレス・表示名・browserのIDを所有権に使わない。OIDCはissuer内でsubjectを識別子として扱う。根拠: [OIDC Core §8](https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes)。

- `sub`単独では異なるissuerの利用者を区別できない。emailは変わり得るため、同じemailというだけで既存Userに結合しない。
- 初回ログインは検証完了後に対応とUserを一体で作成し、一意制約で同時callbackによる重複Userを防ぐ。失敗時は認証済みにしない。
- issuerはサーバー設定の許可先に固定し、request任意のissuer / discovery URLを使わない。IdP移行や複数identityの紐付けは別の本人確認を伴う変更とし、MVPに自動統合機能を加えない。
- 削除後の再登録、外部identity対応の保持、停止されたUserの扱いはTASK-002と整合させる。旧Dotをemail一致で復元・再帰属させない。

## 18. アプリ資格情報の比較（未承認）

Cookieは送信手段、sessionはログイン状態、JWTはtoken形式であり、混同しない。Cookie内のtokenもbrowserが自動送信すればCSRF対策が必要になる。

| 案 | 利点 | 欠点・脅威 | 運用負荷 | 評価 |
| --- | --- | --- | --- | --- |
| 推測不能な識別子のHttpOnly Cookie + DB session | JSから資格情報を読み出せず、serverで期限・logout・強制失効を一元管理できる | Cookie送信にはCSRF対策が必要。XSSによる本人操作までは防げない。DB停止時は利用停止 | requestごとのDB確認、期限切れ掃除、失効運用。既存PostgreSQLを使える | 推奨。session用の別サービスを増やさず、失効を説明しやすい |
| Rails CookieStoreのみ | server session tableが不要で構成が小さい | コピー済みCookieの個別失効はbrowserでのCookie消去だけでは保証できない | logout/停止を保証するにはversion照合や失効表等が必要になる | CookieStore自体が危険という意味ではないが、今回の失効要件にはDB照合が明快 |
| SPAがBearer access tokenを保持してAPIへ送信 | 自動Cookie送信に依存せず、別サイトAPIや将来のnative clientと相性がよい | XSSで読み出し/悪用され得る。更新token、再読込、失効、audience・鍵管理が複雑 | 中〜高。短命token + refresh rotation/再認証、必要に応じ失効確認 | 別サイトを固定する必要がある場合の代替。現在のWebだけなら利点が小さい |

署名JWTの期限内失効には別の確認・失効機構が必要。opaque Bearer tokenならserver照合を選べるが、JS保管の問題は残る。tokenをlocalStorageへ置く案はfrontend規約に反する。Cookie replayとserver側状態の検討根拠: [Rails Security Guide §3.5](https://guides.rubyonrails.org/security.html#replay-attacks-for-cookiestore-sessions)。

## 19. 配信構成の比較（未承認）

originはscheme/host/portの組み合わせ。same-siteでもcross-originにはなり得る。repositoryが同じことや、Web/APIを別々にdeployすることだけではbrowserからのoriginは決まらない。

| 配信構成 | 資格情報・CSRF/CORS | 利点 | 欠点・運用負荷 / 評価 |
| --- | --- | --- | --- |
| `https://app.example.com`でSPAと`/api/v1`・認証経路をpath分岐 | host-only Cookie、same-origin fetch。Web→APIのCORS許可は不要。変更操作にはCSRF token + Origin検証 | browserの境界が単純。Web/APIは内部で別deployを維持できる | reverse proxyの経路、TLS、Cookie転送、cache除外、SPA fallbackの誤適用を管理する。推奨 |
| `https://app.example.com`と`https://api.example.com` | 同一siteだが別origin。API host-only Cookie + `credentials: include`、厳密なorigin allowlist、credentials許可、CSRF | 配信先を分けやすく、first-party構成を維持できる | preflight、環境別allowlist、兄弟subdomainへの警戒が増える。次点。Cookieを親domainへ広げる必要はない |
| `https://app.example.com`と`https://api.other.example` | cross-site Cookieでは`SameSite=None; Secure` + credentials/CORSが必要。third-party Cookie制限を受ける | 配信サービス既定domainをそのまま使える | browser差が大きく、Cookie方式の既定案にしない。同一origin proxy / 独自domainへ寄せるか、Bearer案を再比較 |

credentials付きCORSでは`Access-Control-Allow-Origin: *`を使わず、許可した実originを返す。CORSはserver認証でもCSRF防御でもなく、直接HTTP clientからの呼出しを認可しない。third-party Cookie制限はCORSの許可だけでは解除できない。根拠: [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)。

### 推奨案を採用できる配信条件

- 同一originのreverse proxyが認証callbackと`Set-Cookie`を扱え、API/認証経路にSPAのindex fallbackを適用しないこと。
- 本番HTTPS、信頼するproxy/Hostの固定、API/認証responseの`Cache-Control: no-store`とCDN cache bypassを確認する。Cookie付き個人responseを共有cacheへ置かない。
- developmentは同一originのlocal proxyを候補にする。stagingは本番と同じHTTPS構成で確認する。previewから本番APIへのcredentials許可、wildcard callback登録を行わない。
- deploy先、実domain、proxy機能、IdP callback許可が未提示のため、成立を実証したとは扱わない。現行`assume_ssl`設定は配信構成の実在を証明しない。

## 20. 推奨案の振る舞いと運用（すべて未承認）

**同一origin + 管理型IdPのhosted login/OIDC + RailsのDB session + アプリ内部User UUID**を第一候補とする。理由は、日記データの所有権と失効をアプリ内で管理しながら、パスワード・復旧機構の自主管理を減らせるため。既存のRailsとPostgreSQLを利用し、新しいBFFサービスは増やさない。Railsがbrowser向けの認証境界も担う。

### 認証の開始

1. 実サービスでは録音開始前にログインを要求する案。録音後の認証遷移による未保存音声の扱いを増やさない。Home・説明は公開できる。現行mockの挙動は今回変えない。
2. RailsがCSRF検証した開始操作から一回限りのOIDC取引を作り、IdPのhosted loginへtop-level redirectする。戻り先は許可したアプリ内pathだけにする。
3. Authorization Code Flow + PKCE S256を使い、Rails callbackで取引Cookieとstateを照合し、codeをserver間で交換する。署名、許可algorithm、issuer、audience、期限、nonce、必要時のazp/auth_timeを検証する。失敗・キャンセル・期限切れ・code再利用でsessionを発行しない。根拠: [OIDC Core §3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)、[RFC 9700 §2.1.1](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1.1)。
4. 対応するUserを確定し、新しいsession識別子を発行する。既存の匿名/認証session識別子を引き継がず、旧取引を消費する。再試行は新しい認証取引から始め、完了済みcallbackを再利用しない。

### sessionの正本・有効期限・失効

- Cookie案は`__Host-fod_session; Secure; HttpOnly; SameSite=Lax; Path=/`、`Domain`なし。内容は十分な乱数のopaque識別子。DBにはそのdigestとUser参照、発行・最終利用・失効・期限の情報を持つ。Cookieの`__Host-`制約の根拠: [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)。
- **暫定推奨値**: idle 30分、絶対12時間、ログイン取引5分。長期「ログインを保持」はMVPで導入しない案。これは標準の強制値ではなく、共有端末での日記露出を抑えるための提案。毎日の再ログインと長い録音中の失効がUX上の代償になる。値は人間の判断が必要。
- 期限はserverで評価し、Cookieが残っていても失効後は拒否する。User停止とsession失効をrequestごとに確認し、DB障害時は認証を通さない。認証済みと未認証のUI判断をlocalStorageから復元しない。timeout/失効管理の根拠: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#session-expiration)。
- 起動・再読込時は認証状態を「確認中」にし、server確認前に個人データを表示しない。401時は保護操作を止め、認証状態変更をTASK-014のデータstate管理へ通知する。ネットワーク障害/5xxを401と同一扱いせず、状態不明として保護画面を閉じて確認を再試行する。
- ログアウトはCSRF保護した変更操作で**現在のアプリsession**をDBで失効し、Cookieを消す。成功応答前にserver失効を確定する。二重logoutは安全に完了できる契約とする。
- logout通信失敗では画面の個人データを隠しても「serverでログアウト済み」と断定しない。再送して失効を確認するまで利用者切替を開始しない。遅延したlogout応答が新session Cookieを消す競合も防ぐ。複数tabには状態変化を通知し、再表示時に再確認する。
- IdPのログアウト/アカウント停止とアプリsession失効は別。通常logoutで他のIdP利用サービスまでログアウトしない。アプリ全sessionの失効は運用可能にするが、管理画面追加は求めない。
- IdP停止を即時反映する保証は、この基本案にはない。既存アプリsessionは期限まで残り得る。即時反映が必要ならproviderの署名付きlogout/停止通知等を選定条件に加え、失敗・再配達まで設計する。OIDCログインだけで即時連動すると約束しない。
- logout後の入り直しは利用者の明示操作から行う。共有端末でIdP SSOが前利用者を自動再認証し得るため、推奨案では`max_age=0`と`auth_time`検証による再認証を要求し、切替時には対応providerのアカウント選択も使う。これに対応するproviderかを選定時に確認する。再認証とアカウント選択は別の要件として扱う。

### CSRF・認可・失敗の境界

- Cookieを使う変更操作は、sessionに結び付けたCSRF tokenをheaderで送りserverで検証し、許可Originとも照合する。token取得は同一originで読み出しを制限しcacheしない。Originがないrequestの扱いも契約化し、少なくとも無条件に許可しない。
- 通常のGETはDot等を変更しない。OIDC GET callbackは例外としてその経路だけを通常CSRF tokenの対象外にし、上記の取引・state/nonce/PKCE検証で保護する。`SameSite=Lax`でtop-level GETの戻りを使う案なので、providerがform_postしか提供しない場合は再設計する。
- SameSiteやCORSだけに頼らない。API-only RailsにはCookie/session/CSRFの組込みを明示的に追加・試験する必要がある。根拠: [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#samesite-cookie-attribute)、[Rails API-only Guide §4.4](https://guides.rubyonrails.org/api_app.html#using-session-middlewares)。
- 保存はserverが確定したUserを所有者にする。取得・更新・削除は必ずそのUserのscopeからresourceを検索し、owner/user IDの入力で変更できないようにする。本人以外/存在しないIDは同じ404相当、未認証/失効は401相当を候補とし、正確なschema/statusはTASK-005で確定する。
- 一覧の件数・cursor、音声・生成結果・処理ID・storage key、採用時のJobにも同じ所有者境界を渡す。UUIDが推測困難でも認可を省略しない。実際の更新操作・削除手段をこのPlanでは追加しない。
- 失効後に認証判定するrequestは拒否する。失効前に受理済みの保存/生成までlogoutで必ず取り消せるとは約束しない。受理時のUserを固定し、Bへ付け替えない。中断・結果不明・再実行はTASK-003/005で扱い、再ログイン後に自動で再送しない。削除とJobの競合はTASK-002/003へ渡す。

### 運用の担当境界と選定条件

| 担当 | 必要な作業 |
| --- | --- |
| IdP | 本人確認手段・MFA・資格情報管理・アカウント復旧を提供。どこまで標準契約に含むか確認 |
| アプリ運用者 | identity対応とUser停止、全session失効、秘密/鍵の管理、session期限切れ掃除、ログの最小化、依存の更新 |
| 配信運用者（兼任可） | TLS、reverse proxy、API cache bypass、正しいHost、環境別callback、API直接公開経路にも認証を適用 |
| 問合せ対応 | IdP側復旧へ案内。email一致だけで過去データを移さない。停止・侵害時はアプリsessionも失効させる |

IdP未選定のため、MAUとMFA/メール送信等の課金、予算上限、利用可能なログイン手段、復旧/退会、保存地域・認証ログ保持、データexport/移行、障害時の対応を確認してから選ぶ。音声やDotをIdPへ送らなくても、識別子・IP・ログイン時刻等のデータは扱われる。既存の契約・利用対象が不明なため、特定vendorを採用済みにせず、価格や適合性を推測しない。

IdP停止時は新規ログインを止め、localStorageや仮Userで代替しない。既存sessionはアプリ側の有効性条件内で継続可能とする案。session DB停止はAPIを安全なエラーで拒否する。鍵更新時は許可issuerのJWKSを検証し、不明な鍵を信頼せず、取得障害を観測する。

## 21. 脅威と対策の机上レビュー

| 脅威・故障 | 推奨案での対策 | 残る限界・後続での確認 |
| --- | --- | --- |
| AがBのDot IDを送る / user_id差替え | 認証Userのscope、所有者入力を許可しない、存在を明かさない応答 | 全endpointと関連resourceに必要。TASK-006/008/009/013/015で実証 |
| 悪意のあるサイト・兄弟subdomainからの操作 | host-only Cookie、CSRF token、Origin、OIDC取引の一回使用 | same-siteでも安全とは限らない。直接APIも認可検証 |
| XSSによるsession窃取・本人操作 | HttpOnly、tokenをJSへ返さない、HTMLを安全に表示、CSP/外部scriptの制約 | HttpOnlyでも本人としてのfetchは可能。CSPだけでXSSが解消するわけではない |
| session fixation / replay | 認証成功時に新識別子、server失効・期限、TLS、DBにdigest | 盗難Cookieは有効中に悪用され得る。疑い時の一括失効が必要 |
| OIDC code差替え・取引混同・再送 | PKCE、state、nonce、issuer/audience/署名検証、callback固定、取引消費 | 採用libraryとproviderを組み合わせた試験は未実施 |
| email再利用 / IdP移行による乗っ取り | `(issuer, subject)`対応、不変User UUID、自動account linkなし | provider/client変更でsubjectが変わる場合は移行の本人確認が必要 |
| 共有端末でAのデータをBへ表示 | 認証切替通知、state/cache消去、旧response無視、再表示時確認 | TASK-014が未実装。旧fod.session.v1をserver履歴として扱わない。消去方針はTASK-002 |
| CDN / browser cache / ログ漏えい | 個人APIはno-store、API/認証経路をCDN cache対象外、header/query/bodyの記録制限 | Rails parameter filterだけではproxy・監視・SQLログを覆えない。実配信で確認 |
| login連打・外部AI費用の濫用 | 開始/callback/APIのrate limit・容量制限、ログに秘密を出さず異常数を観測 | 認証済みでも濫用は可能。生成の具体制限はTASK-003/009 |
| logout失敗・期限切れ・処理中の切断 | server失効確認、未知状態の表示、利用者固定、自動再送禁止 | 受理済み処理を取消す保証はしない。TASK-003/005の結果確認・冪等性と整合が必要 |

## 22. 必要シナリオの机上検証

すべて「推奨案を採用した場合の期待結果」であり、実装試験の成功記録ではない。A/Bは架空の利用者、DA/DBは各人のDotを表す。

| 主体 / 状態 | 保存 | 一覧 | 詳細 | 更新（採用された操作のみ） | 削除（採用された手段のみ） |
| --- | --- | --- | --- | --- | --- |
| Aの有効session | serverがA所有を設定 | AのDotのみ、件数/cursorもA scope | DAのみ取得 | DAのみ変更 | DAのみ対象化 |
| Bの有効session | serverがB所有を設定 | BのDotのみ | DBのみ取得 | DBのみ変更 | DBのみ対象化 |
| AがBのID/ownerを指定 | owner差替え拒否、B所有で保存不可 | B scopeへの切替不可 | DBは不存在と同等の拒否 | DB不変 | DB不変 |
| 未認証・任意のlocalStorage ID | 認証拒否、副作用なし | 認証拒否、個人情報なし | 同左 | 同左 | 同左 |
| 期限切れ / logout済みCookieの再送 | 新規requestを認証拒否 | 認証拒否 | 同左 | 同左 | 同左 |
| A処理中にlogoutしBで入り直す | 受理済み処理の所有者はAのまま | BはB scopeだけ | Aの遅延responseをUIに適用しない | BはDAを変更不可 | BはDAを削除不可 |

表は認証判定時を境界に追跡した。Webで操作を隠すだけでなくAPI直接呼出しでも同じ結果が必要。A/Bのsessionを分離してログインし、同じemailやURL IDを送っても主体が変わらない構造にする。offline/5xxや保存成功後の応答喪失では結果を未確定として扱い、他のUserで再送しない。

追加の検証条件:

- CSRF token欠落/不正、未許可Originは変更なし。認証callback以外のGETでlogoutやDot変更をしない。
- callbackキャンセル、state/nonce不一致、期限切れcode、code再利用、誤ったissuer/audience、未知の署名鍵はsession発行なし。
- logout成功後はコピーした旧Cookieでも拒否。logout応答喪失では再送が可能。Aの古い応答はBのUI/stateへ入らない。
- IdPだけをlogoutした場合とアプリlogoutを区別する。IdP停止がアプリへ即時伝播しない限界を表示・運用の判断に含める。
- ブラウザ再読込、複数tab、戻る操作、API cache、期限境界、同時callbackはTASK-006/007/014/015で実確認する。今回の机上検証だけでこれらを通過済みにしない。

## 23. TASK-005と関連タスクへの引継ぎ（未確定）

| 引継ぎ先 | 認証側から渡す条件・確定すべき項目 |
| --- | --- |
| TASK-005 | 認証開始/callback/状態確認/logout/CSRF取得のmethod・path・request/response/error、Cookie属性・期限、CSRF header、配信origin、401/403/404/5xxの意味、cache制御、戻り先許可、logout再試行、互換性。OIDC tokenをDot API用Bearerとして受けない境界 |
| TASK-005 | ownerはserver決定、他人/不存在の応答統一、一覧cursor/関連resourceのscope、認証切替後の古いresponseを捨てる契約。受理済み処理と失効後requestの境界、再ログイン後の結果確認と自動再送禁止をTASK-003と調整 |
| TASK-002 | User/identity/session情報と旧fod.session.v1の保持・消去、本人からの削除要求、再登録/削除後の復元禁止、録音中の失効時に残る一時データ。具体期間・画面は今回決めない |
| TASK-003 | 受付時のUserを固定し、生成/Job/再試行で所有者を変えない。logoutを生成取消しと混同しない。削除・中断・冪等性は同タスクで決定 |
| TASK-006 | API-onlyへのCookie/CSRF組込み、OIDC libraryとproviderの適合検証、User対応・session DB・失効・認可主体の提供、rate limit/ログ/秘密管理 |
| TASK-007 / TASK-014 | 認証確認中/未認証/有効/失効/状態不明のUI制御と通知 / 個人state・cache・旧保存値・遅延responseの管理。認証と消去の実装を同じものとして扱わない |
| TASK-015 | 実配信 + 採用IdP + 2人のテストidentityで、Cookie/CSRF/CORS、失効、API直接呼出し、cache/ログを横断検証 |

TASK-005へは確定契約ではなく、この比較資料と論点を渡す。TASK-001の承認とTASK-002〜004の決定が揃うまでTASK-005のBlockedを解除しない。TASK-006/007も着手条件未充足。

## 24. 人間に判断を求めた項目（過去の記録）

1. **構成の選択**: 推奨の「管理型IdP + Rails DB session + 同一origin」を軸に進めるか。メール配送・復旧を自主管理したい場合は「Railsのmagic link/OTP + 同じDB session」を有力代替とする。
2. **配信・IdPの成立条件**: 使いたい配信先/domain、利用者に許容するログイン手段、IdPの費用・復旧・データ取扱いの条件。未提示なのでproviderや契約を決めない。既存social account必須にするなら対象者への影響も判断する。
3. **利用開始・期限・失効**: 録音前ログイン、idle 30分/絶対12時間、明示的な再認証、現在sessionのlogout、IdP停止の即時連動を基本案では保証しない範囲を許容するか。

これはユーザーの個別指示、[TASK-001完了条件](../tasks/TASK-001-identity-design.md#確認可能な完了条件)、AGENTS.mdに従う設計判断待ちであり、ファイル編集や認証実装の許可を求めるものではない。採用判断後も認証コードは今回の範囲外。判断が揃ったときにのみproduct §5、journaling §4–5、architectureへ決定を反映し、TASK-001の完了を確認する。

## 25. 追補の作業方針（2026-09-22）

- 要件: ユーザーが第一候補とした責務分担を前提に、同一origin配信の具体的方法、IdPのOIDC/MFA/passkey/削除/料金/障害、ログイン手段の優先順位、local開発のproxy/Cookie/CSRFを2〜3案で比較する。
- 範囲: 設計提案と本Plan・TASK-001の進捗更新。機能コード、配信設定、provider登録、課金、API契約実装、コミット・push・PRは対象外。§4の過去のCurrent Stateは更新しない。
- 開始状態: `main`、HEADとリモートmainは引き続き`4b5365b17437df07f52620edd0ecb98cbe0eaf47`。前回作成したTASK-001/005と本Planの差分、および既存`.worktrees/`を保護する。
- 方針と理由: 配信とIdPは独立して差し替えられる軸として各3案を比較し、最終的に小規模チーム向けの組み合わせを1つ推奨する。無料枠だけで比較せず、MFA・メール・サポート・運用責務も含める。
- 調査: 現在の公式料金・技術資料を確認し、仕様上可能なことと、実環境で未検証のことを分ける。必要な差分のみレビューし、リンク・空白・タスク状態を確認する。
- 承認の範囲: 「第一候補として進めたい」は、特定のhosting/IdP、30分/12時間の期限、ログイン手段やMFA必須化の承認には拡張しない。TASK-001はIn progressのまま。

## 26. 具体的な同一origin配信の3案

この比較時点の評価は§33–39へ進み、2026-09-24に§40のAWS東京構成を採用した。以下のH1「第一推奨」は過去の案であり、現行MVPには適用しない。

以下は2026-09-22時点の公式資料に基づく設計提案で、deploy済み構成ではない。各案ともbrowserの入口を`https://app.example.com`に揃える。IdPのログイン画面は別originでよく、top-level redirectで利用する。「同一origin」はReactとRails APIの間の話である。

| 案 | 具体的な配信方法 | 利点 | 負担・制約 / 評価 |
| --- | --- | --- | --- |
| H1: RenderにRailsとReact成果物を同梱 | build時にViteの`dist`をRailsのrelease内`public`へコピー。Renderの有料Web Service 1つで静的ファイルとRails APIを公開。有料Render PostgresにUser/session/Dotを保存 | 公開サービスが1つでproxy設定を増やさず、同じreleaseに揃えられる。小規模チームで調べる箇所が少ない | Webだけでもreleaseが必要。障害時は画面/APIが共に停止し得る。海外regionの許容が前提。第一推奨 |
| H2: VercelでReact、RenderでRails | Vercelのexternal rewriteで`/api/*`と`/auth/*`をRenderのRailsへ転送。残りをVite静的配信にする。browser URLは変わらない | Web/APIを独立deployでき、静的配信・previewを利用しやすい | 2社の経路・cache・Host・Cookie・timeoutの確認が必要。Rails障害時に画面が出ても個人操作は不可。Webの独立deployが必要になった時の次点 |
| H3: AWSのCloudFrontで経路を分ける | CloudFrontのdefault behaviorをprivate S3のReact成果物へ、`/api/*`と`/auth/*`をALB→ECS FargateのRailsへ。RDS PostgreSQLを使う | AWSへ集約でき、regionalなAPI/DBを東京に置く案を選べる。詳細な制御が可能 | IAM、VPC、ALB、ECS、RDS、CloudFront、証明書と監視の運用が増える。既にAWS運用経験や地域制約があるチーム向け |

H1のRails/Postgres配信は[Render公式Rails guide](https://render.com/docs/deploy-rails-8)を土台に、React成果物を同梱する本プロジェクト向けの提案。Node buildとRuby runtimeを分けたDocker multi-stage buildも候補で、repositoryの`apps/web`と`apps/api`の分離は維持できる。RailsでReactのSSRを行う案ではない。

H1で必要な経路の責務:

```text
https://app.example.com
  /assets/*       → Viteのhash付き静的ファイル
  /api/v1/*       → RailsのJSON API（sessionと所有者を検証）
  /auth/*         → Railsの認証開始・callback等（pathは契約で確定）
  /up             → health check
  /record等       → SPAのindex.html → TanStack Routerが画面を選ぶ
```

SPA fallbackは画面向けGET/HEADだけに限定する。存在しないAPI・認証経路・assetをindex.htmlへ変換しない。hash付きasset以外のindex.htmlは更新を再確認し、個人API・認証responseは`no-store`にする。古いtabと新しいRailsの互換性は、同じreleaseでも必要。

H1の本番は無料Web/無料DBを前提にしない。[無料Render Postgresは30日で期限到来](https://render.com/docs/free)する。料金は有料Web + 有料DB + DB storage/backup・通信等 + IdP + メール + domainで見積もる。[料金表](https://render.com/pricing)のcompute金額は今回の取得結果では確認できず、正確な合計を断定しない。[region一覧](https://render.com/docs/regions)にはSingapore等があり、日本は掲載されていない。日本国内のみの保管が必要ならH1をそのまま採用しない。

H2は[external rewrites](https://vercel.com/docs/routing/rewrites)で成立する。API/認証のrewrite cacheを明示的に無効化し、Cookie、Set-Cookie、CSRF header、callback query、公開Hostの受け渡しを検証する。現行資料の[proxy timeoutは120秒](https://vercel.com/docs/limits#proxied-request-timeout)。音声upload/生成の応答時間はTASK-002/003と照合し、この数字を理由に非同期化や直uploadを先に決定しない。Functions経由にする場合の制限とexternal rewriteの制限も混同しない。商用利用では[Hobbyの個人・非商用条件](https://vercel.com/docs/plans/hobby)に依存せず、適切な有料プランを見積もる。

H3はAPI/認証behaviorをCachingDisabled相当（TTL 0）にし、全必要method・query・Cookie・CSRF/Origin等のheaderをRailsへ届ける。S3は静的ファイル専用でCookieを送らず、OACで非公開にする。CloudFrontの[Cookie転送](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Cookies.html)と[cache policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-understand-cache-policy.html)を個別確認する。APIの404をSPAに変える全体error fallbackは使わない。Rails/DBを東京に置いても、CDNや認証を含む全データの国内限定を自動的に保証するわけではない。

全案共通で、音声をどこへ送るかは未確定。音声・Dot本文・認証Cookie・callback codeを配信サービスのaccess logや監視へ出さない。公開Hostを固定し、origin直アクセスでもRailsの認証・認可を必須にする。

## 27. IdP候補の3案

RailsをOIDCのclientとして登録し、Authorization Code + PKCEでログインする。ReactはRailsの認証状態だけを利用する。Google/Appleを追加しても、Railsが直接それぞれのtokenを管理する経路は増やさず、原則として選んだIdPのsocial connectionを通す。

| 観点 | I1: Auth0 | I2: Amazon Cognito User Pools | I3: Logto Cloud |
| --- | --- | --- | --- |
| OIDC | Universal Loginとserver向けCode Flow。RailsはRegular Web Applicationとして接続 | Managed LoginとOIDC issuer。confidential app client + Code Flow/PKCEを使う | OIDCを中心とするhosted login。Traditional Web applicationとして接続 |
| MFA / passkey | database connectionにpasskey。Pro MFAはEssentials以上。passkeyを第一要素にする機能とWebAuthnを追加要素にする機能・契約を区別 | TOTP等のMFA。Essentialsにpasskey/メールOTP。passwordless/MFA必須の組合せに制約あり | Proにpasskey sign-in。MFAはTOTP/passkey等の追加料金。必須/任意等を設定できる |
| ユーザー削除 | Management APIの`delete:users`でtenant内Userを削除できる | `AdminDeleteUser`をIAMで許可したbackendから実行できる | Console/Management APIでUserを削除できる |
| 費用の目安 | B2C月払い、500 MAUのEssentialsで$35/月。Freeは25,000 MAUでもPro MFAを含まない | Essentialsはdirect/socialで10,000 MAUの無料枠、超過$0.015/MAU。メール/短信は別課金 | Pro $24/月 + MFA $48/月 = $72/月を基本例にする。token使用量等の追加課金あり |
| 障害・支援 | EssentialsはStandard Support。99.99% SLAは料金表上Enterprise。低価格プランに同等保証があるとは扱わない | region単位の障害・SES障害を考慮。料金表は99.9% SLAを掲示。SLAは無停止の保証ではない | SLA/Premium SupportはEnterprise。Proを選ぶなら通常支援と障害連絡・復旧条件を確認 |
| このMVPでの評価 | 第一推奨。hosted UI、MFA、開発/本番分離を有料プランでまとめて評価しやすい | コスト優先かAWS経験があるなら有力。ただしメールOTP + MFAやsocial利用者のMFA条件に合わせてログイン案を変える必要がある | OIDCとUIの明快さが利点。ただしMFA込みではこの500 MAU比較でAuth0より高い。組み込み適合性・運用支援を見て選ぶ |

MAUは月間active利用者。金額は2026-09-22確認のUSD表示で、税・為替・メール・SMS・独自domain・ホスティング・超過料金等を含む総額ではない。年間契約割引やstartup特典は前提にしない。

- Auth0: [料金](https://auth0.com/pricing)、[Code Flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow)、[MFA factors](https://auth0.com/docs/secure/multi-factor-authentication/multi-factor-authentication-factors)、[passkey](https://auth0.com/docs/authenticate/database-connections/passkeys)、[User管理API](https://auth0.com/docs/manage-users/user-accounts/manage-users-using-the-management-api)。実際に必要なTOTP factorの契約権利は採用tenantでも確認する。公開料金の「Pro MFA」と「Professionalプラン」は別名称。
- Cognito: [料金](https://aws.amazon.com/cognito/pricing/)、[OIDC issuerの説明](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html)、[Code Flow/PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html)、[MFA制約](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)、[AdminDeleteUser](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminDeleteUser.html)。RailsがCognitoへOIDC接続することと、Cognitoが外部OIDC providerを使う課金区分は別。後者は50 MAU無料枠など別条件がある。
- Logto: [料金](https://logto.io/pricing)、[追加課金](https://docs.logto.io/logto-cloud/billing-and-pricing)、[Traditional Web](https://docs.logto.io/quick-starts/traditional-web)、[MFA](https://docs.logto.io/end-user-flows/mfa/configure-mfa)、[User管理](https://docs.logto.io/user-management)。Proには50K tokenが含まれ、超過は100 tokenあたり$0.08。MAUだけで費用を比較しない。RailsのDot認可のためにLogtoの有料RBACを追加する必要はない。

各providerのquickstartはそのまま採用する実装仕様ではない。たとえば[Logto Ruby guide](https://docs.logto.io/quick-starts/ruby)にはSDKによる`offline_access`要求やGET logoutの例がある。採用時は§20の資格情報最小化・CSRF保護したlogoutと整合させ、汎用OIDC clientの選択も含めTASK-006で検証する。

### Cognitoで特に注意する組合せ

公式資料では、MFA必須のuser poolで第一要素にメール/SMS OTPを使えない。利用者確認付きpasskeyは`MULTI_FACTOR_WITH_USER_VERIFICATION`設定の例外があるため、「passkeyとMFAは一律に併用不可」とは整理しない。social federationでは第一要素・MFAを上流IdPへ委ねるため、Googleログインを選んだだけでFocus on DotがMFA完了を保証できるわけではない。[認証flowの説明](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html)

そのため、後述のメールOTP + TOTPを同じ体験で必須にする案をCognitoへそのまま移せない。採用するなら、ローカル利用者はpassword + TOTPまたは条件を満たすpasskey等へ変更し、social利用者にも必要な強度をどう保証するかを先に決める。

## 28. ログイン手段とMFAの優先順位

この節は過去の提案。現在はGoogle + メールOTPを提供し、MFAを必須にせず、passkey・運営者の手動本人確認をMVPへ含めない（§40）。

第一推奨は**メールで始められる入口を用意し、継続利用にはpasskeyを勧め、Googleを併設する**。Appleは対象者がiPhone中心と分かれば初回へ繰り上げる。入口を3つ一度に実装することは必須にしない。

| 優先度 | 手段 | このMVPでの理由・注意 |
| --- | --- | --- |
| 1 | メールOTP（届いた一回限りのcodeを入力） | 特定social accountを要求しない。magic linkの別browser・メールscannerによる挙動を避けやすい。メール遅延・spam対策・mailbox乗っ取りは残る |
| 1: 継続ログイン向け | passkeyを登録・利用する選択肢 | 毎回メールを待たずに端末の認証を使える。対応端末、紛失時の復旧、認証用domainの固定が必要。メールOTPと同じIdP Userへ登録する |
| 2: 初回公開で併設候補 | Google | 既存accountで開始しやすく、メール配送障害の影響を受けにくい入口。ただし上流Google障害は受ける。emailだけで既存利用者へ自動結合しない |
| 3 | Apple | Hide My Emailは個人性の高いサービスと相性がよい。一方でServices ID、key、domain、private relayの送信元登録、token失効などの運用が増える |

メールOTPとpasskeyを同一database connectionで扱う機能は[Auth0公式資料](https://auth0.com/docs/authenticate/database-connections/passwordless-authentication-for-db-connect)に記載されている。古いpasswordless専用connectionとdatabase connectionを無計画に併設せず、同一Userでのenrollment/recoveryを検証する。本番のメール送信provider、送信domain認証、配送制限も見積もる。Auth0の組込みメールは[試験用途向け](https://developer.auth0.com/resources/labs/authentication/passwordless-with-email)であり、外部IdPを使っても配送運用がすべて消えるわけではない。

### 個人性の高いデータに対するMFA方針案

**公開MVPでは、メールOTPやGoogleでのログインにIdP側のTOTPを追加する案を推奨する。** TOTPは認証アプリに出る一定時間ごとのcodeで、メールのcodeとは別の要素。初回の登録負担と端末紛失時の対応が増えるので、この必須化は利用体験を含む採用判断とする。運営者のIdP/配信/DB管理accountはMFA必須を前提にする。

Auth0のメールOTP・passkey・TOTPという個別機能は確認したが、**同一tenantのhosted UIでメールOTP → TOTP必須 → recoveryまで一連で成立することは公開資料だけでは確証を得ていない**。第一推奨はこの適合確認を条件とする。不成立なら、無断でMFAを任意に下げず、Auth0管理のpassword + TOTPへ入口を変えるか、別IdPを選ぶかを再判断する。

- passkeyは端末内のPIN/生体認証を伴う利用者確認を検証できる構成で評価する。「passkey対応」の表示だけで十分な認証強度やMFA完了と扱わない。初期はIdPのMFA既定動作を維持し、二重入力の省略は検証後の明示的判断とする。Auth0では[passkey後も既定でMFAを要求し得る](https://auth0.com/docs/authenticate/database-connections/passkeys)。
- メールOTPだけを弱い復旧経路として残してTOTPを解除できる設計は避ける。IdPのrecovery code等を案内し、supportによる解除は本人確認と全session失効を伴う。具体的な復旧手順は選定providerで確認する。
- 全利用者MFAの負担を減らすため「任意MFA」で始める案もあるが、未登録者のmailbox/social account侵害に対する保護が弱くなる。今回は第一案にせず、体験検証後の判断候補とする。
- Googleとメールを同じ人が別々に使うと、別Userになる場合がある。MVPでは自動統合しない。方式を変えたときに過去のDotが見えない理由を案内し、結合機能を追加するなら両identityの本人確認を別途設計する。

Auth0には[上流IdPの再認証を強制保証できない既知の制約](https://auth0.com/docs/authenticate/login/max-age-reauthentication#known-issues)がある。上流とtokenを交換しただけでもAuth0の`auth_time`が更新され得るため、§20の`max_age=0`/`auth_time`だけでGoogle利用者が直前に本人確認操作をしたとは判断しない。共有端末のaccount切替・削除前などの再確認には、選択したidentityに対する新しいAuth0側MFA challengeを要求し、remembered MFA等で省略されないことと、その完了をRailsが検証できることを採用条件にする。利用者が認証要素を共有している端末まで防げるとは約束しない。

Appleの準備は[環境設定](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple)、[private relay](https://developer.apple.com/documentation/signinwithapple/communicating-using-the-private-email-relay-service)、[削除・token失効](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)を参照。IdP経由でもこれらが自動で完了するかは別途確認する。将来native iOSを出す場合は、その時点でログインに関する配布要件も再確認する。

## 29. アカウント削除と障害対応の境界

3候補ともIdP側Userを削除する手段がある。ただし、**IdPのUser削除はRailsのDot・音声・sessionやバックアップの削除ではなく、Google/Apple本体のaccount削除でもない。** IdPに日記本文を置かず、必要最小限のidentity情報だけを渡す。

TASK-002/013へ渡す提案は、再認証済みの削除要求を受けたらRailsの利用者を停止して全sessionを失効し、アプリデータの削除とIdP削除を追跡可能にすること。IdP障害で削除APIが失敗しても、その利用者が再ログインできない状態を保ち、再試行する。同じidentityで新規Userを作って処理を迂回させない。必要な停止記録の保持期間、削除の順序・完了表示・backup/IdPログの保持はTASK-002で確定する。今回具体的な削除機能やaccount削除画面は追加しない。

Appleを採用するなら、grant失効に必要なprovider tokenを誰が保持・破棄するかをIdP connectorで確認する。§9の「IdP tokenをログイン検証後に保持しない」案はRailsの通常ログインを対象とし、Appleの失効要件まで解決したとは扱わない。必要なら最小権限・保存先・保持期間をTASK-002と再設計する。

| 故障 | 利用者に起こること | 推奨する扱い |
| --- | --- | --- |
| Auth0/Cognito/Logtoが停止 | 新規ログイン・再認証・IdP側設定変更に失敗 | Rails DBの既存sessionは期限内なら継続可。期限を勝手に延長せず、失効後は復旧を待つ |
| メール配送だけが停止 | メールOTPの受信ができない | 登録済みpasskey等は独立して使える場合がある。未登録の別方式を同じ人へ自動結合しない |
| Google/Appleが停止 | 該当social connectionからログイン不可 | 既存Rails sessionは維持。他方式への無審査の切替や、本人確認の省略をしない |
| Rails/DBが停止 | 認証状態・Dotの安全な判定ができない | 個人APIを拒否。browser保存値やIdP tokenだけで履歴を返さない |
| IdPの削除APIが停止 | 退会処理の一部が未完了 | Rails側停止を維持し、機密を含まない処理IDで再試行を追跡。成功と偽って表示しない |

稼働率の過去実績だけで順位付けしない。採用時に契約region、status通知、support受付時間、問い合わせ権限、データexport/移行方法を確認する。認証provider障害時に別IdPへ即時切替する仕組みは、identityの取り違えと運用負担を増やすのでMVPに入れない。

## 30. 開発環境のproxy・Cookie・CSRF

開発でもbrowserが見る入口を1つにする。**信頼されたlocal証明書を使う`https://localhost:5173`のVite + Railsへのproxy**を第一案とする。Railsはloopbackの`http://127.0.0.1:3000`で動かしてよい。Viteの[HTTPS/proxy/strictPort](https://vite.dev/config/server-options)が基盤になるが、設定ファイルは今回作らない。

```text
browser → https://localhost:5173（Vite）
            ├─ React / HMR
            ├─ /api/*  → http://127.0.0.1:3000（Rails）
            └─ /auth/* → http://127.0.0.1:3000（Rails）
IdP → https://localhost:5173/auth/callback → proxy → Rails
```

| 項目 | 開発時の案 | 本番/stagingとの関係 |
| --- | --- | --- |
| origin | browserからは固定の`https://localhost:5173`だけへfetch。Rails直URLをWebに渡さない | same-origin構成を維持。portはstrictに固定しcallbackのずれを防ぐ |
| Cookie | `Secure; HttpOnly; SameSite=Lax; Path=/`、Domainなし。開発専用の`__Host-fod_dev_session`等を使用 | 本番と同じ属性。Cookieはportで分離されないため、他のlocalアプリと名前を分ける |
| CSRF | Railsでsessionに結び付くtokenを発行し、変更操作のheaderとOriginを検証。login開始/logoutにも適用 | 開発だからといってCSRFを無効にしない。OIDC callbackだけはstate/nonce/PKCE等で検証 |
| Host / protocol | browserのOriginを改変せずRailsまで届ける。proxyが伝える公開host/port/protocolを、信頼するlocal proxyからの固定値として扱う | Railsの公開base URLとOriginが一致するか確認。`changeOrigin`だけを加えて回避せず、転送設定の不一致を直す |
| 認証設定 | 開発用tenant/User Pool・client・DBを本番と分離。callbackは実際に使うlocal URLを完全一致で登録 | wildcard callbackや開発端末から本番DBへの接続を許可しない |
| 秘密 | client secretと管理API資格情報はRails側のみ。証明書private keyもGitに入れない | `VITE_*`やJS bundleへ秘密を含めない |

local HTTPS証明書の導入が難しい場合だけ、HTTP localhost + 開発専用Cookie名 + `Secure=false`を例外候補にする。この場合`__Host-`を名乗らず、HttpOnly/SameSite/CSRFは維持し、環境差分を明記する。本番/stagingにはこの例外を使わず、HTTPS上でCookie/callbackを検証する。localhostの特例が全browserで同じだと仮定しない。

IdP自身のhosted loginを通すためlocalのRailsにパスワードやpasskey検証を移植しない。passkeyはIdPの認証domain/RP IDに依存するため、devとprodでcredentialを共有しない。AppleのHTTPS/domain条件をlocalhostで満たせない経路は、登録済みstaging domainで試験する。preview用のランダムURLを本番callbackへ追加しない。

検証予定: 正常login/logout、CSRF欠落/不正、Origin不一致、CookieのSecure/Domain/Path、code/state再送、Host転送、401とネットワーク障害の区別、A→logout→B、複数tab、callback応答喪失。mock成功だけで実IdP連携の検証完了にしない。

## 31. 第一推奨の組合せと採用前提

これは国内保管要件を整理する前の推奨記録。現行MVPには§40のAWS東京 + Cognitoを採用し、以下のRender/Auth0・必須MFA案は適用しない。Auth0は日本テナントを作成可能であり、海外アプリ配信とIdPの保存地域は別々に選べる（§35–36）。

**H1（RenderにReact成果物を同梱したRails + 有料Postgres）+ I1（Auth0 Essentialsを基準に評価）**を第一推奨とする。ログインはメールOTP + passkey登録を優先し、Googleを併設候補、Appleは利用者層に応じて追加する。公開MVPのMFAは§28のTOTP追加案を比較の基準とする。

理由は、アプリの公開経路を1つにし、認証のhosted UI・MFA・利用者管理を利用しながら、日記の所有権とsession失効を既存Rails/PostgreSQLで説明できるため。これは公式サービスの優劣を示す実測ではなく、現在のチーム規模と構成への設計評価。

採用前提:

- 海外regionでのアプリ/DB保存を許容できること。日本限定等の制約があるならhostingとIdPのデータ配置を再比較する。
- 月500 MAU程度の初期比較でIdP $35/月 + 有料Web/DB + メール等を予算化し、利用者数増加時のAuth0価格を再見積もりすること。
- Auth0 tenantの契約と設定で、同一UserのメールOTP/passkey、TOTPの権利・enrollment/recovery、Google経由にも必要なMFAを適用できることを実機検証すること。
- 上流social再認証には§28の既知の制約があることを受け入れ、account切替・削除前のfreshなIdP側MFA完了をRailsで確認できること。callback GET、PKCE、失効も実機確認する。
- identity/認証ログの保存地域・保持・削除、support、backupと復旧を確認すること。日記をIdPへ渡さないことだけでプライバシー条件が全て満たされるわけではない。

今回第一候補にしなかった理由:

- H2: Vercelの利点はあるが、初期MVPで独立deployよりもproxy/cache/timeoutの境界を減らす価値を優先した。
- H3: AWS経験や国内region条件がなければ、管理対象の多さが初期チームの負担になる。
- I2: 初期MAU料金は魅力的だが、想定するメールOTP + TOTP/social MFAとの適合を優先した。AWS経験がある、または認証UXをCognitoに合わせられるなら有力な次点。H1 + Cognitoの組合せも可能で、AWS配信とセットである必要はない。
- I3: $24だけでなくMFA込みの$72 + 従量で比較すると、この規模では費用面の優位がない。LogtoのUIやOIDC連携を選ぶ理由があれば再評価する。

次の判断は「H1 + Auth0を第一推奨として具体化するか」「海外regionと想定費用を許容するか」「公開MVPでTOTP追加を必須にするか」。idle/絶対期限や録音前loginの承認は引き続き別途必要。設計を理解して選ぶ段階であり、サービス登録・実装・deployは行わない。

## 32. 追補の検証・完了記録

- 状態: 追加比較を作成済み（2026-09-22）。TASK-001全体はIn progress。責務分担を第一候補とする方向は共有済みだが、具体的な採用条件は未確定。
- 成果物: 配信3案、IdP 3候補のOIDC/MFA/passkey/削除/料金/障害比較、ログイン手段の優先順位、local proxy/Cookie/CSRF、第一推奨と見送る理由を§26–31へ追記。TASK-001から最新検討を案内した。
- 一次資料の検証: 公式料金・技術資料を2026-09-22に確認し、各主張の近くへリンクした。Auth0 $35/500 MAU、Cognito Essentialsのdirect/social無料枠と超過料金、LogtoのPro + MFA $72とtoken従量を区別した。hosting合計は未確定で、Render料金ページの取得結果にcompute価格が出なかったことを明記した。
- 机上確認: H1/H2/H3のAPI/認証/静的配信とcache境界、local browser→proxy→Rails、IdP/メール/上流social/Rails/削除APIの各障害を追跡。CognitoのMFA制約、メール/Googleの自動統合禁止、IdP削除とアプリ削除、Auth0の上流再認証制約を確認した。実動作の成功証跡ではない。
- 独立レビュー: 別AIによる設計レビューはLGTM（比較資料として、Critical/High/Medium指摘なし）。Lowのrouter名訂正とAuth0上流再認証制約の明確化を反映。メールOTP→TOTP→recoveryの一連動作が未実証であることも本文と採用条件へ追記した。
- 機械検証: Pythonで3文書の相対リンク/見出しリンク18件、Planの1〜32節、16タスクのID/パス/依存節、TASK-001以外の状態が維持されることを確認。`git diff --check`と新規Planの`git diff --no-index --check -- /dev/null docs/implementation-plans/2026-09-21-task-001-identity-design.md`を通過。
- 差分: 今回は本PlanとTASK-001だけを更新。前回のTASK-005差分を維持し、機能コード・配信設定・依存・index・HEAD・既存`.worktrees/`に変更なし。product/journaling/architectureは詳細採用前のため変更しない。秘密情報・実利用者データなし。コミット・push・PRなし。
- 未実施: provider tenant登録、契約見積り、hosting実配信、認証/削除/MFA復旧/ブラウザ実機試験、アプリtest/build。設計提案のみの依頼であり、これらを成功扱いにしない。
- 完了条件: 選択肢比較は充足を維持。開始/終了/期限/失効の最終判断、採用方式としての確定、正本仕様への反映とTASK-005への確定引継ぎは未完了。既存の4完了条件を緩めずDoneにはしない。
- 次の作業: 海外保管、費用、IdP/ログイン手段/MFAの負担を人間が判断し、採用前の適合確認を計画する。今回新たにBlocked解除したタスクはない。TASK-002/003/004は引き続き独立して比較検討可能。

## 33. 日本での運用と国内保管要件の追加整理

2026-09-22の追加依頼に対応する設計提案。利用者の個人データを国内に保管することを必須にするか、その判断に必要な配信・IdP・メール・監視・音声/AIの所在地、削除、backup、障害時を整理する。国内必須化そのものはまだ承認されていない。TASK-002/003の保持期間・削除仕様・AI providerを確定せず、選定条件として渡す。

開始状態を再確認: `main`、HEADとリモートmainは`4b5365b17437df07f52620edd0ecb98cbe0eaf47`で一致。TASK-001/005と本Planの既存差分、未追跡`.worktrees/`を保護する。TASK-001に依存タスクはない。TASK-002/003はTodo・Plan未作成で、所在地・削除・生成の決定成果物や実証はまだない。相互の制約は整理できるが、それらの完了を前提にしない。

「日本向けサービス」と「国内保管を必須とするサービス」は別の判断。一般論として日本向けというだけで国内保存義務を断定しない。個人情報保護委員会の[外国サーバに関するFAQ Q12-3](https://www.ppc.go.jp/all_faq_index/faq1-q12-3/)は、海外保存を想定し、契約・アクセス制御による第三者提供の判断と、外国制度の把握等の安全管理を説明している。ただし、内容を処理するIdP/文字起こし/AIに「クラウドは取り扱わない」という例外を一律適用しない。対象分野・契約と実際の処理に応じた確認が必要であり、本Planは適法性の最終判断ではない。医療・支援用途は現行productで未決定のまま。

所在地は次の4つを分ける。

| 軸 | 確認する内容 | 間違えやすい例 |
| --- | --- | --- |
| 保存 | DB、オブジェクト、cache、一時file、ログ、backup、provider側保持の国 | 主DBが東京でも海外のログに本文を送れば国内限定ではない |
| 処理 | 音声認識・AI推論、CDNのTLS終端、認証、不正検知が動く国 | 保存しない海外AIにもデータは渡る |
| アクセス | 海外support/運用担当が閲覧できる範囲と承認・監査 | 国内サーバでも海外から閲覧可能な場合がある |
| 契約・管理主体 | 委託先・再委託先、適用契約、削除・例外の保証 | 外資系の東京regionと、国内企業による国内運用は同義ではない |

## 34. 国内必須の範囲を決める3案

この分類とD2推奨は過去の比較。現在は東京を基本配置とするが、国内限定の法的・契約上の約束や厳密なD2例外管理をMVPの採用条件にしない（§40）。D1/D2の採用済み扱いにも、D3を理由とした無制限の国外送信にも変更しない。

| 方針 | 必須にする範囲 | 利点・負担 | 評価 |
| --- | --- | --- | --- |
| D1: 例外なしの国内限定 | 全利用者データ・認証メタデータ・複製・ログ・supportも国内保存。さらに国外処理/アクセスも禁止するか明文化する | 最も強い約束だが、メール受信先、social、passkey同期、CDN、provider運用まで制約する。一般的なSaaSをregion指定しただけでは達成できない | 特別な顧客契約等が必要な場合。本比較のどの案も全条件の適合を確認済みではない |
| D2: 対象を明示した国内必須 + 例外の個別承認 | 音声・文字起こし・Dot・生成用prompt/結果、利用者/identity対応/session DB、自社管理の個人データを含むログ・backupは国内保存。ジャーナル内容の処理も国内。IdPの利用者directoryも日本を選ぶ。周辺の国外処理はデータ種別ごとに審査 | 内容の国外移転を防ぎ、認証等の現実的なサービス選択を残せる。委託先内部のログ/backup等が例外なら、その国・目的・期間を別途承認する必要がある | **第一推奨。ただし「すべての個人データが国内限定」とは表示しない** |
| D3: 国内必須にしない | 海外保存/処理を許可し、国・目的・保持/削除・委託先を明示する。何でも送ってよい方針ではない | Render等で運用を簡素化できる。海外での内容処理と後の移転・旧backup消去の説明負担が残る | 小規模MVPの速度/運用負担を優先し、海外保存を受け入れる場合の有力案 |

D2の理由は音声ジャーナルが私生活・感情・第三者の情報を含み得ること、将来AI追加時の送信先を先に制限できること、後からDBだけ移しても旧backup/ログを回収できないこと。国内保管自体は不正アクセス防止を代替しない。本人限定認可、暗号化、最小保持、削除は全案で必要。

D2で例外の検討対象にするものは、メール受信者のメールサービス、Google/Appleログイン、端末のpasskey同期、IdP/CDNの接続情報、事業者support等。**検討対象であることは許可済みを意味しない**。例外台帳には、送る項目、送信/保存/処理国、目的、再委託先、保持と削除、障害時経路、承認者・確認日を記す。地域不明を「国内」としない。利用者IDをhash化しただけでも匿名扱いしない。ブラウザ自体や利用者の端末backupは事業者の保管先と区別し、保証の範囲を明記する。

D2の例外候補は認証情報や接続・運用情報に限る。ジャーナル内容を含むprovider内部backup、診断ログ、support添付、AIの不正利用監視用保存も国内条件の対象であり、周辺サービスという理由で例外に含めない。内容の国外保存/処理を必要とする場合はD2の変更として改めて判断する。

## 35. 国内保管を必須とする場合のAWS東京とIdP比較

D1/D2ではRenderを第一候補から外す。[Renderのregion一覧](https://render.com/docs/regions)に日本はない。アプリだけ海外、DBだけ国内にしても、Railsが本文を受け取るためD2の内容処理条件を満たさない。

**共通の配信案**: 東京`ap-northeast-1`のALB（HTTPS入口）→ECS FargateのRailsへ集約し、同じreleaseにReactのbuild成果物を同梱する。RDS PostgreSQL（User/session/Dot）、必要になった音声等のprivate S3、一時処理・queue、CloudWatch Logsとログ保存用S3、KMSを東京に揃える。ReactとRailsは`https://app.example.com`の同一origin。path分担とSPA fallback/CSRF/Cookieは§26/30の方針を維持する。API専用Railsの静的配信・Cookie基盤は将来の実装と検証対象。

§26 H3のCloudFront→S3/ALB案とは異なり、初期案ではアプリの前面CDNを省き、個人API/音声が通るTLS終端を東京のALBに寄せる。静的ファイル用CDNは将来の別評価とする。これだけでIdP等のglobal経路までなくなるわけではない。ALB access logのcallback query等も別途抑制/マスキングを検証する。

```text
利用者のbrowser
  ├─ app.example.com → ALB東京 → React静的配信 / Rails東京
  │                              ├─ RDS東京: User・session・Dot
  │                              ├─ S3東京: 必要な一時音声等
  │                              └─ CloudWatch東京: 内容を除いた必要ログ
  └─ IdPのログイン画面 → Cognito東京 または Auth0日本テナント

将来: Rails → 国内の文字起こし / AI処理 → Rails → Dot保存
      ※実provider・model・保持/削除はTASK-002/003で確定
```

| 観点 | J1: AWS東京 + Cognito東京 | J2: AWS東京 + Auth0日本テナント |
| --- | --- | --- |
| 位置づけ | **D2の第一候補**。region設定・監視・権限をAWSに集約しやすい | hosted loginの体験・設定自由度を優先する対抗案 |
| 認証データ | 東京のUser Poolを指定。Railsの内部Userとissuer/subで対応。海外replicaは作らない | Public CloudのJapan（JP）を指定可能。日記本文は属性/metadataへ入れない |
| 国内限定の限界 | User Poolの東京配置だけでAWS運用メタデータ・support・認証CDNまで国内とは保証しない。Cognito custom domainもCloudFrontを使用する | Auth0向け再委託先一覧に国外の分析/サポート/メール、global CDNを記載。日本テナントだけで全個人データ国内限定は証明できない |
| OIDC / MFA / passkey | OIDC code + PKCE。メールOTPを第一要素にする構成とMFA requiredには§27の制約がある。password + TOTP、検証済みのUV passkey等を比較し、以前のメールOTP + TOTP案をそのまま適用しない | OIDC code + PKCE。passkey/TOTP等は§27–28参照。メールOTP→必須TOTP→復旧の一連動作、freshな再認証は引き続き未実証 |
| IdPの削除 | AdminDeleteUserとRails側disable/session失効を連動させる設計。ログ・backup・replicaまでの消去期限は別確認 | Management APIでUser削除。ログ・provider内部backup・support ticketまで即時消えるとは扱わない |
| backup / 復旧 | DB snapshotとUser Poolの復元は別。設定/属性exportだけでpassword・MFA・passkeyを完全復元できるとは扱わない。MRRもbackupの代用ではない | Public Cloudの顧客向けbackup/restoreサービスは提供されず、自前の設定/利用者export等を検討する。provider内部の可用性用複製とは別問題 |
| ログ | 必要な認証監査を東京にexport。保持期限、ログ項目、CloudTrailや脅威検知の転送も確認 | Essentialsのtenant log保持は5日。国内へのexport後もprovider内部ログの所在地・保持・削除の確認が必要 |
| 障害 | AWS東京への依存が集中。東京停止ならアプリと認証が共に影響し得る | アプリと認証の運用主体は分かれるが、東京AWSから独立した可用性を保証しない。日本構成のfailover先とデータ種別を契約確認 |
| 費用の比較基準 | Essentials direct/socialは最初10,000 MAU無料、超過$0.015/MAU。SES、追加保護/replica等は別。通常のRails OIDC接続を外部IdP federationの別料金と混同しない | B2C Essentialsは500 MAUで$35/月。国内限定の特約・追加support等が必要ならこの価格で成立するとは限らない |
| 主な運用負荷 | IAM、SES、監視、User Pool設定、認証UXの適合検証を自分たちでまとめる | 認証画面の運用を任せやすいが、AWSとAuth0の両方で削除・監査・障害対応と契約確認が必要 |

根拠: [Auth0 tenant作成とJP region](https://auth0.com/docs/get-started/auth0-overview/create-tenants)、[Okta再委託先一覧のAuth0節（Workforce Identity節とは別）](https://www.okta.com/legal/trustandcompliance/subprocessors/)、[Auth0 backup/restoreの制約](https://support.auth0.com/center/s/article/backup-and-restore-features-provided-by-auth0-for-tenants)、[Auth0 log保持](https://auth0.com/docs/deploy-monitor/logs/log-data-retention)、[Cognitoのデータ保護](https://docs.aws.amazon.com/cognito/latest/developerguide/data-protection.html)、[Cognito custom domain](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-add-custom-domain.html)、[AWS再委託先](https://aws.amazon.com/compliance/sub-processors/)、[Cognito料金](https://aws.amazon.com/cognito/pricing/)、[Auth0料金](https://auth0.com/pricing/)。2026-09-22確認、USD、税/為替/アプリ費用は含まない。

Auth0の同一覧には米国の分析・サポートticket、ドイツのdata warehouse、global CDN、国外supportからのアクセスがある。これは全利用者の全項目が必ず各国へ送られるとの証明ではないが、全データ国内限定とする根拠にもならない。日本のPublic CloudはAWSに加えてAzureのfailover componentを使うとの記載もある。backup・failoverに含まれるデータと保存国・期間は書面で確認する。日本語版と英語版一覧には掲載差があり、今回JP Public Cloudを記載した英語版Auth0節を採用根拠にした。

Cognitoの[MRR](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-multi-region.html)は追加料金・対応基盤が必要で、secondaryではTOTP MFA等に制約がある。東京→大阪の採用可否と認証復旧を確認せず「国内DRが可能」と確定しない。初期は東京内の複数AZでの可用性を検討し、region全体停止では停止を受け入れる案。復旧までの許容時間と失ってよいデータ量は未決定。国外へ自動退避して所在地要件を破らない。

AWS合計はFargate、ALB、RDS、S3/backup、通信、NATまたはVPC endpoint、CloudWatch、KMS、SES、IdP、supportを含める。小規模時もALB/DB等の固定費と運用工数があり、Cognito無料枠だけでRenderより安いとは判断しない。AZ冗長化、録音分数・AI token、ログ量が未定なので総額未算定。国内要件は金額比較より先の選定条件とする。

## 36. 国内必須としない場合のRender + Auth0日本

D3なら、同一originのRender（Singaporeを具体候補）+ 有料Render Postgres + **Auth0日本テナント**を第一候補として維持できる。IdPを日本に置いても、Railsが受け取る利用者情報や日記まで国内になるわけではない。以下は提案構成の経路であり、本番で既に流れているデータではない。

| データ | 提案する保存/処理先 | 国外へ出る範囲・未確認点 |
| --- | --- | --- |
| User、IdPとの対応、session | Rails/Render Postgres: Singapore。IdP directory: Auth0日本 | issuer/sub、必要なemail等、session digest/期限はSingapore。OIDC code/tokenもRailsで処理するため国外へ渡る。ログに記録しない |
| Dot、録音時間、必要な文字起こし | Render Postgres: Singapore | 本文/生成結果・関連IDは国外保存。東京S3に音声を置いてもこの経路は国内限定にならない |
| 音声・生成prompt/結果 | Rails経由ならSingaporeで処理。音声の長期保存有無と処理providerは未決定 | 一時memoryやupload bufferも国外処理。直uploadなら経路は変わるが、生成結果がRailsへ戻る点を評価する |
| アプリDB backup | Render管理の復旧/backup、必要なら別途export | 国内限定保証として扱わない。管理backupの正確な所在地・削除期限は契約確認。東京へのexportは既存の国外保存を取り消さない |
| アプリ/アクセス/認証ログ、監視 | アプリ内では本文を除外。Render管理ログ、Auth0内部ログ、必要な国内export | IP・時刻・利用者IDも対象。管理系の全保存国は未確認。国を特定できるまで「Singaporeだけ」と表示しない |
| 認証メール | Auth0日本→SES東京を候補→利用者のメール事業者 | 受信事業者の国外保存/転送をアプリから制御できない。メールにDot/音声/文字起こしを載せない |
| Google/Apple、passkey同期 | 選択した外部ログイン/端末側service | 認証時の識別子・接続情報等の国外処理を別途確認。Auth0日本でも上流まで国内化されない |

[Render復旧/backup機能](https://render.com/docs/postgresql-backups)と[自前S3 backup例](https://render.com/docs/backup-postgresql-to-s3)は、利用者1人の削除やprovider内部複製の完全消去を保証する資料ではない。Render/IdP障害の扱いは§29を維持し、国外/国内の別providerへ無断で切り替えない。将来国内へ移転する場合、DB/exportだけでなく旧backup・ログ・provider保存・OIDC issuer変更/アカウント移行も対象となる。

## 37. メール・監視・削除・音声とAIに共通する条件

| 領域 | D1/D2での候補・条件 | D3との差 / 削除・障害で確認すること |
| --- | --- | --- |
| メール送信 | SES東京を明示し、配送event/バウンス等も国内の保存先へ。Auth0のcustom provider、CognitoのSES東京設定を確認 | 受信者のGmail等の保存国は制御できない。送信したOTPメールを受信箱から回収できない。D1ならメール利用そのものが成立するか再検討。D2/D3ではこの境界を明記する |
| ログ/監視 | CloudWatch Logs東京と東京S3。本文、音声、prompt、Cookie、code/tokenを出さない。IP/IDも必要最小限にし保持期限を設定 | Sentry等は地域・session replay・収集項目を確認前に有効化しない。障害通知には本文/emailを貼らず集計値・調査用IDに絞る。supportやCIへの実データ持出しも対象 |
| DB/音声backup | 東京のRDS backupとS3。別regionのcopyは承認済み国内先のみ | D3でも保存国を台帳化。DBの行削除はsnapshot内の同じ行を消さない。S3 versioningではdelete markerだけでは旧versionが残る |
| 利用者削除 | Rails側をまず無効化しsession失効。IdP、本文、音声、文字起こし、AI履歴、queue/一時file、exportを追跡 | IdP削除だけで完了にしない。失敗を再試行できる状態で管理し、保持期限で消えるbackupと即時削除可能なデータを区別。復元後は公開前に削除記録を再適用し、消した利用者/内容を復活させない |
| 文字起こし | 候補はTranscribe東京。利用前にサービス改善目的の利用/保存をopt-out。出力は東京の自社S3を指定する案 | デフォルトのまま国内限定としない。job情報、入力音声、出力file、provider側保存は別々に削除確認。D3でも不要な学習/改善利用を許可する理由にはならない |
| AI生成 | 候補はBedrockで東京内推論に対応するmodel/呼出し方式。入力・結果・不正利用監視の保持と国も確認 | 東京endpointだけでは足りない。APAC/global cross-region推論を国内条件の代わりにしない。国内処理できるmodelが要件を満たさなければ、他の国内実行候補か要件を再比較 |

メール根拠: [Auth0のSES設定](https://auth0.com/docs/customize/email/smtp-email-providers/amazon-ses)、[Cognitoメール設定](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html)、[SESのregion](https://docs.aws.amazon.com/ses/latest/dg/regions.html)。Cognito東京はSES東京以外の互換regionも選べるため、User Poolのregionだけで配送元を推定しない。送信先メール事業者はサービスの管理外でも、メール配送でデータが渡ることを例外の説明から落とさない。

監視/backup根拠: [CloudWatch Logs保持](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html)、[RDS backup](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html)、[S3 version削除](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html)。保持期限に達してから物理削除まで遅延するサービスがある。復旧用backupを保持するなら、その期間とアクセス制限・期限後の消去をTASK-002で定義する。無期限の手動snapshotや削除記録そのものを忘れない。期間の数字は今回確定しない。

音声根拠: [Transcribe region](https://docs.aws.amazon.com/general/latest/gr/transcribe.html)、[改善利用のopt-out](https://docs.aws.amazon.com/transcribe/latest/dg/opt-out.html)、[Transcribe FAQ](https://aws.amazon.com/transcribe/faqs/)。FAQは改善用途で別regionへ保存され得ることと、opt-out時の扱いを説明する。Organizations policy等の有効化を利用前に検証し、既に処理したデータの削除は別確認とする。音声を国内S3へ置くだけでは条件を満たさない。

AI根拠: [Bedrock cross-region推論](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html)、[model/profileごとのregion確認](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html)、[不正利用検知時の保持](https://docs.aws.amazon.com/bedrock/latest/userguide/abuse-detection.html)。一部modelは入力/出力の保持例外があり、cross-region利用時は処理先に保存され得る。「学習に使わない」「保存しない」「国内で処理する」はそれぞれ別条件。呼出し先、model ID、推論方式、保持設定、診断ログを組として検証し、model名だけで採用しない。障害・quota超過時も海外modelへ自動fallbackしない。実model選定・品質/料金評価・同期/非同期はTASK-003に残す。

共通の異常系: IdP停止では新規login/再認証は不可、有効なRails sessionは期限を延ばさず利用継続可能。Rails DB停止では認証/認可を省略しない。削除API停止は「削除済み」にせず、ローカル利用停止を維持して再試行。東京region停止で海外への切替をしない場合の停止時間を説明する。復旧時には削除済みデータの復活、重複生成、他Userへの再関連付けを防ぐ。具体的な実装契約は未確定。

## 38. 国内保管比較時の推奨と判断項目（過去の記録）

以下は2026-09-22の判断材料であり、現在の採用内容は§40で更新した。

**推奨はD2（対象を明示した国内必須）+ J1（AWS東京 + Cognito東京）を第一候補にすること**。内容を国内に留め、IdP・メール・監視の地域設定を同じ運用体系で追跡しやすい点を重視する。以前のRender第一推奨はD3の場合だけ維持する。この順位変更はユーザーが国内必須化を承認したという意味ではない。

- 国内保管を必須にする場合: Renderは外す。Cognitoの認証UX/MFAと国内要件が適合するか先に確認。Auth0日本はUX上の対抗案だが、国外の運用データ/アクセスを確認して例外承認できる場合に残す。D1なら両IdPとも追加の契約確認なしに適合としない。
- 国内保管を必須にしない場合: Render Singapore + Auth0日本を維持。§36の国外保存/処理を利用者への説明に反映し、監視やAIの国が未確認のまま本番利用しない。
- 認証手段: 厳格な国内条件がある間はGoogle/Appleを初期必須にしない。メールも受信先の国外保存を例外として評価する。passkeyの端末同期はIdP directoryの所在地と別で、同期型か端末/鍵に留める方式かを確認。MFAを弱めてCognitoに合わせることは決定していない。
- 同一origin、Rails server-side session、Railsの所有者認可はどの構成でも維持。local proxy/Cookie/CSRF方針は§30のまま。開発・CI・調査では本番の音声/日記をコピーせず、架空データを使う案。

採用前に埋める証拠: 各データの保存/処理/アクセス国、IdP内部backupとログ消去期限、国外再委託先へ渡す項目、国内failoverの可否、メール経路、選んだmodelの国内推論/保持条件、削除とrestore手順、予算と運用担当。公開資料で不明な項目はproviderへの書面確認が必要。今回は外部問い合わせや契約を行っていない。

人間に求める最初の判断は**D1 / D2 / D3のどの約束を利用者にするか**。D2を選ぶ場合も、例外は包括承認ではなく後続の項目別確認とする。海外support等も一切許容しない場合はD1として別途成立性を調べる。所在地方針を決める前にIdPの価格や画面だけで確定しない。

## 39. 国内保管比較の検証・完了記録

- 実施: 一次資料に基づく国内要件3案、AWS東京 + Cognito/Auth0日本、Render + Auth0日本の国外データ経路、メール/監視/backup/削除/音声/AIと障害の比較を§33–38へ作成。以前のRender第一推奨に条件と最新節への案内を付けた。
- 参照: AGENTS/personal conventions、task索引、TASK-001全文、product/journaling/architecture、既存Plan、TASK-002/003の全文と未作成Plan、frontend/backend securityを確認。機能コードは変更せず、前回の対象コード確認を基準にした。マージ済みmainは同じcommitで、リモートも読み取り専用で再確認した。
- 机上検証: 国内主DB + 国外ログ、東京endpoint + 国外AI推論、IdP日本 + 国外アプリ、削除後backup restore、東京障害時国外fallback、メール受信先の管理外保存を反例として追跡。どれも「regionを日本にしただけで完了」としないことを確認した。
- 自己レビュー: 国内保存/処理/国外アクセスを区別し、D2の例外候補にジャーナル内容を含めないことを明確化。秘密情報・実利用者データ・別Userへのアクセスや認可緩和を含まない設計資料であることを確認。追加の独立AIレビューは利用上限により実行できず、§32の過去のLGTMを今回追補へ拡張しない。
- 機械検証: Pythonで相対リンク/見出し18件、Planの1〜39節、16タスクの依存関係とTASK-001以外の状態、追跡済み変更範囲と空のindexを確認。`git diff --check`、新規Planの`git diff --no-index --check`に空白エラーなし。
- 差分: 今回の更新は本PlanとTASK-001のみ。既存TASK-005差分と未追跡`.worktrees/`を維持。機能コード・設定・依存・正本仕様・HEADに変更なし。コミット・push・PRなし。
- 未実施: サービス契約/登録、providerへの照会、認証フロー/削除/復旧/所在地の実機試験、音声/AI品質試験、実料金見積り、アプリtest/build。設計提案の範囲なので未実施を成功扱いにしない。
- 完了条件: 選択肢比較は充足。人間による採用決定、開始/終了/期限/失効の確定、採用方式の正本文書反映、TASK-005への確定引継ぎは引き続き未完了。国内要件と例外も未承認。TASK-001はIn progress。
- 次のタスク: 新たなBlocked解除なし。TASK-002/003はこの所在地条件を候補として保持/削除と生成の比較に着手可能、TASK-004も従来どおり独立検討可能。今回それらの仕様・完了条件・状態は変更しない。

## 40. 公開MVPの採用決定（2026-09-24）

ユーザーの「既存PR #27の設計文書とPR本文をこの決定に合わせて更新」の依頼に基づく。以下は採用済みの設計で、実装・AWS作成・稼働確認の記録ではない。過去の比較で有力だった案を再承認待ちに戻さない。

| 項目 | 採用内容 |
| --- | --- |
| 公開基盤 | AWS東京のALB + ECS Fargate + RDS PostgreSQL。初期はECS serviceの定常desired countを1、RDSをSingle-AZとする |
| Web/API | Reactのbuild成果物をRails releaseへ同梱し、ALBの同一HTTPS originから静的ファイル・API・認証callbackを配信する。CloudFrontは初期導入しない |
| IdPとログイン | 東京のCognito Essentials。GoogleログインとメールOTPを初回公開から両方提供。Googleのみへ縮小しない。メール配送にはSES東京を設定する |
| アプリ認証・認可 | RailsのDB session、HttpOnly Cookie、CSRF対策、Dot所有者認可。User/identity対応・session・DotはアプリDBで管理する |
| MFA・復旧 | 利用者のMFAは必須にしない。TOTP紛失時の運営者復旧・予備passkeyをMVP採用条件にしない。復旧はIdP/上流サービスの標準機能へ案内し、運営者による手動本人確認やemail一致での旧Dot移管はしない |
| データ所在地 | 日記内容・音声・AI入力は原則として東京に置き、文字起こし・AI処理も東京で利用できる構成を優先する。国内限定を法的・契約上の約束にはしない。厳密なD2の個別例外管理は将来論点 |
| 予算 | 基盤費は月5,000円を目標とし、安全な公開MVP運用のため月1万円前後を許容。音声保存・文字起こし・AI・通信量は別従量予算。DB backup・監視・認証メール等は基盤見積もりに含める |
| 拡張条件 | 負荷・障害状況・費用を見てECS複数タスク、RDS Multi-AZ、CloudFront等を追加判断する。初期の過剰な冗長化はしない |
| 費用管理 | AWS Budgets、Cost Anomaly Detection、AWS Pricing Calculatorを公開前の初期設定対象とする。今回は設定しない |

選択理由は、公開基盤と認証をAWSへまとめ、DBの保守・backupをRDSへ任せつつ、Railsでsessionと所有権を管理できること。1タスク・Single-AZには停止リスクが残るが、必要な負荷と費用が判明してから段階的に冗長化する。安価なLightsail同居DBより、公開時のDB運用負担を減らす選択をユーザーが行った。

Auth0日本テナント、Render、Lightsailは今回採用しない。App Runnerは[2026-04-30以降の新規顧客受付終了](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)もあり新規基盤の候補にしない。以前の必須MFA案を外したため、Cognitoの「メールOTP + 必須TOTP」の成立性はMVPの採用条件ではない。[Cognitoメール設定](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html)ではメールOTPにEssentials以上とSES設定が必要。GoogleはCognitoの標準social providerを使い、RailsとGoogleを直接接続する別経路を増やさない。

## 41. 採用構成の具体化と安全境界

構成の正本と経路図は[architectureの公開MVP節](../architecture.md)を参照。次はその実装・公開時に確認する条件であり、実機検証済みではない。

- ALBでACM証明書によるHTTPSを終端する。ALBの配置には複数AZのsubnetが必要だが、これをECS複数タスクやRDS Multi-AZの採用とは混同しない。
- 初期ネットワーク案は、public subnet上のFargateに公開IPv4を付け、Internet GatewayでCognito等へ外向き通信する方式。アプリportの受信元はALBのSecurity Groupだけに限定し、RDSは非公開にしてECSからのみ接続する。RDS接続はTLSを使う。NAT Gatewayは初期案に含めない。構築前にSecurity Groupと経路を検証し、この案が成立しなければ費用を再見積もりする。[ECS外向き通信](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/networking-outbound.html)
- `desired count=1`は定常時の台数。deployment時の一時的な新旧タスク併存と課金はあり得る。タスク交換中の停止、RDS保守・AZ障害時の停止を許容する初期構成であり、無停止を保証しない。永続データ・sessionはRDSへ置き、ECSのローカルdiskを正本にしない。
- React buildのhash付きassetとSPA画面のGETだけを静的配信する。API・認証経路へSPA fallbackを適用せず、個人responseは`no-store`。CloudFront、Redis等の別sessionサービスは初期に追加しない。
- Cognito Managed loginからのAuthorization Code + PKCEをRailsで検証し、`state`・`nonce`・署名・issuer・audience・期限を確認してからUserとDB sessionを確定する。GoogleとメールOTPは同じメールでも別identityになり得る。検証済み`(issuer, sub)`から内部Userへ対応し、メール一致だけで自動統合しない。
- MFA登録待ち・TOTP確認待ちを通常session発行の条件にしない。ログイン途中のstate/nonce/PKCE用取引は引き続き必要で、MFA enrollment管理とは別である。IdP側の一次認証を省略するという意味ではない。
- browserへはopaque session IDだけを`Secure; HttpOnly; SameSite=Lax`のhost-only Cookieで渡し、認証成功時にIDを更新する。tokenをlocalStorageへ置かず、RailsのDB照合・CSRF検証・所有者scopeを必須にする。同一originのWeb/API間にcredentials付きCORSを追加しない。開発proxyの案は§30を参照する。
- ログイン失敗ではsessionを発行しない。logoutはRails DBで失効してから成功を返す。失効済みCookieではDotを取得できず、通信失敗とlogout成功を区別する。IdPのlogout/停止/標準復旧が既存Rails sessionを即時失効するとは保証しない。具体的な失効範囲・再認証・期限は§43で判断する。
- ALB access logはcallback URLのcode等を記録し得るため、初期案では有効化せず、ALB metricsと機密を除外したRailsログを利用する。必要時は認証情報を保存しない経路・記録方法を先に設計する。Rails parameter filterだけでALB側のqueryまで消せると仮定しない。[ALB access logのrequest field](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html)
- RDS暗号化、自動backup、保持期間の明示、復元試験、秘密情報のサーバー側管理、障害/容量/費用の監視は公開前の確認対象。backup保持・削除記録の再適用はTASK-002、認証・別User拒否はTASK-006/015で検証する。MFAを必須にしない方針をAWS運用管理accountの保護緩和に流用しない。

日記内容、文字起こし、音声、AI入出力をIdP属性・認証メール・通常ログへ含めない。東京を基本配置とする方針は、外部AIやGoogle・メール事業者の処理まで国内であるという保証ではない。TASK-002/003で送信先・目的・保持・削除と利用者への説明を決め、国内限定保証のないことを無制限な送信の許可にしない。

## 42. 基盤費の目標と見積もり・費用管理

月5,000円は目標であり、この構成が同額に収まるという見積もりではない。月1万円前後の許容も固定料金や厳密な上限保証ではない。公開前にPricing Calculatorで実構成を再見積もりし、超過が大きければサイズ・構成・予算を再判断する。必要な認可・暗号化・backupを省いて金額を合わせない。

比較時に確認した2026-09-23のAWS東京公開単価による例。月730時間、Linux/x86 Fargate 0.25 vCPU / 1 GB・1タスク、RDS PostgreSQL db.t4g.micro・Single-AZ・gp3 20 GB、ALB 1台、NATなし。これらのサイズは費用例で、Railsの負荷・memory確認前に採用サイズを確定しない。期限付き無料期間やcreditは含めない。

| 内訳 | 計算 | USD/月 |
| --- | --- | --- |
| ALB時間料金 | 0.0243 × 730 | 17.74 |
| Fargate | (0.05056 × 0.25 + 0.00553 × 1) × 730 | 13.26 |
| RDS compute + storage | 0.025 × 730 + 0.138 × 20 | 21.01 |
| 公開IPv4 | 0.005 × 730 × 3（ALB最低2、task 1） | 10.95 |
| 固定相当の小計 | ALB容量課金等の追加前 | **62.96** |

仮の換算条件を1ドル150円・消費税10%とすると約10,390円。ALB容量課金（0.008 USD/LCU時）、ECR、CloudWatch、backup超過、secret管理、SES、domain等が追加され、1万円を超え得る。短期の複数task併存・31日の月・為替・負荷による増強も増額要因。通信量は別予算だが、ALBの容量課金やNATの時間料金まで通信費扱いにして基盤小計から隠さない。

東京単価の一次資料: [ALB](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/ap-northeast-1/index.json)、[Fargate](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-northeast-1/index.json)、[RDS](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-northeast-1/index.json)、[公開IPv4](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonVPC/current/ap-northeast-1/index.json)。URLは現行価格へ更新されるため、再見積もり時の確認日も残す。

[Cognito Essentials](https://aws.amazon.com/cognito/pricing/)のdirect/social合計10,000 MAU無料枠を使える初期規模では認証compute費を抑えられるが、組織内の枠消費と超過料金を確認する。[SES](https://aws.amazon.com/ses/pricing/)は別課金で、新規向けEssentialsの例では0.16 USD/1,000通。OTP連打・送信量増加も監視する。NATを追加すると東京の時間料金だけで約45.26 USD/月、公開IPv4や処理量は別になり、この初期予算には大きく影響する。

| 公開前の初期設定対象 | 設定・確認する内容 |
| --- | --- |
| [AWS Pricing Calculator](https://calculator.aws/) | 東京・実サイズ・通常/増量時の見積もり。基盤と音声保存/文字起こし/AI/通信を区分し、IPv4・backup・監視・SES・一時増設も含める。税・為替を別途確認 |
| [AWS Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/) | 基盤と別従量予算を分け、5,000円目標・1万円前後の許容をUSD換算等で管理。実績/予測の通知先と超過時の対応を設定。基盤外の従量予算額は別途決定 |
| [Cost Anomaly Detection](https://aws.amazon.com/aws-cost-management/aws-cost-anomaly-detection/faqs/) | サービス別の異常増加を通知。小規模予算に合う閾値を設定し、初期は請求確認も併用 |

Budgetsの監視・通知は無料だが、予算額で即時に請求を止める機能ではない。異常検知にも請求データの遅延がある。今回はCalculatorの保存見積もり、Budget、monitorを作成しておらず、通知の到達確認も未実施。

## 43. 未決定事項・将来論点・後続への引継ぎ

採用決定と未決定を混ぜない。以下の細部が残るため、TASK-001はIn progressのままにする。

- TASK-001で残す判断: 録音開始前にログインを求める時点、sessionのidle/絶対期限、logoutの対象範囲、共有端末での入り直し・account選択、IdPの停止/復旧後のアプリsessionの扱い。§20の30分/12時間/取引5分や`max_age=0`は過去の提案値であり、今回承認されたと扱わない。
- TASK-005へ確定条件として渡すもの: Cognito Google + メールOTP、同一origin、Rails DB session/HttpOnly Cookie/CSRF、serverでの所有者確定、未認証・失効後のDot拒否、Google/メール間の自動統合なし、MFA必須化・手動本人確認なし。endpoint・error schema・具体期限はまだ契約化しない。
- TASK-002/003: 日記・音声・AI入力の東京基本配置と別従量予算を前提に、送信・保持・削除・AI provider/model・同期/非同期を決める。国内限定の法的保証やD2の厳密な例外台帳を追加の着手条件にはしない。
- TASK-006/007/015: 実providerでGoogleとメールOTPの両方、callback検証、Cookie/CSRF、logout/期限切れ、利用者A/Bの分離、切替時の旧cache、ログへの秘密混入を検証する。認証library選定・API-onlyへの組込みも未実施。
- 公開準備: 実domain、task/DBサイズ、SG/経路、backup保持・復元目標、通知先、SES本番送信設定、費用計測を具体化する。採用構成の承認を、AWS作成や課金開始の許可とは扱わない。
- 将来論点: 必須MFA・TOTP紛失時の運営者復旧・予備passkey、厳密なD2、ECS複数タスク・RDS Multi-AZ・CloudFront。前者は本人確認/復旧/所在地の要求が変わった時、後者は負荷・障害・費用から必要性を確認した時に再検討する。MVPにMFA完了待ち状態機械を先行実装しない。

TASK-002/003/004はTodo・Plan未作成で、完了した設計成果物や検証結果はまだない。TASK-005/006/007の依存を満たしたとは扱わずBlockedを維持する。既存のTASK ID・ファイルパス・依存関係は変更しない。

## 44. 採用決定反映の検証・完了記録

- 開始確認（2026-09-24）: 現在のbranchは`codex/identity-data-residency-design`、HEADとPR #27の先端は`27b4a6cf4dc0a4bcc876890389fcc79660b0f9bb`。リモートmainは`4b5365b17437df07f52620edd0ecb98cbe0eaf47`でローカルmainと一致。追跡済み差分なし、未追跡`.worktrees/`には触れない。
- 規約・根拠: AGENTS、個人規約とRails規約、PR template、task索引・TASK-001全文・関連Plan、product/journaling/architecture、TASK-002〜007、両領域の実装規約/securityを確認。Rails API-only、`GET /up`のみ、未設定のVite proxyを読み、設計採用を実装済みとしないことを確認した。
- 更新範囲: 本Plan、TASK-001/005、product/journaling/architecture、backend規約/security冒頭の古い記述、および既存PR #27の本文。過去のCurrent Stateと当時の検証記録は維持。既存branchへの文書追加commitで反映し、新規branch・PRは作成しない。
- 検証: 差分・リンク・認証シナリオ・変更範囲の確認結果を更新完了時に追記する。
- 未実施: 認証/配信の実装、AWS作成、provider登録、実料金・負荷・障害・backup復元試験、アプリtest/build。今回は文書の採用決定反映なので実施せず、稼働成功として扱わない。

| TASK-001の完了条件 | 今回の結果 | 残作業 / 証跡 |
| --- | --- | --- |
| 認証方式・正本・開始/終了/失効の決定と理由の確認 | 一部完了 | 配信/IdP/ログイン手段/session方式のユーザー決定を§40へ記録。具体期限・利用開始・終了/失効の細部は§43に残る |
| 選択肢を配信・脅威・運用負荷で比較 | 完了 | §17–39の過去比較と§40–42の採用理由・初期制約・費用 |
| 採用方式の資格情報・CSRF/CORS・認可境界を明文化 | 完了 | architectureの経路図と責務、§41。実機試験完了を意味しない |
| 正本文書への決定反映とTASK-005への引継ぎ | 完了 | product/journaling/architectureへ採用済み範囲を反映。TASK-005では未決定項目と区別 |

TASK-001はIn progress、TASK-005/006/007はBlockedを維持する。TASK-002/003/004の独立した設計検討は引き続き着手可能。後続の機能実装を新たに着手可能とする変更ではない。

</details>

## 45. DeviseとCookieStoreへの採用変更（2026-09-24）

ユーザーの明示的な決定に基づく。これは設計採用で、実装・稼働確認ではない。

| 項目 | 現在の採用内容 |
| --- | --- |
| 本人確認 | Rails + Deviseでメールアドレス＋パスワード、確認メール（Confirmable）、パスワード再設定（Recoverable）。GoogleはOmniAuth連携 |
| session | Rails標準CookieStore。暗号化・改ざん検知されたCookieに必要最小限の認証状態を保持。通常認証用Sessionテーブルを作らない |
| Cookie/CSRF | HttpOnly・Secure・SameSite=Lax、Domainなしを基本とし、同一origin・RailsのCSRF保護を維持 |
| 利用者と認可 | 内部User UUIDをDotの所有者にする。Devise/Wardenが確定したcurrent_userのscopeで一覧・詳細・更新・削除。作成時のownerもサーバーが設定 |
| Google | 検証済みprovider/uidを内部Userへ一意に対応。email一致のみの自動統合は禁止。明示的連携は将来対応 |
| 対象外 | メールOTP、MFA、passkey、運営者の手動復旧。端末別失効・全端末logout用DB sessionは保留 |
| 維持 | ALB + ECS Fargate + RDS PostgreSQL東京、初期1タスク・Single-AZ、React同梱・同一origin、東京基本配置、国内限定を約束しない方針、既存予算と費用監視 |

Cognito用OIDC callback、Cognito token検証、Cognito固有identity対応は現行設計から削除する。Google認証からRailsへ戻る**OmniAuth callbackは引き続き必要**。旧Cognito callbackを流用する決定でも、Googleの認証検証を省略する決定でもない。

理由と代償: DeviseでRailsに本人確認を集約し、CookieStoreにより認証session専用DBの管理を省く。一方、password hash、確認/再設定メール、濫用防止、依存更新、鍵保護を自分で運用する。Deviseが導入されれば全要件を満たすとは扱わない。管理型IdPやDB sessionの比較は履歴に残すが、現行MVPの依存条件にしない。

## 46. 認証・session・認可の処理と限界

### メールとGoogle

- メール登録ではDeviseの確認メールを使う。確認前のDot操作を許可しない。確認リンクの期限・再送・期限切れ・変更時の再確認・確認後のログイン導線はTASK-001/005で具体化する。
- ログイン成功時はsessionを更新し、固定された認証前sessionを引き継がない。失敗時は認証済みにしない。password平文や確認/再設定tokenをDBログ・access log・responseに出さない。
- Google認証開始はCSRF保護したPOSTを基本にする。OmniAuth/strategyでstateと認証応答を検証し、失敗・キャンセル・不正callbackはログインさせない。認証callbackだけの外部redirect経路と通常の変更APIを区別し、アプリ全体のCSRFを無効化しない。redirect先は許可したアプリ内pathに限定する。
- GoogleのUser検索にemailを本人識別のキーとして使わない。未連携のGoogleと既存メールUserが衝突しても旧Dotへ接続しない。重複登録を拒否するか等のUXは未決定。DB一意制約と同時callback時の整合をTASK-006で検証する。
- Google専用Userへパスワード再設定を通じて無条件にパスワード認証を追加しない。追加は将来の明示的連携の設計対象。Googleのemail確認情報をConfirmableでどう扱うか、GoogleのみのUserのpassword属性の扱いも未決定とし、sampleのskip_confirmation!やemail検索をそのまま採用しない。

### CookieStore

- Cookie内に必要最小限の認証状態を置き、Railsが復号/改ざん検知、Devise/WardenによるUserの復元と有効性を確認する。CookieにDot本文・音声・Google token・passwordを格納せず、JS/localStorageへ認証情報を返さない。暗号化鍵はサーバーの秘密情報として保護する。
- CookieはDB session IDだけを運ぶものではない。User/Dotは引き続きRDSにあり、CookieStore採用はDB照合や所有者認可の省略ではない。DB障害時にCookieだけで個人APIを許可しない。
- logoutはCSRF保護した変更操作でDeviseのsign_out/session resetとブラウザCookieの消去を行う。通信失敗を完了扱いせず、端末側state/cacheを消去し、利用者切替時に古いresponseを適用しない。
- **コピー済みの有効なCookieをlogoutだけでサーバー側から即時失効できるとは保証しない。** 端末別失効・全端末logoutは提供しない。別端末のCookieは別に残り得る。侵害時の対応は、通常logoutと区別して設計する。
- cookie期限・idle/絶対期限・remember_me・共有端末での再認証は未決定。ブラウザを閉じることやクライアントCookieの削除だけを期限管理の保証にしない。期限をサーバーで検証し、古いCookieの再送も含めて実機試験する。Cookie内timestampのみのidle管理には古いCookie再送の限界がある。
- Deviseのsession復元にはUserキーとauthenticatable_saltの照合がある。password変更によるsalt不一致は失効要因になり得るが、任意の端末の即時失効機能ではない。再設定後の既存Cookie・Google専用User・削除/停止Userの扱いは採用version/設定で検証し、DB sessionの保証を転記しない。

### 本人限定とWeb境界

- 一覧はcurrent_user.dots、詳細・更新・削除はcurrent_user.dots.find相当で統一。所有者はserver決定、入力user_idで変更不可。Controllerは認証・認可、Modelは関連/制約、複数データや外部処理はServiceに分担する。Pundit等の追加は今回決めない。
- 音声・生成処理ID・結果取得にも所有者境界を適用。Job採用時は受理時のUserを固定し、別Userへ再関連付けしない。logoutは受理済みJob取消しではない。削除との競合はTASK-002/003で決める。
- Rails API-onlyへCookie/session/CSRFとDevise/Wardenを明示的に組み込む。Webは同一originの変更requestへCSRF headerを付ける。Origin検証とproxyの公開Host/HTTPS情報を一致させる。CORSやSameSiteだけを認証/CSRF対策としない。
- 開発はViteからRailsへの同一origin proxyを候補にし、固定URL・開発用Google client・local HTTPSを優先。API/認証はno-store、SPA fallbackは画面GET/HEADに限定する。開発でもCSRFを無効化しない。

## 47. 運用・所在地・一次資料

- Rails側で確認/再設定メール、password管理、login/登録/再送のrate limitと列挙対策を運用する。配送はSES東京を候補とし、送信domain・本番送信枠・bounce・配送失敗時の再送、確認/再設定token期限を具体化する。Google停止時はGoogleの新規認証に影響するが、既存Cookieの有効性はRailsで判定する。未連携のメール方式を復旧用に自動接続しない。
- Userのpassword hash、Google識別子、確認/再設定関連データはRDS東京。Cookie sessionは**利用者のブラウザに保存される**ため、session情報を東京のDBだけで管理するという説明を外す。ログ/backupも保持・削除対象。Google・メール受信先・外部AIの地域は別に確認し、国内限定を約束しない。
- ALB/Fargate/RDS、NATなしのネットワーク初期案、backup・監視、月5,000円目標/月1万円前後許容は維持。過去§42の基盤固定相当試算は参考だが、Cognito料金・OTPメールの見積項目を現行見積もりへ持ち込まない。確認/再設定メール、保守・監視費を含め再見積もりする。Budgets/Cost Anomaly Detection/Calculatorは公開前の設定対象で、今回は設定しない。
- ALB等のaccess logにはGoogle callbackのcodeやメールリンクtokenが入り得る。初期のALB access log無効案を維持し、必要なmetricsと秘密を除いたRailsログで観測する。メールリンク到達ページの第三者送信・Referrer・cacheも確認し、Rails parameter filterだけで防げたと扱わない。

一次資料（2026-09-24確認。機能説明と本アプリの設計判断を区別。version固定・実機検証は後続）:

- [Devise公式](https://github.com/heartcombo/devise): DatabaseAuthenticatable/Confirmable/Recoverable/Omniauthable、API mode。認証機能の採用根拠。全moduleや標準の退会routeを無条件に有効化しない。
- [Devise session復元](https://github.com/heartcombo/devise/blob/main/lib/devise/models/authenticatable.rb)、[password由来salt](https://github.com/heartcombo/devise/blob/main/lib/devise/models/database_authenticatable.rb): CookieからのUser復元とpassword変更時の照合の根拠。
- [Rails Security Guide](https://guides.rubyonrails.org/security.html#session-storage): CookieStoreの暗号化、保存・replay・期限の制約。
- [Rails API-only Guide](https://guides.rubyonrails.org/api_app.html#using-session-middlewares): Cookie/session middlewareの組込みが必要。
- [OmniAuth](https://github.com/omniauth/omniauth)、[Rails CSRF protection](https://github.com/cookpad/omniauth-rails_csrf_protection)、[request phaseのCSRF対策](https://github.com/omniauth/omniauth/wiki/Resolving-CVE-2015-9284): 開始POST・CSRF保護を検証する根拠。
- [Google strategy](https://github.com/zquestz/omniauth-google-oauth2): provider連携候補。READMEのUser作成例は本アプリの自動統合・確認仕様として採用しない。

## 48. 未決定事項と後続への引継ぎ

| 対象 | 残判断・検証 |
| --- | --- |
| TASK-001 | 録音前ログイン、Cookieの有効/idle/絶対期限、remember_me、再認証、確認/再設定token期限・再送・ログイン導線、password方針・濫用対策の具体値、Google確認情報・メール衝突時UX |
| TASK-002 | password hash/確認・再設定情報/Google識別子の保持・削除、旧localStorageの消去、User削除とCookie再送・backup復元の整合。Google account自体の削除とは別 |
| TASK-003 | 受理時Userを維持する生成/再試行/Job、削除との競合。認証方式変更でAI provider・Jobを先に確定しない |
| TASK-005 | 登録・確認/再送・password login/reset・Google開始/callback・認証状態・logoutのmethod/path/error、Cookie/CSRF、メール衝突/確認待ち/期限切れ、所有者境界、client cacheの契約 |
| TASK-006/007/015 | 採用Gem versionとAPI-only適合、2人の拒否、確認・再設定、Google失敗/state不正・同時callback、Cookieコピー再送・期限・logoutの限界、Google専用Userへのreset迂回防止、ログ/メール/共有端末を実証 |
| 将来 | DB sessionによる端末別失効・全端末logout、明示的アカウント連携、MFA/passkey・手動復旧。要件が生じてから再判断 |

依存先の決定成果物は未提供。TASK-001はIn progress、TASK-005/006/007はBlockedを維持。TASK-002/003/004の独立検討は引き続き可能。今回の承認を、具体期限・画面・schema・AWS作成の承認に拡張しない。

## 49. Devise切替の検証・完了記録

- 開始状態: branchはcodex/identity-data-residency-design、HEAD/remote PR先端は27b4a6c、mainは4b5365b。読み取り専用ls-remoteで確認。既存の未コミット8文書を保護し、.worktrees/は未変更。
- 計画: §45–48を先に整理し、現行文書を同じ変更で更新。認証実装・AWS作成・新規branch/PRなし。
- 機械検証: 変更8文書の相対リンク/見出しリンク35件に欠落なし。過去§4 Current Stateが作業前と一致、16タスクのID/パス/状態を維持、変更はdocsの8 Markdownだけ。git diff --check通過。
- 机上検証: 下表と§46の経路を照合。current_userの所有者境界、確認前の拒否、Google自動統合禁止、CookieStoreのlogout限界と復旧・再試行の未決定項目を確認した。稼働試験ではない。
- 自己レビュー: 差分と一次資料を照合。Cognito固有経路・メールOTP・DB sessionの失効保証が現行仕様に残らず、Google callback保護は残ることを確認。秘密情報・実利用者データ・参考サービスの固有情報なし。既存のAWS/予算の決定を維持。
- 既存チェック: pnpm type-check成功、pnpm test成功（script 15件、Web 16件/5ファイル）。pre-pushの必須チェックに合わせて実行したもので、未実装のDeviseの安全性を検証した結果ではない。
- 未実施: アプリbuild・Rails test、実Google/メール送信、Cookie/CSRF/Devise実動作、AWS負荷/復元/料金の実測。文書のみの変更であり成功扱いにしない。

| TASK-001完了条件 | 結果 |
| --- | --- |
| 方式・正本・開始/終了/失効の決定 | 一部完了。方式変更は承認済み。期限・確認/復旧の細部等は§48に残る |
| 選択肢比較 | 完了。旧比較を履歴に保持し、§45–47でDevise/CookieStoreの理由と代償を整理 |
| 採用方式の資格情報/CSRF/認可境界 | §46で明文化。実機検証は後続 |
| 正本文書への反映とTASK-005への引継ぎ | 完了。product/journaling/architectureとTASK-005を§45–48に照合し、確定条件と残判断を分離 |

TASK-001はDoneにしない。PR更新の完了と設計タスク全体の完了は区別する。

### 現行設計の机上シナリオ

| 主体・操作 | 設計上の結果 / 未確認範囲 |
| --- | --- |
| A/Bが自分のDotを一覧・取得・更新・削除 | 各current_userのscopeのみ。作成ownerはserverが設定 |
| AがBのDot ID/ownerを送信 | Bのデータを返さず変更しない。関連音声・生成結果も同じ境界 |
| 未認証・メール確認前・改ざんCookie | 保護APIを拒否。localStorageからログイン扱いにしない |
| 期限切れCookie | 採用する期限をserverで検証し拒否。期限値・実装・古いCookie再送試験は未決定/未実施 |
| 通常logout / 事前コピーしたCookieの再送 | 操作したブラウザの認証状態を解除。コピーの即時失効は保証しない。DB session案の拒否保証を適用しない |
| 同一メールのGoogleが未連携 | emailだけで既存User/旧Dotへ接続しない。衝突時UXは未確定 |
| 再設定メール失敗・期限切れ・再利用 / Google専用Userへのreset | 成功と偽らず無条件な認証手段追加をしない。再送・token更新と使用済み拒否は後続契約/実機試験で確認 |
| Google callback失敗・state不一致・再送 | 認証成功扱いにしない。認証開始から再試行。採用strategyでの検証は後続 |
| Aの生成受理後にlogoutしBへ切替 | 受理済み処理のUserはAのまま、Bへの結果表示・関連付けを禁止。取消し/削除競合はTASK-002/003 |

既存PR #27への反映対象はこの8文書とPR本文・タイトル。反映の成否はpushとPR先端の照合後に報告する。


## 50. MVPの初期案と判断範囲（2026-09-25）

以下はユーザーが指定した方向を具体化した初期案で、**2026-09-25にユーザーが採用した（§56）。未実装**。§53の衝突時案内は§56の判断で変更した。§45のDevise/OmniAuth/CookieStore、本人所有者認可、同一origin・CSRF、AWS東京と予算方針は変えない。§48の残判断を具体化するもので、承認後に現行仕様の受け入れ条件へ移す。

| 項目 | 初期案 | 利用者への影響 | 実装・運用への影響 |
| --- | --- | --- | --- |
| 自分専用端末のsession | 認証成功から7日（168時間）の絶対期限。操作による延長なし | 毎日使っていても7日後には入り直す。ブラウザ再起動後も期限内は利用可能 | serverが固定の期限を毎requestで検証。Cookie期限だけに依存しない |
| 利用開始 | 録音前にログイン・利用可能状態を確認 | 初回は登録・メール確認が先。録音後にログインを要求して音声を失う場面を減らす | /record直アクセスもguardし、マイク開始前にserverへ確認。音声/生成APIにも認証必須 |
| 確認/再設定メール | 確認24時間、再設定6時間、使用後は再利用不可。送信制限と共通応答 | 期限切れは再送、連打では届かない。登録有無は画面から判別できない | §52の標準からの差分と送信制限を追加。メール配送/失敗監視が必要 |
| Googleとメール | email一致で統合しない。連携は既存Userへのログイン後に双方を確認 | 同じメールでもGoogleから既存Dotへは入れない。連携UIは将来対応 | provider/uidの一意対応、衝突拒否、resetによる迂回防止。§53参照 |
| 端末管理 | 一覧・端末別失効・全端末logoutはMVPから外す案を維持 | 紛失端末を画面から切断できない。既存Cookieは元の期限まで残る | session台帳/UIを省ける。全端末logoutのみならUser世代番号という追加案もある（§54） |

## 51. 7日固定期限と録音前ログイン

- メール＋passwordまたは検証済みGoogle認証で通常sessionを新規発行した時刻を起点とし、暗号化Cookie内の認証期限を固定する。期限以上、期限欠落、不正Cookie、削除/停止Userでは保護APIを拒否する。Cookieを再発行しても元の期限を引き継ぎ、通常操作・polling・CSRF更新で7日を再計算しない。明示的なログイン成功でのみ新しい期限を設定する。
- CookieはHttpOnly/Secure/SameSite=Lax・host-onlyを維持する。Railsのexpire_afterだけで「自動延長なし」が成立したとは扱わず、サーバー期限とブラウザExpires/Max-Ageを揃えて検証する。7日はDeviseの標準値ではない。
- Rememberableによる別Cookieからの自動再ログインと、Timeoutableによる別のidle期限は初期案では使わない。Deviseのremember_forやtimeout_inを7日に変えるだけでは絶対期限の代替にならない。自分専用端末を前提として7日保持をログイン画面で説明し、共有端末の短期モードは別判断とする。ブラウザを閉じるだけでlogoutすると説明しない。
- 期限切れ時はWebの個人表示/cacheを解除してログインへ戻す。通常logoutはCSRF保護したsign_out/session reset。Cookieコピーの即時失効は引き続き保証しない。期限が延びないためコピーの利用可能期間も元の認証から最大7日だが、漏えい対策の代替ではない。Google側のsessionや端末内の保存passwordは別で、端末を奪われた相手が新たにログインできる場合の被害を7日に限定する保証ではない。Googleからの入り直しで必ずpassword入力を求めるとも保証しない。

```text
録音開始操作 / /record直アクセス
  → RailsでUser・メール確認状態・固定期限を確認
  → 未認証/期限切れ: ログイン（メール登録直後は確認メール → ログイン）
  → 確認成功: 録音の説明 → マイク許可 → 録音
  → 送信時にもRailsで再確認 → current_userを所有者に固定 → 生成/保存
```

clientの期限表示は案内用で、serverの拒否を優先する。録音中の期限切れや別タブlogoutでも認証を迂回してuploadしない。再ログインが別Userなら、前の録音を送信・関連付けしない。同一Userへの復帰時にmemory内音声を再利用するか・破棄するかはTASK-002/003/010で整合させる。音声のlocalStorage保存や「保存済み」という表示を先に追加しない。受理済み処理の所有者は元のUserのままで、logoutをJob取消しとしない。

## 52. Devise標準値、メールの初期案と確認事項

### versionと一次資料で確認した事実

2026-09-25確認時の[RubyGems公開版](https://rubygems.org/gems/devise)と[公式release](https://github.com/heartcombo/devise/releases/tag/v5.0.4)は**5.0.4（2026-05-08）**。本repoのGemfile/lockfileにはDeviseもOmniAuthもなく、導入versionは未確定。以下は5.0.4の確認結果であり、インストール済み設定ではない。TASK-006で採用時のrelease、Rails 8.1.3.1との組合せ、initializerとUserでの上書きを確認して固定する。

| 設定 / 機能 | v5.0.4の標準 | 初期案 / 理由 |
| --- | --- | --- |
| confirm_within | nil（期限なし） | **24時間を明示設定**。期限付きという要求を満たすため変更 |
| allow_unconfirmed_access_for | 0日 | 維持。メール確認前は通常sessionによるDot利用を許可しない |
| reset_password_within | 6時間 | **6時間を維持**。期限内でも成功後は再利用不可 |
| paranoid | false | **true**を候補にし、APIのstatus/bodyも統一。設定だけで全列挙対策が完了したとしない |
| sign_in_after_reset_password | true | **false**を提案。再設定後はログイン画面へ戻し、7日起点を通常ログインに揃える |
| remember_for / extend_remember_period | 2週間 / false（Rememberable使用時） | module自体を初期案で使わない。通常CookieStoreの期限とは別 |
| timeout_in | 30分（Timeoutable使用時の無操作期限） | 初期案で使わない。7日の絶対期限は別に検証 |
| 確認/再設定メールの再送間隔・回数 | 下記標準controller/modelには回数・間隔による送信制限なし | アプリ側で制限。Lockableのログイン失敗回数制限とは別 |

根拠: [v5.0.4設定本体](https://github.com/heartcombo/devise/blob/v5.0.4/lib/devise.rb)、[生成initializer](https://github.com/heartcombo/devise/blob/v5.0.4/lib/generators/templates/devise.rb)、[ConfirmationsController](https://github.com/heartcombo/devise/blob/v5.0.4/app/controllers/devise/confirmations_controller.rb)、[PasswordsController](https://github.com/heartcombo/devise/blob/v5.0.4/app/controllers/devise/passwords_controller.rb)、[共通successfully_sent?](https://github.com/heartcombo/devise/blob/v5.0.4/app/controllers/devise_controller.rb)。initializerのコメント例を有効な設定とみなさない。paranoidは新規登録全体を自動で秘匿しない。

### tokenの使用・再送

[Confirmable](https://github.com/heartcombo/devise/blob/v5.0.4/lib/devise/models/confirmable.rb)は確認済み状態の再確認を拒否し、期限内の再送では同じtokenを再利用する。**再送のたびに古い確認リンクが失効する方式ではない**。初期案はこの挙動を許容し、生成から24時間を延長せず、期限切れ後の再送は新tokenとする。確認リンクの訪問だけで通常ログインさせず、確認完了後にpasswordでログインする。

[Recoverable](https://github.com/heartcombo/devise/blob/v5.0.4/lib/devise/models/recoverable.rb)は再送で新tokenに置き換え、password更新に伴いreset tokenを消去する。初期案は「最新メールのリンクを使用」と案内する。期限内・使用後・再送前の古いtoken、同時送信と同時消費、配送順の逆転を実機検証する。**一度限りは成功した処理の再利用を拒否する要件**であり、URLを一回表示するだけでreset済みにしない。標準source確認だけで並行requestの単一成功を保証せず、必要ならtransaction/lockで消費を直列化する設計をTASK-006で確認する。

tokenをaccess log・監視・Referrer・第三者scriptへ送らず、リンク到達ページはno-storeとする。確認tokenとreset tokenでDB保存形式が同じだと推定しない。メールscannerのリンク先訪問が確認状態を変える影響も受け入れ試験に含める。

### 再送制限とアカウント列挙防止（数値は提案）

- 確認/再設定を合算し、**宛先ごと60秒に1回・1時間に5回、送信元IPごと1時間に20回**を初期候補とする。新規登録からの確認メールも迂回経路にしない。IP共有による不便とメール攻撃の実測で調整する。ログイン試行の制限値は別の残判断。
- 宛先keyは登録時と同じ正規化を行い、秘密鍵付きdigest等を使って生メールをログへ出さない。存在/非存在・確認済み・Google専用を問わず同じ制限経路を通す。未知メールの制限記録も個人データとして短期保持/掃除を設計する。
- 宛先単位の送信可否は公開せず「該当するアカウントがある場合、手続きのメールを送ります」という同じstatus/bodyの受付応答にする。IP全体制限の429案はアカウント存在と無関係に適用し、具体schemaはTASK-005で決める。配送成功を保証する文言にしない。
- paranoidに加え、独自JSON応答、新規登録の重複、Google専用へのreset、送信エラーと応答時間の差も確認する。標準設定だけでこれらが揃うとは説明しない。配送処理の分離が必要ならTASK-003と整合させ、今回Job基盤を決定しない。
- 制限はブラウザのボタン無効化だけではなくserverで実施する。ECS再起動・複数worker・deployment中の新旧taskでも合算できる共有保存先が必要。**既存RDSの原子的なcounter更新を第一候補**にし、専用Redis等の追加インフラは前提にしない。DB負荷、期限切れ掃除、制限基盤の異常時はメール送信を止める扱いを確認する。運用費ゼロとは見積もらない。

## 53. Googleとメールの衝突・将来の連携

初期案では、未連携Googleと既存Userのメールが一致しても新しい認証手段を付けず、既存UserやDotを返さない。同じメールの重複User作成も拒否する。案内は§56で採用した内容とし、Googleが確認済みと返したメールに限り「このメールアドレスはメール＋パスワードで登録済みです。メールでログインしてください」と登録方法を示す。確認済みでないメールでは登録有無を断定せず「ログインできませんでした。普段のログイン方法でやり直してください」と共通案内する。通常ログイン成功後の画面で、連携がMVP対象外であることを説明する。GoogleのみのUserへpassword resetを使ってpasswordを追加しない。

将来の明示的連携は、**既存アカウントへログイン → 既存手段で再認証 → 追加するGoogle/メール手段の確認 → 利用者が連携を確定**の順とする案。CSRF/state、連携の意図・開始User・期限を結び付け、別Userに付いているprovider/uidの奪取を拒否する。メール手段の追加でも確認メールとpassword設定を要する。既に別々に存在するUserのDot統合はこの連携とは別設計にする。

既存の「連携UI/実装は将来対応」を維持し、今回の依頼では安全な方針のみ示す。Google認証情報でConfirmableをどう満たすか、採用strategy/version、Google専用Userのpassword属性と拒否応答は引き続き要判断・要実機検証。

## 54. 端末管理の必要性と追加コスト

以下は設計上の相対評価で、工数/請求額の実測ではない。CookieStoreを維持しても全端末logoutを追加する方法はあり、「必ずDB sessionへ移行が必要」とはしない。

| 選択肢 | 利点・利用者への影響 | 追加実装/運用コスト | 判断案 |
| --- | --- | --- | --- |
| 一覧・遠隔logoutなし | 操作が少ないが、紛失端末やコピーCookieを自分で即時切断できない | 最小。期限/通常logout/再設定の検証は必要 | **自分専用端末の小規模MVPでは第一候補**。既存Cookieが期限まで残るリスクを受け入れる判断が必要 |
| 全端末logoutのみ | 不審な利用時に一括切断。自分も再ログインが必要 | 小〜中。Userの認証世代番号とCookie値を毎requestで照合し、更新時に旧世代を拒否。UI/CSRF/再認証/競合試験を追加 | 即時切断を公開要件にするなら優先追加。端末台帳なしでも可能、今回は保留 |
| 端末一覧＋個別/全端末logout | 紛失した端末を選べる。ただし表示名/IPだけでは物理端末を断定できない | 中〜大。DB session台帳、最終利用時刻・失効・期限掃除、一覧UI、IP等の保持、並行操作の検証 | MVPでは不要。複数端末の管理需要が確認されてから |

後二案も既存RDS内で構成でき、追加の固定AWSサービス費を必須としない。ただしDB保存/更新・backup・監視負荷と保守工数は増え、金額・人日は実装見積もり前には断定しない。Deviseのsign_out_all_scopesは認証scopeの処理であり、全端末logout機能と解釈しない。password再設定後のsalt変更による既存Cookie拒否は別途実証し、Google専用Userの遠隔失効手段として代用しない。

## 55. 今回の検証と残作業

- 開始状態: codex/task-001-auth-details、HEAD fd328ea（PR #27マージ済み）。追跡済み差分なし、未追跡.worktrees/を保護。Devise未導入をGemfile/lockfileで確認。
- 対象は6文書の初期案。§4 Current State、折り畳み履歴、§45–49がHEADと一致することをPythonで検証した。6文書の相対リンク34件に欠落なし、16タスクのID/状態は不変。git diff --check通過。
- 机上検証: A/Bの一覧・詳細・更新・削除は引き続きcurrent_userで限定。未認証は録音前に止め、失効時は録音済みでも送信を拒否。Aの録音をBへ再送しない条件と受理済み処理の所有者維持を確認。元の期限を引き継ぐCookie再発行、期限前後、確認再送でのtoken再利用、reset再送での置換、使用済み拒否、Google衝突の各経路を§51–53と照合した。並行消費と実際の失効は未実証として残した。
- 差分レビュー: 変更は文書6件のみ。採用済み条件と初期案を区別し、秘密情報・実利用者データ、他人のDotへ接続する経路、実装/AWS作成の混入がないことを確認。tokenのログ/Referrer漏えいと再送・中断時の未確認点を明示した。commit/push/PR操作なし。
- 未実施: 認証コード、Gem導入、設定、実Google/メール送信、期限・token並行消費・Cookie/CSRF・再送制限のruntime試験、AWS作成。文書のみのためアプリtest/buildは再実行せず、過去の成功結果を今回の認証実証に転用しない。

| TASK-001完了条件 | 今回の結果 / 残作業 |
| --- | --- |
| 方式・正本・開始/終了/失効の決定と人間の確認 | 一部完了。§50–54で初期案を具体化したが未承認。password方針/ログイン濫用対策、Googleの確認情報、共有端末/重要操作時の再認証をなお判断する |
| 選択肢比較 | 完了。既存比較に固定期限/自動延長、メールの標準差分、端末管理3案を追加 |
| 資格情報/CSRF/認可境界 | 明文化済み。録音前と送信時の確認、別Userへの再送禁止、Cookieコピーの限界を補足 |
| 正本文書への反映とTASK-005への引継ぎ | 初期案として参照を追加。承認後に確定条件へ移す。正式API契約は未作成 |

TASK-001はIn progressを維持する。TASK-002/003/004はTodo・Plan未作成で、保持/生成/履歴の成果物・検証結果はまだない。TASK-005/006/007のBlockedを解除しない。TASK-002/003/004の独立検討は引き続き可能だが、今回新たに着手可能となる実装タスクはない。

## 56. 人間の判断と採用内容（2026-09-25）

§50–54の初期案をレビューし（§57）、ユーザーが以下を判断した。設計採用であり、実装・実機検証ではない。

| 項目 | 採用内容 | 利用者への影響 | 実装・運用への影響 |
| --- | --- | --- | --- |
| session | §51の7日固定・自動延長なし。Rememberable/Timeoutableを使わない | §50のとおり | §51のとおり |
| 録音前ログイン | §51のとおり録音前と送信時に確認 | §50のとおり | §51のとおり |
| 確認/再設定メール | 確認24時間、再設定6時間、成功後の再利用拒否、確認後・再設定後はログイン画面へ戻す | §50のとおり | §52のDevise標準からの差分を設定 |
| 再送制限 | 確認/再設定合算で宛先60秒に1回・1時間5回、IPごと1時間20回。共通受付応答 | 連打・大量送信は届かない。登録有無は画面から判別できない | §52のとおりRDSの共有counterでserver側に実装 |
| Google同一メール衝突 | 統合も重複作成もしない。**Googleが確認済みと返したメールに限り**、メール＋パスワードで登録済みであることとメールでのログインを案内。未確認メールでは共通の失敗案内 | 登録方法を忘れた本人が迷わず戻れる | Googleの確認済み判定を採用strategyで検証。sessionを発行せず、既存Userの情報は登録方法以外返さない |
| 再認証 | メール変更・password変更・退会では現在のpasswordを要求。Google専用Userには直近のGoogle再ログインを要求。共有端末向け短期モードはMVP外とし、ログイン画面で自分専用端末向け・7日保持と共有端末では使用後にlogoutすることを明示 | 重要操作だけ入力が増える。共有端末では自分でlogoutが必要 | password確認はDeviseのupdate_with_password相当。Google再認証の要求方法と「直近」の有効時間はTASK-006でstrategyの対応と合わせて確定。対象操作の有無はTASK-002の退会等に従う |
| 端末管理 | 一覧・個別/全端末logoutはMVP外。紛失端末を即時切断できない制約を受け入れる | 7日の期限、または動作確認後のpassword変更で切れる見込み | §54のとおり。将来は全端末logoutのみUser世代番号で追加可能 |

Google衝突時の案内を変えた理由: Googleが確認済みとしたメールであれば、画面を見ているのはそのmailboxの管理者であり、第三者によるアカウント列挙の経路にはなりにくい。一方、共通の失敗案内だけでは衝突の大半を占める本人が復帰できない。確認済みでないメールや、確認済み判定の取得に失敗した場合は共通案内に戻す。

## 57. Claude Codeへの引継ぎ後のレビューと検証（2026-09-25）

- 開始状態: branchはcodex/task-001-auth-details、HEADはfd328ea。§55までの6文書の未コミット差分をAstraから引き継ぎ、未追跡.worktrees/は変更していない。
- 一次資料の再確認: RubyGems APIの最新版が5.0.4であること、v5.0.4の`lib/devise.rb`でconfirm_within=nil、reset_password_within=6時間、paranoid=false、sign_in_after_reset_password=true、allow_unconfirmed_access_for=0日、remember_for=2週間、timeout_in=30分であることを確認した。`confirmable.rb`で期限内の再送時に既存tokenを再利用することも確認した。§52の記載と一致。
- レビュー指摘: (1) 衝突時の共通案内では本人が復帰できない → §56で変更。(2) 再認証の初期案がない → §56で採用。(3) Railsの`rate_limit`は共有されるcache storeが必要だが、現行production設定ではcache_storeが未設定のためタスク間でcounterを共有できない。§52のRDS counter方針を維持し、Solid Cache（RDS）+ `rate_limit`も実装候補としてTASK-006で比較する。security上の修正必須指摘なし。
- 反映: 採用内容を本Plan、TASK-001/005、product、journaling、architectureへ移した。
- 未実施: 認証コード、Gem導入、設定、実Google/メール送信、期限・token並行消費・Cookie/CSRF・再送制限・再認証のruntime試験、AWS作成。文書のみのためアプリtest/buildは実行しない。

| TASK-001完了条件 | 結果 / 残作業 |
| --- | --- |
| 方式・正本・開始/終了/失効の決定と人間の確認 | 完了。session期限・録音前ログイン・メール・衝突時案内・再認証・端末管理を§56で採用。password方針（長さ等）とログイン試行制限の具体値、Googleの確認情報でConfirmableを満たすか、Google再認証の有効時間はTASK-006へ移管 |
| 選択肢比較 | 完了 |
| 資格情報/CSRF/認可境界 | 明文化済み。実機検証はTASK-006/007/015 |
| 正本文書への反映とTASK-005への引継ぎ | 完了。正式API契約はTASK-005で作成 |

残りの3点は採用Gem versionとstrategyの挙動に依存するため、ユーザーの判断で[TASK-006](../tasks/TASK-006-backend-identity.md)の実装Planへ移した（再送counterの実装手段の比較を含む）。これによりTASK-001はDoneとする。TASK-005はTASK-002/003/004の成果物待ちでBlockedを維持し、TASK-006/007もTASK-005待ちのためBlockedのまま。
