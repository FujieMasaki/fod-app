# TASK-019: 機械のレビューループに数値の完了条件を加える

| 項目 | 内容 |
| --- | --- |
| ID | TASK-019 |
| タスク名 | 機械のレビューループに数値の完了条件を加える |
| 対象領域 | 開発基盤 |
| 作業区分 | 設計判断 |
| 優先度 | 開発基盤 |
| 状態 | Todo |

## 目的と作業範囲

`pr-review-cycle`の終了条件は、サブエージェントとCodexの「LGTM」というAIの主観的な判定だけである。testが変更を本当に検証しているか、変更が読みにくくなっていないかを数値で確かめる段を加え、ループが早く収束し、人間を呼ぶ回数を減らす。

対象は次の3つの指標とする。

- Mutation Test のkill率（Frontendは候補としてStryker。Backendは対象にするか着手時に判断する）
- 変更したファイルのカバレッジ
- 循環的複雑度の上限（Frontendは未設定なのでESLintの`complexity`を入れるか決める。Backendは`apps/api/.rubocop.yml`で無効にしていないため、RuboCopの`Metrics/CyclomaticComplexity`が既定の上限で有効であり、閾値を見直すかを決める）

すべてのファイルに一律の閾値を課さず、変更した範囲に効かせる。実行時間が長い指標（Mutation Test）は、pre-push・CI・`pr-review-cycle`のどこで実行するかを実行時間を測ってから決める。既存のCI（`scripts/ci-gate.mjs`）とpre-pushの構成を壊さない。

ツール・閾値・対象範囲などで複数の有力案がある選択は、AIがPlanで選択肢と推奨を整理したうえで人間の判断に回す（`run-task`の止まる条件「複数の有力案がある」に当たる）。

ゲートは測られる側のAIが同じリポジトリで動かせる。AIは導入後に閾値を下げず、除外も足さない。必要になったら、止まる条件として人間に判断を求める。

このタスクはlint・test・CI・skillといった検査そのものを変える。変えたファイルを人間のレビューで止める規則と、対象のファイルの定義は[TASK-021](TASK-021-failure-classification.md)を正本とし、このタスクのPRもそれに従う。

## 確認可能な完了条件

- [ ] 3つの指標それぞれについて、採用するツール、対象範囲（変更したファイルか全体か、Frontend / Backend）、閾値、実行する場所（pre-push / CI / `pr-review-cycle`）を決め、Planに理由とともに記録している。
- [ ] 採用した指標が、ローカルとCIで同じコマンドで実行でき、閾値を満たさないと失敗する。
- [ ] `pr-review-cycle`のSKILL.mdに、数値の完了条件を満たすまでLGTMにしない手順が書かれている。
- [ ] 実行時間を計測し、pre-push・CIの所要時間の増分をPlanに記録している。
- [ ] AIが閾値を下げず除外も足さないこと（必要なら止まって人間に判断を求めること）を、`pr-review-cycle`と`run-task`の「絶対に守ること」に書いている。
- [ ] 検査・許可・reviewerの定義を変えたPRで、変えたファイルを「確認すること」に挙げる手順（TASK-021の成果物）に、このタスクのPRが従っている。TASK-021より先に着手した場合は、その手順をこのタスクで`pr-review-cycle`に入れ、TASK-021で確かめる。
- [ ] [frontend.md](../development/frontend.md)の「4. テスト」と[backend.md](../development/backend.md)の「3. API契約とテスト」へ、指標と閾値の扱いを反映している。

## 依存するタスクID

なし。

## 根拠となる仕様書と見出し

- [pr-review-cycle](../../.claude/skills/pr-review-cycle/SKILL.md) — 「手順」
- [frontend.md](../development/frontend.md) — 「4. テスト」
- [backend.md](../development/backend.md) — 「3. API契約とテスト」
- 参考: [mizchi「AIコーディングのループと形式手法」](https://zenn.dev/mizchi/articles/ai-coding-loop-formal) — 「/goal と一緒に使う評価指標」

## 必要な検証

- testを意図的に弱めた変更（assertionの削除など）で、Mutation Testのkill率が下がりゲートが失敗すること。
- 複雑度の上限を超える関数を加えた変更で、lintが失敗すること。
- 選んだ適用範囲で、既存のmainが閾値を満たすこと（満たさない箇所は、除外ではなく段階的に導入する方法をPlanで決める）。

## 関連Implementation Plan

未作成。着手時にAGENTS.mdの規約に従って作成し、ここへリンクを追記する。
