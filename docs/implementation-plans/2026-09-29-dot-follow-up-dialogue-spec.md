# Implementation Plan: Dot生成後の深掘り対話仕様の追加

## 1. Status

完了（本Planの範囲は仕様文書とタスク整理のみで、コード変更は含まない）。

## 2. Goal

Dotの生成・保存という基本体験を維持したまま、利用者が任意で「このDotを深掘りする」操作からAIと対話し、
考えや感情をもう少し言葉にできる体験を仕様として採用する。対話そのものはDotを自動更新せず、AIが提示する
変更案を利用者が確認・承認した場合だけDotへ反映する。今回はこの体験方針・データ区分・未決定事項を
文書化し、既存タスクとの関係を整理する。コード実装は行わない。

## 3. Background

- 現状のjournaling.mdは録音→生成→保存→表示の単発flowのみを扱い、Dotの更新や複数版の管理は仕様上存在しない。
- 利用者から、Dot生成後に必要な場合だけAIと対話してさらに考えを整理し、承認した内容だけをDotへ反映したい
  という要望があった。
- 既存のTASK-002（保持・削除）/TASK-003（AI生成）/TASK-004（履歴表示）等は、録音からの最初のDot生成に
  関する設計判断に限定されており、対話機能のデータ区分・保持・反映方法は範囲に含まれていない。

## 4. Current State

- journaling.md §1のflowは「録音 → 最初のDot生成 → 保存 → 表示」で終わる。
- journaling.md §2の「DotSession」は新しい成功responseで上書きされるだけで、版・履歴の概念がない。
- dot-history.mdは複数Dotを一覧で見渡す体験のみを扱い、個々のDotが後から更新される前提を持たない。
- docs/tasks/には深掘り対話に関するタスクが存在しない。

## 5. Scope and Non-goals

### 今回の対象

- `docs/dot-follow-up.md`を新設し、採用した体験（flow、対話の位置づけ、Dotへの反映、データ区分、スコープ、
  未決定事項）を記載する。
- `docs/journaling.md`に、基本flowとの境界を示す参照セクションを追加する。
- `docs/product.md`の「現在の区分」表・MVP対象外・保留事項に、次段階としての位置づけを追記する。MVP完成
  条件（§2）の内容自体は変更しない。
- `docs/privacy.md`に、対話由来データ（対話履歴・追加音声・AI入出力・更新履歴）の未決定事項と確認表の行を
  追加する。
- `docs/dot-history.md`に、更新後のDot表示と対話・更新履歴との関係を追記する。
- `docs/tasks/`にTASK-018（深掘り対話の設計判断）を新設し、READMEおよびTASK-002/003/004/008へ
  範囲を明確化する短い注記を加える。

### 今回の対象外

- AI provider、音声の保存先、文字起こし方式、S3の利用、同期/非同期処理の確定（TASK-002/003の範囲のまま）。
- チャット形式のUI・画面設計、内部の音声・文字起こし・AI処理のデータフロー実装。
- コード変更全般。

### 未決定で、今回確定しない事項

- 深掘り対話の会話回数上限、終了方法、途中離脱・再開、失敗時の扱い。
- 対話履歴・提案・更新履歴を保存するか、保存する場合の範囲・保持期間・削除方法。
- 最初に生成されたDot・現在のDot・更新履歴の具体的なデータモデルと正本。
- Dotを削除した場合の関連する対話・更新履歴の扱い。

これらはTASK-018で、TASK-002/003/004の決定と整合させながら確定する。

## 6. References and Documents to Update

- 参照: [AGENTS.md](../../AGENTS.md)「文書の役割と更新」「Implementation Plan」、
  [product.md](../product.md)、[journaling.md](../journaling.md)、[privacy.md](../privacy.md)、
  [dot-history.md](../dot-history.md)、[docs/tasks/README.md](../tasks/README.md)。
- 更新: 上記5文書 + 新規`docs/dot-follow-up.md` + 新規`docs/tasks/TASK-018-dot-follow-up-dialogue-design.md`
  + `docs/tasks/TASK-002-data-lifecycle-design.md` / `TASK-003-generation-design.md` /
  `TASK-004-history-design.md` / `TASK-008-backend-dot-history.md`（範囲注記のみ）。

## 7. Proposed Approach

1. `docs/dot-follow-up.md`を新設し、採用した体験flow、対話の位置づけ、Dotへの反映方法、データ区分
   （最初のDot／対話／現在のDot／反映されなかった提案／更新履歴）、スコープ、未決定事項を記載する。
2. `docs/journaling.md`に参照セクションを追加し、基本flow（journaling.md）と深掘り対話
   （dot-follow-up.md）の境界を示す。
3. `docs/product.md`の「現在の区分」表に、次段階として採用した設計であることを示す行を追加し、
   「MVP対象外と実装前に決めること」「保留事項と再検討条件」を更新する。MVP完成条件（§2）は変更しない。
4. `docs/privacy.md`の確認表・未決定事項に、対話由来データの送信・保存・削除の論点を追加する。
5. `docs/dot-history.md`に、更新後のDot表示と対話・更新履歴の関係を追記する。
6. `docs/tasks/`にTASK-018を新設し、READMEの索引・実施順・要判断事項・MVP対象外セクションを更新する。
   TASK-002/003/004/008には、深掘り対話由来のデータ・更新が対象外であることを示す一文だけを追加する。

## 8. Why This Approach

- dot-history.mdがjournaling.mdから独立した前例と同じく、独自のデータ区分・受け入れ条件・未決定事項を
  持つ機能は専用の機能仕様として切り出す（AGENTS.mdの文書運用規約）。journaling.mdへ直接追記すると、
  録音→単発生成という既存flowと、対話という別種の振る舞いが同じ文書に混在し、将来の変更が両方に波及する。
- MVP完成条件（product.md §2）を変更せず「次段階」として切り出すことで、現行のTASK-001〜017の依存関係・
  優先度・状態を崩さない。深掘り対話の実装に必要な会話回数・保持方針等の判断はTASK-018に閉じる。
- 既存タスク（TASK-002/003/004/008）は最小限の範囲注記のみとし、完了条件そのものは変更しない。

## 9. Data Flow

今回はコード変更を伴わないため、実装上のデータフローは対象外。採用した体験flowは
[dot-follow-up.md](../dot-follow-up.md)の「採用した体験」を参照する。

## 10. Files to Change

- 新規: `docs/dot-follow-up.md` — 深掘り対話の体験方針・データ区分・未決定事項の正本。
- 新規: `docs/tasks/TASK-018-dot-follow-up-dialogue-design.md` — 深掘り対話の設計判断タスク。
- 変更: `docs/journaling.md` — 参照セクション追加。
- 変更: `docs/product.md` — 区分表・MVP対象外・保留事項の追記。
- 変更: `docs/privacy.md` — 確認表・未決定事項の追記。
- 変更: `docs/dot-history.md` — 更新後Dot表示との関係の追記。
- 変更: `docs/tasks/README.md` — 索引・実施順・要判断事項・MVP対象外候補の更新。
- 変更: `docs/tasks/TASK-002-data-lifecycle-design.md` / `TASK-003-generation-design.md` /
  `TASK-004-history-design.md` / `TASK-008-backend-dot-history.md` — 範囲注記1行追加。

## 11. Libraries / APIs

なし（文書のみの変更）。

## 12. Alternatives Considered

- journaling.mdへ深掘り対話を新セクションとして直接追記する案: ファイル数は増えないが、単発生成flowと
  対話という独立した振る舞いが1文書に混在し、将来的にjournaling.mdが肥大化する。AGENTS.mdの文書運用
  規約およびdot-history.mdの前例と整合しないため採用しない。

## 13. Risks / Things to Watch

- 仕様の記述が実装判断（データモデル、API、UI）を先取りしすぎないこと。
- 既存タスク（TASK-002/003/004/008）の完了条件・依存関係を変更しないこと。
- product.mdのMVP完成条件（§2）を誤って変更しないこと。

## 14. Verification

### Manual

- 新設・変更した各文書間の参照リンクが正しいことを確認する。
- product.mdのMVP完成条件（§2）が変更されていないことを確認する。
- 既存タスク（TASK-002/003/004/008）の完了条件チェックリストが変更されていないことを確認する。

### Automated

なし（docs-only）。

## 15. Definition of Done

- 対象文書・タスクファイルを更新し、矛盾やリンク切れがない。
- 深掘り対話をMVP完成条件に含めず、次段階の設計判断（TASK-018）として位置づけたことを文書上で確認できる。
- 人間が採用済み事項・未決定事項・既存仕様への影響を説明できる。

## 16. Completion Record

- 状態: 2026-09-29 完了。
- 実装差異: なし。
- 検証結果: 各文書のdiffレビューを実施（人間による確認は本PR/変更のレビューで行う）。自動テストなし
  （docs-only）。
- 関連: 本Plan。後続の設計判断は[TASK-018](../tasks/TASK-018-dot-follow-up-dialogue-design.md)。
