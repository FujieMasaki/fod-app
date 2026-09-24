# TASK-006: 利用者・認証・認可のBackend基盤

| 項目 | 内容 |
| --- | --- |
| ID | TASK-006 |
| タスク名 | 利用者・認証・認可のBackend基盤 |
| 対象領域 | Backend |
| 作業区分 | 実装 |
| 優先度 | P0 |
| 状態 | Blocked |

## 目的と作業範囲

決定した認証方式で利用者を識別し、プロダクトAPIの認証・認可に使える基盤を作る。Rails、PostgreSQL接続、RSpec、品質検査、CIは既存基盤を利用する。Dot個別操作の所有権の適用はTASK-008 / TASK-009 / TASK-013で行う。

## 確認可能な完了条件

- [ ] 選定方式に従う利用者の識別と認証の開始・終了・失効を扱え、未認証requestを契約どおり拒否できる。
- [ ] クライアントが送った任意の利用者IDを所有権の根拠にせず、認証済み利用者をプロダクト処理へ渡せる。
- [ ] 選定方式に必要な資格情報の保護、CSRF / CORS等の対策が実装・設定されている。
- [ ] 資格情報・不要な個人データをresponse/ログへ出さず、契約との一致を確認している。
- [ ] 実装した範囲と未実装のDot操作をjournaling / architecture等の関連現行文書で区別している。

## 依存するタスクID

- TASK-001
- TASK-005

依存関係の上流にある設計判断・API契約が未確定のためBlocked。確定後は依存先の提供状況を確認して着手する。

## 根拠となる仕様書と見出し

- [product.md](../product.md) — 「2. MVPで成立させる体験と完成条件」
- [journaling.md](../journaling.md) — 「3. モックと実サービスの区別」
- [journaling.md](../journaling.md) — 「4. 実サービスのMVP受け入れ条件」

## 必要な検証

- 認証成功・失敗・終了・失効・未認証のAPIテストと、方式に応じた不正な資格情報・CSRF / CORSの検証。
- 異なる利用者を混同せず識別できることと、response/ログに秘密情報がないことの確認。

## 関連Implementation Plan

未作成。着手時にAGENTS.mdの規約に従って作成し、ここへリンクを追記する。

## TASK-001から移管した判断（2026-09-25）

採用Gem versionとstrategyの挙動に依存するため、次の判断を本タスクの実装Planで行う。採用済みの認証詳細は[TASK-001 Plan §50–54・§56](../implementation-plans/2026-09-21-task-001-identity-design.md)を前提にし、変更する場合は人間の判断を得る。

- password方針（最小・最大長等）とログイン試行制限の具体値。Lockableの採否と、確認/再設定メールの再送制限との関係を含める。
- Googleが確認済みとしたメールでConfirmableを満たすか。Google専用Userのpassword属性と拒否応答も合わせて決める。
- Google専用Userの再認証を「直近」とみなす有効時間と、採用strategyで再認証を要求する方法。
- 再送制限の共有counterをRDSの原子的更新で作るか、Solid Cache（RDS）+ Railsの`rate_limit`で作るか。
