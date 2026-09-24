# TASK-005: 実サービスのAPI契約と契約管理の確立

| 項目 | 内容 |
| --- | --- |
| ID | TASK-005 |
| タスク名 | 実サービスのAPI契約と契約管理の確立 |
| 対象領域 | 共通 |
| 作業区分 | API契約 |
| 優先度 | P0 |
| 状態 | Blocked |

## 目的と作業範囲

設計判断をWeb/APIで共有する正式なrequest / response / error契約と管理・検証方法にする。現在の本文なしPOST /dotを正式契約とみなさない。個別endpointの機能実装はBackendタスク、呼び出し実装はFrontendタスクに分ける。

## 確認可能な完了条件

- [ ] 認証、音声の受け渡し、生成と再試行、Dotの保存・本人の一覧/詳細・決定した更新/削除の契約が定義されている。非同期の状態取得は採用時のみ含める。
- [ ] 利用者の所有権、日付・duration・Dot項目、一覧の取得境界、入力制限、認証失効/未取得/各処理失敗をWeb/APIで同じ意味として扱える。
- [ ] 冪等性に必要な識別子・再送時の応答と、保持状態・再試行可能性の伝達方法が契約化されている。
- [ ] OpenAPIの採否、型生成・生成物管理・schema検証と契約検証toolの扱いを決定し、最初の契約を選んだ方法で検証できる。
- [ ] Web/API/契約の同時更新と、デプロイ時差を考慮した互換性確認の運用が決まっている。
- [ ] journalingとarchitectureを更新し、実装タスクから参照できる契約の正本がある。

## 依存するタスクID

- TASK-001
- TASK-002
- TASK-003
- TASK-004

依存関係の上流にある設計判断・API契約が未確定のためBlocked。確定後は依存先の提供状況を確認して着手する。

## 根拠となる仕様書と見出し

- [product.md](../product.md) — 「4. MVP対象外と実装前に決めること」
- [product.md](../product.md) — 「5. 保留事項と再検討条件」
- [journaling.md](../journaling.md) — 「3. モックと実サービスの区別」
- [journaling.md](../journaling.md) — 「4. 実サービスのMVP受け入れ条件」

## 必要な検証

- 成功/異常responseとrequestの具体例を契約に照らして検証し、Frontend / Backend双方で解釈が一致すること。
- 一覧の続き・日付境界・再試行・認証失効・削除済みDot・互換性の例をレビューすること。

## 関連Implementation Plan

未作成。着手時にAGENTS.mdの規約に従って作成し、ここへリンクを追記する。

### 上流の採用決定と残る論点（2026-09-24 Devise切替）

[TASK-001 Plan](../implementation-plans/2026-09-21-task-001-identity-design.md)の§45–48・§50–54・§56（採用済み）と§57（残作業）および[architecture](../architecture.md)を参照。過去のCognito/DB session案を正式契約へ転記しない。本タスクのPlanと正式契約は未作成。

- 採用済み: Rails + Deviseのメール＋パスワード・確認メール・パスワード再設定、OmniAuthのGoogleログイン。通常認証はRails CookieStore、HttpOnly/Secure/SameSite=Lax、同一origin、CSRF、current_userによる本人のDotの一覧/取得/更新/削除。
- 基盤はAWS東京ALB + ECS Fargate + RDS PostgreSQL、初期1タスク・Single-AZ、React同梱。国内限定を約束しない。保持・削除・AIの具体条件は別途確定。
- 利用者はDevise/WardenとDBから確定する。Googleは検証済みprovider/uidで対応し、email一致の自動統合をしない。衝突時の案内は下記の採用内容、Google確認情報の扱いはTASK-006で決める。Google専用Userへreset経由で無条件にpassword認証を追加しない。
- 契約対象: 登録・確認/再送・password login/reset・Google開始/callback・状態確認・logout・CSRFのmethod/path/request/response/error。確認待ち・期限切れ・不正callback・メール配送失敗・衝突時の挙動、個人APIのno-storeも定義する。
- CookieStoreのlogoutはブラウザCookieの消去であり、コピー済みCookieの即時失効を保証しない。期限検証とUserの有効性確認を区別する。端末別失効・全端末logout用DB session、MFA/passkey/手動復旧、明示的アカウント連携は今回の契約へ追加しない。
- TASK-006へ移管した判断: password方針・ログイン試行制限の具体値、Google確認情報とConfirmableの関係、Google再認証の有効時間。reset後の既存Cookieの実動作は実機検証が必要。過去の30分/12時間等の提案値を採用しない。
- TASK-002/003/004の保持・削除・生成/再試行・履歴の決定成果物は未提供。認証方式の変更だけではBlockedを解除しない。

### 2026-09-25の認証詳細の採用（契約への入力）

- 7日固定期限・自動延長なし、録音前ログインを採用。認証状態応答の期限表示、期限切れ時の拒否/再ログイン、別Userへの録音再送禁止を契約で具体化する。
- 確認24時間/reset6時間、確認後とreset後はログイン画面へ戻す。Devise標準との違い、再送時のtoken再利用/置換、同時消費はPlan §52を参照する。
- 再送の共通受付応答、宛先制限時も登録有無を明かさない扱い、IP制限、配送失敗、Google専用Userへのreset拒否を含める。status/schemaはまだ確定しない。
- Google同一メール衝突時は既存Userにも重複Userにも接続しない。Googleが確認済みと返したメールなら「メール＋パスワードで登録済み」の案内、それ以外は共通の失敗案内を返す。両者の区別をerror契約で定義する。
- メール変更・password変更・退会はcurrent password、Google専用UserはGoogle再認証を要求する。対象操作の有無はTASK-002の決定に従う。明示的連携と端末管理のAPIはMVPへ追加しない。
- 採用版Deviseは未確定。5.0.4の標準調査を本アプリの設定済み値として転記しない。他の上流タスクの成果物が揃うまでBlockedを維持する。
