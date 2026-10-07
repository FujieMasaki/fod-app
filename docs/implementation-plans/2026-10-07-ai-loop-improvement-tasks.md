# AIとの開発ループを改善する開発基盤タスクの追加

## 1. Status

完了（2026-10-07）。

## 2. Goal

AIとの開発ループ（実装・レビュー・タスク化）で、まだ取り入れていない改善を`docs/tasks`のタスクとして登録し、`/run-task`と定期実行で1つずつ進められるようにする。

## 3. Background

- [mizchi「AIコーディングのループと形式手法」](https://zenn.dev/mizchi/articles/ai-coding-loop-formal)と現状の運用（`pr-review-cycle`、`run-task`、`human-review-artifact`、`.claude/settings.json`、lint・CI）を比べた。
- 人間の役割の絞り込み、ループの構築、判断基準の言語化はすでにできている。一方、次の6点は取り入れていない。
  - ループの完了条件が数値でなく、AIのLGTMだけである
  - 画面の変化を機械で検出していない
  - 失敗の原因を分類して直す場所を決めていない
  - 図がArtifactにだけあり、PRの履歴に残らない
  - まだ誰も気づいていない問題を探す段がない
  - 状態遷移の組み合わせの漏れをtest以外で確かめていない
- 人間がこの6点をタスク化し、定期実行で進めることを決めた。

## 4. Current State

- `docs/tasks`はTASK-001〜TASK-018で、優先度はMVPを基準にしたP0〜P2だけである。
- `scripts/task-scheduler.mjs`は毎朝4時に、設計判断・API契約以外で着手できるタスクを並列で`/run-task`する。

## 5. Scope and Non-goals

- 対象: TASK-019〜TASK-024のタスクファイル、`docs/tasks/README.md`の索引と優先度の扱い。
- 対象外: 各タスクの実装、ツール・閾値の決定（各タスクの着手時にPlanで決める）。
- 決定: 開発基盤のタスクはMVP完成条件に含めず、優先度はP0〜P2と別の「開発基盤」とする。TASK-020・TASK-022・TASK-023は定期実行で並行して進めてよい。TASK-019・TASK-021は自動のループが自分を測る検査・許可・reviewerを変えるため、設計判断として定期実行から外し、人間と対話で進める（2026-10-07、人間が判断）。TASK-020のPlaywrightはVRTのためだけに入れ、E2E基盤の保留とは分ける（同日、人間が判断）。

## 6. References and Documents to Update

- 参照: [タスクの運用ルール](../tasks/README.md#運用ルール)、[pr-review-cycle](../../.claude/skills/pr-review-cycle/SKILL.md)、`scripts/task-status.mjs`
- 更新: [docs/tasks/README.md](../tasks/README.md)

## 7. Proposed Approach

1. 6点を1候補1タスクにし、既存のタスクファイルの形式（表・完了条件・依存・根拠・検証・関連Plan）で書く。
2. 作業区分は、ツール・閾値を着手時のPlanで整理できるものを実装・テスト・検証とする。自動のループが自分を測る仕組みを変えるTASK-019・TASK-021と、採否を人間が判断する形式手法の試行（TASK-024）は設計判断にする。複数の有力案がある選択は、Planで選択肢と推奨を整理して人間の判断に回すと各タスクに書く。
3. 自動のループが自分の検査や許可を緩められないよう、閾値の引き下げ・除外の追加（TASK-019）と許可を広げる対処（TASK-021）は人間の判断とする。公開リポジトリなので、監査で見つけたsecurityの指摘は修正まで具体的に公開しない（TASK-023）。これらは文書の約束であり、仕組みでは強制していない。worktreeの中で変えた検査・許可・reviewerの定義は同じセッションのその後の検査にすぐ効くため、それらを主に変えるTASK-019・TASK-021は定期実行から外す。ほかのタスクでも、それらを変えたPRでは変えたファイルを「確認すること」に挙げ、マージ前の人間のレビューで止められるようにする（手順はTASK-021で入れる）。リポジトリの外のファイル（`personal-conventions.md`）は、AIは提案だけにする。
4. 形式手法の試行は生成の失敗・再試行の扱いを決めるTASK-003に依存させ、Blockedにする。
5. READMEに「開発基盤」の区分と優先度の扱い、追加の経緯を書く。

## 8. Why This Approach

- 既存のタスクの形式に合わせると、`task-status.mjs`・`task-scheduler`・`run-task`をそのまま使える。
- 優先度を新しく分けるのは、P0〜P2の定義がMVPを基準にしており、開発基盤の作業をP2に入れると「MVP完成後に着手する」と読めてしまうため。

## 9. Data Flow

データフローの変更はない。

## 10. Files to Change

1つのPR。

- 新規: `docs/tasks/TASK-019`〜`TASK-024`の6ファイル
- 新規: このPlan
- 変更: `docs/tasks/README.md`

## 11. Libraries / APIs

なし。各タスクの候補のツールは、着手時に決める。

## 12. Alternatives Considered

- 優先度をP2にする案: P2は「MVP完成後に着手する」と定義されており、今すぐ進めたい開発基盤の作業と合わないため採用しない。
- ツール・閾値の選択を設計判断の別タスクに切り出す案: タスク数が倍になり、選択肢は実装を試さないと比べにくい。Planの段階で人間の判断に回す形にした。

## 13. Risks / Things to Watch

- 定期実行で複数のタスクが並行すると、同じskill・規約・設定ファイルでコンフリクトが起きる。重なるファイルと、解消は人間が再開したセッションで行いレビューをやり直すことをREADMEに書いた。

## 14. Verification

### Automated

- `pnpm lint:markdown`
- `node scripts/task-status.mjs TASK-019`〜`TASK-024`で、TASK-020・TASK-022・TASK-023が実行可能、TASK-019・TASK-021が設計判断で実行不可、TASK-024が設計判断かつTASK-003待ちで実行不可と判定されること。

## 15. Definition of Done

- 6つのタスクが既存の形式で登録され、READMEの索引から辿れる。
- `task-status.mjs`が意図どおりに判定する。

## 16. Completion Record

- 状態: 2026-10-07 完了。
- 実装差異: レビューを受けて、TASK-019・TASK-021を設計判断にして定期実行から外し、TASK-020のPlaywrightをE2E基盤の判断と分け、検査・許可・reviewerの定義を変えたPRを人間のレビューで止める手当、リポジトリの外のファイルを変えない制限、自動のループが自分の検査・許可を緩められない制限、securityの指摘を公開しない制限、複数の有力案を人間に回す扱い、並行時に重なるファイルをタスクとREADMEに足した。
- 検証結果: `pnpm lint:markdown`が通った。`task-status.mjs`でTASK-020・TASK-022・TASK-023が`runnable: true`、TASK-019・TASK-021が`runnable: false`（設計判断）、TASK-024が`runnable: false`（設計判断、TASK-003がIn progress）と判定された。
- 関連: [docs/tasks/README.md](../tasks/README.md)
