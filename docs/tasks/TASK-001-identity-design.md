# TASK-001: 認証と利用者識別の設計判断

| 項目 | 内容 |
| --- | --- |
| ID | TASK-001 |
| タスク名 | 認証と利用者識別の設計判断 |
| 対象領域 | 共通 |
| 作業区分 | 設計判断 |
| 優先度 | P0 |
| 状態 | Done |

## 目的と作業範囲

最初の永続Dot APIを利用するため、利用者の識別、認証の開始・終了・失効とWeb/APIの配信構成に合う方式を比較する。既存のlocalStorageを認証・認可の正本にしない。認証の実装はTASK-006 / TASK-007で扱う。

## 確認可能な完了条件

- [x] 認証方式と利用者識別の正本、認証の開始・終了・失効時の振る舞いが決まり、人間が選択理由を確認している。
- [x] Cookie / session、token、外部identity providerなどの適用可能な選択肢を、配信構成・脅威・運用負荷で比較している。
- [x] 採用方式で必要なWeb/API間の資格情報の受け渡し、CSRF / CORS等の対策、本人のDotに限定する認可境界が明文化されている。
- [x] 決定をproduct / journalingとarchitectureの該当箇所へ反映し、API契約で確定すべき項目をTASK-005へ渡している。

## 依存するタスクID

なし。

## 根拠となる仕様書と見出し

- [product.md](../product.md) — 「5. 保留事項と再検討条件」
- [journaling.md](../journaling.md) — 「4. 実サービスのMVP受け入れ条件」
- [journaling.md](../journaling.md) — 「5. 未決定事項」

## 必要な検証

- 利用者2人・未認証・認証失効のシナリオで、保存・一覧・詳細・更新・削除の主体を説明できること。
- 配信構成と資格情報の保存・送信経路を図示し、選択した方式の脅威と対策をレビューすること。

## 関連Implementation Plan

[認証と利用者識別の設計比較Plan](../implementation-plans/2026-09-21-task-001-identity-design.md)。採用済みの基礎方針は**§45–48**、認証詳細は**§50–54と§56**、残作業は**§57**。§49・§55は前回までの検証記録。§16–44は過去の比較記録であり、現在の採用条件にしない。構成の正本は[architecture](../architecture.md)。

## 採用済み事項と残作業（2026-09-24 Devise切替）

- Rails + Deviseでメールアドレス＋パスワード、確認メール、パスワード再設定。GoogleログインはOmniAuth。メールOTPとCognito固有の認証経路・利用者対応は採用しない。
- 通常認証はRails標準CookieStore。HttpOnly・Secure・SameSite=Lax、同一originとRailsのCSRFを維持する。DB sessionによる端末別失効・全端末logoutは将来要件。コピー済みCookieをlogoutだけで即時失効できるとは保証しない。
- 内部Userを所有者として、current_userのDotだけを一覧・取得・更新・削除する。clientのowner指定やGoogle/email一致の自動統合は認めない。明示的連携は将来対応。
- MFA、passkey、運営者による手動アカウント復旧はMVP対象外。復旧はDeviseのpassword再設定とGoogleの標準機能の範囲とし、Google専用Userへのreset経由の無条件なpassword追加はしない。
- AWS東京のALB + ECS Fargate + RDS PostgreSQL、初期1タスク・Single-AZ、React成果物のRails同梱・同一originを維持。日記・音声・AI入力は原則東京だが国内限定を約束しない。
- 基盤費は月5,000円目標・月1万円前後許容、音声保存・文字起こし・AI・通信量は別予算。Calculator/Budgets/Cost Anomaly Detectionは公開前の設定対象。

### 認証詳細の採用（2026-09-25、未実装）

- 自分専用端末は認証成功から7日で失効し、自動延長しない。Rememberableの自動再ログインや別のidle期限を使わず、serverが固定期限を毎requestで確認する。
- 録音開始・マイク利用前にログイン/メール確認状態を確認する。送信時も再確認し、別Userへの入り直し後に元の音声を送らない。
- 確認メール24時間、password再設定6時間。確認後・再設定後はログイン画面へ戻す。Devise 5.0.4では確認期限はnil、resetは6時間。導入版は未確定で、期限付き・成功後再利用不可・再送制限・アカウント有無を明かさない応答を実装時に検証する。
- 再送は確認/reset合算で宛先60秒に1回・1時間5回、IPごと1時間20回。Devise標準の再送制限値ではない。paranoidと独自API応答/共有counterの条件はPlan §52。
- 同一メールの未連携Googleから既存Userへ接続せず、重複User作成も拒否する。Googleが確認済みと返したメールに限り、メール＋パスワードで登録済みでありメールでログインするよう案内する。将来の連携は既存Userへのログイン/再認証と追加手段の確認後に行う。連携UIは将来対応のまま。
- メール変更・password変更・退会では現在のpasswordを、Google専用Userには直近のGoogle再ログインを要求する。共有端末向け短期モードはMVP外とし、ログイン画面で自分専用端末向けであることを明示する。
- 端末一覧・個別/全端末logoutはMVP外。全端末logoutだけならUserの認証世代番号を照合する追加案もあり、DB sessionへの移行が必須とはしない。コスト/残存リスクはPlan §54。

各項目の利用者/実装への影響と一次資料はPlan §50–54・§56。以前の30分/12時間等は採用しない。password方針とログイン試行制限の具体値、Googleの確認情報でConfirmableを満たすか、Google再認証の有効時間は、採用Gem versionとstrategyの挙動に依存するため[TASK-006](TASK-006-backend-identity.md)へ移した。**2026-09-25に人間が移管を判断し、TASK-001をDoneとした。**

TASK-005へ現在の境界を、TASK-006へ残判断を引き継ぐ。TASK-005/006/007はBlockedを維持し、TASK-002/003/004の独立した設計検討は引き続き可能。機能実装・AWS作成・実機検証を完了扱いにしない。過去の進捗と比較はPlanの折り畳み履歴を参照する。
