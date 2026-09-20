# MVP未実装・未決定タスク整理 Implementation Plan

## 1. Status

完了（2026-09-20）。タスク一覧の作成を完了したものであり、各MVPタスクの完了を意味しない。

## 2. Goal

マージ済みの仕様を根拠に、実サービスのMVP完成に必要な判断と残作業を、固定ID・固定パスのタスクとして追跡できるようにする。

## 3. Background

録音から現在のDotを表示する体験はあるが、実サービスの認証、音声に基づく生成、利用者ごとの保存、複数Dotの履歴は未実装である。実装済み・未決定・MVP対象外を混ぜず、実装前の判断と領域別の依存関係を整理する必要がある。

## 4. Current State

- 作業開始時のブランチは`main`。HEADと`origin/main`は`4f02e443a8a027e1bfe30020febe6255fb1b0bc7`。
- `git ls-remote origin refs/heads/main`でも同じコミットを確認した。Dot履歴のMVP範囲を定めたPR #25がマージ済み。
- 作業ツリーに追跡済みファイルの変更はなく、未追跡の`.worktrees/`がある。内容に触れず保護する。
- 現状の根拠は3つの仕様とarchitectureの実装済み記述。コード全体の探索・実行による再検証は行わない。
- `docs/tasks/`は未作成。

## 5. Scope and Non-goals

- 対象: MVPの未実装・未決定タスク、索引、運用、依存順、要判断事項と後続候補の整理。
- 対象外: 機能実装、仕様の決定・変更、外部調査、既存ファイルの整理、コミット・push・PR。
- 未決定事項は設計判断として残す。編集UIなど仕様上の採用範囲が曖昧なものを新機能として確定しない。

## 6. References and Documents to Update

- 作業規約: `AGENTS.md`、`/Users/fujiemasaki/.codex/personal-conventions.md`。
- 仕様: [`product.md`](../product.md)、[`journaling.md`](../journaling.md)、[`dot-history.md`](../dot-history.md)。
- 判断補助: [`architecture.md`](../architecture.md)、[`Dot履歴のMVP範囲整理Plan`](2026-09-20-dot-history-scope.md)、[`文書運用Plan`](2026-09-19-documentation-governance.md)、[`TEMPLATE.md`](TEMPLATE.md)。
- 新規: `docs/tasks/README.md`、各タスク、本Plan。仕様内容は変えないため既存の正本文書は更新しない。

## 7. Proposed Approach

1. 最新mainと作業ツリーを確認し、3仕様の実装済み・受け入れ条件・未決定・対象外を照合する。
2. 認証、データの保持・削除、生成、履歴の判断を分け、正式API契約につなぐ。
3. Backendの認証基盤、保存・履歴、音声・生成、削除と、Frontendの認証、録音、生成結果、Day・一覧、削除・端末保持を分ける。
4. 個別実装の検証は各タスクに含め、横断のセキュリティ検証と実サービスの受け入れ確認を別タスクにする。
5. READMEは領域別のリンク、運用、実施順、要判断事項、対象外だけを持ち、状態や完了条件を複製しない。
6. 項目・ID・リンク・依存関係を機械確認し、仕様との対応と差分を目視確認する。

## 8. Why This Approach

未決定事項を暗黙に確定せず、着手可能な判断と判断待ちの実装を区別できる。領域別タスクは独立した完了条件を持ち、API契約と依存関係で結ぶことで実装の重複や漏れを抑える。

## 9. Data Flow

文書のみの変更であり、アプリケーションのデータフローや正本は変わらない。仕様からタスクへ根拠をリンクし、後続のImplementation Planで判断と検証記録を管理する。

## 10. Files to Change

- 新規 `docs/tasks/README.md`: 索引と運用。
- 新規 `docs/tasks/MVP-*.md`: 1タスク1ファイルの詳細・状態。
- 新規 本Plan: 作業方針と検証記録。

## 11. Libraries / APIs

追加しない。リモートmainの確認には読み取り専用の`git ls-remote`を使う。

## 12. Alternatives Considered

FrontendとBackendを機能ごとに1タスクへまとめる案は、完了範囲と依存先が曖昧になるため採用しない。細かなコード単位の分割は、未決定の実装構造を先に固定するため採用しない。

## 13. Risks / Things to Watch

- 仕様に書かれた現状と最新コードが一致するかは今回の調査対象外。後続タスク着手時に対象実装を確認する。
- 「1日=1 Dot」のモチーフから保存件数を決めない。
- 本人のみの更新・削除という条件から、編集UIやアカウント削除画面を無条件に追加しない。
- Rails基盤、既存の録音・表示・Zod検証を作り直すタスクにしない。
- 未追跡の`.worktrees/`を変更・削除・追加対象にしない。

## 14. Verification

### Manual

- 3仕様のMVP受け入れ条件と現行不整合がタスクで覆われるか確認する。
- Frontend / Backendの分離、判断待ちの状態、重複、候補機能の混入を確認する。
- 新規ファイルを含む差分を読み、既存ファイルに不要な変更がないことを確認する。

### Automated

- 必須項目、IDの一意性、参照するタスクID、依存関係の循環、領域・優先度・状態の値を確認する。
- Markdown相対リンクと仕様の参照見出し、README索引の網羅性を確認する。
- 新規ファイルも含めた空白エラーを確認する。
- 文書のみのためアプリケーションtest / buildは実行しない。

## 15. Definition of Done

すべてのタスクに根拠・独立した完了条件・必要な検証・依存関係・Plan欄があり、状態の正本と固定ID・パスの運用が明確である。仕様や機能を追加せず、既存の作業ツリーを保護できている。

## 16. Completion Record

- 状態: 完了（2026-09-20）。
- 作成物: タスク16件、タスクREADME、本Planの計18ファイル。Frontend 5件、Backend 4件、共通7件。P0 6件、P1 10件。設計判断4件はTodo、後続12件はBlocked。
- 実装差異: なし。現行仕様、機能コード、依存関係、設定は変更していない。コミット・push・PRも行っていない。
- 機械検証: Pythonによる必須項目・許可値・IDの一意性・参照先ID・仕様見出し・相対リンク・README索引の網羅性・依存関係の循環検査を通過。`git diff --check`に加え、未追跡の新規18ファイルを個別に`git diff --no-index --check -- /dev/null <file>`で検査した。
- 差分確認: 新規タスクの目的・完了条件・依存関係とREADME / Planの差分を確認。判断、Backend、Frontend、横断検証の責務を区別し、実装済みの重複やMVP対象外の機能タスクがないことを確認した。音声保存済み表示の不整合はMVP-011に含めた。
- 作業ツリー: 既存追跡ファイルとindexに変更なし。作業開始時からの未追跡`.worktrees/`には触れていない。
- 未実施: アプリケーションtest / build、コード全体の再監査、外部調査。文書整理のみのため実施していない。後続の判断・実装タスクに必要な検証は各ファイルへ記載した。
- 残る不確実性: 現行実装の把握はマージ済み仕様の記述に依存する。認証・生成・保持・履歴・契約の方式や、更新/削除の具体的操作範囲の成立性は今回確定・実証していない。
- 関連: [MVPタスク索引](../tasks/README.md)。

### 仕様との対応確認

これは一覧作成時の検証記録であり、進捗の正本ではない。

| 仕様上の条件 | 対応タスク |
| --- | --- |
| product §2: 録音から生成・保存・振り返りと失敗・中断・再試行 | MVP-003、MVP-008〜MVP-012、MVP-016 |
| product §2 / journaling §4: 保存先・送信先・保持・削除 | MVP-002、MVP-009、MVP-010、MVP-013〜MVP-015 |
| product §2 / journaling §4: 本人限定の取得・更新・削除、response / ログ | MVP-001、MVP-002、MVP-005〜MVP-009、MVP-013〜MVP-015 |
| product §2 / journaling §3: mockと実サービス、音声保存済み表示の不整合 | MVP-011、MVP-014、MVP-016 |
| journaling §4: 録音前の説明・権限拒否・状態の理解 | MVP-002、MVP-010、MVP-011、MVP-016 |
| journaling §4: API契約の一致とschema検証 | MVP-005、MVP-006、MVP-008、MVP-009、MVP-011、MVP-016 |
| journaling §4: 再送・retry・Job再実行 | MVP-003、MVP-005、MVP-009、MVP-011、MVP-016 |
| product §2 / dot-history §2: 今日のDayと一覧への導線 | MVP-004、MVP-008、MVP-012、MVP-016 |
| dot-history §1–2: 丸いDot・識別・過去の任意のDotへの到達 | MVP-004、MVP-005、MVP-008、MVP-012、MVP-016 |
| dot-history §2: 履歴なし・読み込み失敗・選択Dotの未取得 | MVP-008、MVP-012、MVP-016 |
| 各仕様の未決定事項のうちMVPに必要な判断 | MVP-001〜MVP-005。対応ブラウザ等の具体化はMVP-010のPlan |
| 各仕様の検証候補・将来候補・MVP対象外 | READMEにのみ後続候補として記録し、機能タスク化していない |
