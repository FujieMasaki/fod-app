# 開発タスク

MVPとその後の継続開発に必要な作業を管理する。現在登録しているTASK-001〜TASK-016は、実サービスのMVP完成に必要な未実装・未決定の作業である。仕様の正本は[product.md](../product.md)、[journaling.md](../journaling.md)、[dot-history.md](../dot-history.md)。本索引は仕様や各タスクの詳細・状態を複製しない。

## 参照した状態

2026-09-20時点のマージ済みmain `4f02e443a8a027e1bfe30020febe6255fb1b0bc7`を基準に整理した。ローカルHEAD、origin/main、リモートmainの一致を確認済み。Dot履歴のMVP範囲を定めたPR #25を含む。

現行実装の判断は、3仕様と[architecture.md](../architecture.md)の記述に基づく。コード全体の探索や実行による現状の再検証はしていない。既存の録音・停止・現在のDot表示・Zod検証、Rails / PostgreSQL / RSpec / CIの基盤は、再実装タスクにしていない。仕様が明示する実サービスとの差分と不整合を対象にした。

## 索引

### Frontend

- [TASK-007: 認証状態と利用開始・終了のFrontend接続](TASK-007-frontend-identity.md)
- [TASK-010: 録音前の説明と音声の受け渡し・中断UX](TASK-010-frontend-recording.md)
- [TASK-011: 実サービス生成・保存結果と再試行のFrontend接続](TASK-011-frontend-generation.md)
- [TASK-012: 今日のDay表示と丸いDot一覧・過去の詳細](TASK-012-frontend-day-history.md)
- [TASK-014: 削除要求のFrontend導線と個人データの端末管理](TASK-014-frontend-private-data.md)

### Backend

- [TASK-006: 利用者・認証・認可のBackend基盤](TASK-006-backend-identity.md)
- [TASK-008: 利用者別Dot保存と履歴取得API](TASK-008-backend-dot-history.md)
- [TASK-009: 音声内容からのDot生成と保存のBackend実装](TASK-009-backend-audio-generation.md)
- [TASK-013: 保持期限と本人の削除要求のBackend実装](TASK-013-backend-data-deletion.md)

### 共通

- [TASK-001: 認証と利用者識別の設計判断](TASK-001-identity-design.md)
- [TASK-002: 音声・個人データの保持と削除の設計判断](TASK-002-data-lifecycle-design.md)
- [TASK-003: AI生成と失敗・再試行の設計判断](TASK-003-generation-design.md)
- [TASK-004: Dayと複数Dot履歴の設計判断](TASK-004-history-design.md)
- [TASK-005: 実サービスのAPI契約と契約管理の確立](TASK-005-product-api-contract.md)
- [TASK-015: 本人限定アクセスとデータ保持・削除の横断検証](TASK-015-privacy-security-verification.md)
- [TASK-016: 録音から過去のDotまでのMVP受け入れ検証](TASK-016-mvp-acceptance.md)

## 運用ルール

- 各タスクファイルを詳細・状態・優先度・依存関係の正本にする。READMEに進捗表や完了条件の複製を置かない。
- IDは`TASK-`と通し番号で構成し、MVP後も同じ体系で追加する。IDは固定し、後から振り直さない。状態・名称が変わってもファイルを移動・改名せず、パスを固定する。追加時は未使用の次のIDを使い、既存IDを再利用しない。
- 状態はTodo / In progress / Done / Blocked。初期状態では着手可能な設計判断をTodoとし、未確定の判断・契約に依存する後続タスクはBlockedとする。
- Blockedを解除するときは、上流の判断・契約の確定と各依存先の提供状況を確認する。設計判断同士は選択肢を並行整理できるが、相互の整合を確認してから完了する。
- P0は実装着手前に必要な判断・基盤、P1はMVP完成に必要な作業。P1もMVP必須であり、任意の改善を意味しない。
- Doneは、そのタスクの全完了条件と必要な検証を確認し、証跡を関連Planへ記録した状態。文書を作っただけで実装・検証タスクをDoneにしない。未検証や未解消の問題は残す。
- 担当者と期限は設けない。各タスクの「関連Implementation Plan」は着手時に追記する。新機能・複数ファイル変更・設計判断などでは[AGENTS.md](../../AGENTS.md)と[Plan template](../implementation-plans/TEMPLATE.md)に従ってPlanを作成・更新する。複数タスクで1つのPlanを参照してもよい。
- 決定・実装で仕様や現状が変わる場合、関連する正本文書を同じ変更で更新する。タスク本文だけで新しい仕様を確定しない。過去のPlanのCurrent Stateは書き換えない。
- 各領域の実装規約・UI変更時のdesign-system・レビュー入口とsecurity指針は、着手する作業に応じてAGENTS.mdから読む。
- 追加の不明点は推測で実装せず、関連する設計判断タスクと仕様の未決定事項へ記録する。完了済み作業を重複登録せず、新たな独立範囲が必要になった場合だけ新IDを追加する。
- Claude Codeの`/run-task`で自動実行できるのは、作業区分が設計判断・API契約以外で、状態がTodo / In progress、またはBlockedで依存先がすべてDoneのタスクに限る。判定は`node scripts/task-status.mjs TASK-XXX`で行う。設計判断・API契約は人間と対話で進める。自動実行でも上記の状態・Doneの規則は変わらず、人間の確認が必要な完了条件が残る場合はIn progressのままPRを作る。

2026-09-21の命名移行で、既存16件の接頭辞を`MVP-`から`TASK-`へ変更した。番号とタスク内容は維持している。この一度の移行後は、上記の固定ID・固定パス運用を適用する。

## 依存関係を踏まえた実施順

現在の16件は、依存条件を満たしながら番号順に進められる。TASK-001は認証の設計判断から始め、TASK-002とTASK-003は両方を検討して保持・生成条件の整合を確認する。新しいタスクを追加した後も、番号だけで判断せず各ファイルの依存先を確認する。

以下は並行して進める場合も含めた着手の目安であり、正確な依存先は各タスクファイルを参照する。

1. TASK-001〜TASK-004で認証・データ・生成・履歴の判断を整理する。特にTASK-002とTASK-003は音声と外部AIの保持条件を突き合わせて確定する。
2. 判断結果をTASK-005の正式なAPI契約にまとめ、TASK-006の認証基盤を整える。
3. TASK-007のWeb認証とTASK-008の永続保存・履歴を進める。
4. 認証接続後にTASK-010の録音、保存基盤の後にTASK-009の生成、履歴APIの後にTASK-012のDay・一覧へ進む。各依存先が揃った範囲で並行できる。
5. 入力と生成APIが揃ったらTASK-011、保存・生成データの扱いが揃ったらTASK-013へ進む。これらと履歴UIをTASK-014で削除・端末管理につなぐ。
6. TASK-015で境界をまたぐセキュリティと保持・削除を確認し、TASK-016で一連のMVP体験を受け入れ検証する。

## 要判断事項

詳細と完了条件は該当タスクを正本とする。

- TASK-001: 認証方式、利用者識別、配信構成に応じた資格情報と認可の境界。
- TASK-002: 音声を送るかと経路、各データの正本・保持・削除、利用者の削除要求、旧ローカルデータの扱い。
- TASK-003: AI provider / prompt、文字起こし、同期/非同期、必要な場合のJob基盤、失敗・中断・再試行と冪等性。
- TASK-004: 同日複数録音、Dayの対象、日付境界、並び順、記録のない日、丸い一覧の配置と多数件でも到達できる方法。
- TASK-005: 上記を共有するAPI契約とtooling、schema・型・生成物・互換性の管理。

journalingは「本人だけが取得・更新・削除できる」と定める一方、編集・削除の具体的な操作範囲は未決定である。更新可能な項目・操作の要否と削除要求の受け付け方をTASK-002 / TASK-005で明確にする。編集画面やアカウント削除画面をこの一覧で採用決定しない。TASK-010では対応ブラウザと録音中断UXを関連Planで具体化する。

コードの現状を独自に再監査していないため、着手時に対象実装と仕様の一致を確認する。差異があれば根拠を記録し、重複タスクや古い完了条件をそのまま実行しない。provider、配信方式、保持条件等の技術的な成立性は、今回の文書整理だけでは検証済みと扱わない。

## MVP対象外・後続候補

以下はタスクファイルを作成しない。採用時は先に正本仕様の範囲を更新する。

- Week / Month表示、Dayからのズームアニメーションと操作、週の開始曜日、動きを減らす配慮を含む時間軸表現: Concept → Prototype → User Test → 採用判断の検証候補。
- 週次・月次AI振り返り、Dot同士のつながりや長期的な傾向: 後続候補。MVPの生成は個々のDotを扱う。
- 検索、カテゴリ、期間フィルタ、Homeの最近のDot、共有・通知: 現在のMVP完成条件に含めない。
- 音声Blob・文字起こしのbrowser永続化: 現行のMVP対象外。実サービスの一時的な受け渡しやserver側の保持判断とは区別する。
- より具体的な対象者、医療・支援用途との関係: productの未決定事項であり、今回のMVP完成条件には加えない。

## この一覧の作成記録

[タスク整理Implementation Plan](../implementation-plans/2026-09-20-mvp-task-inventory.md)を参照。これは一覧作成の記録であり、各タスクの設計・実装Planを代替しない。
