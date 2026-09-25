---
name: run-task
description: docs/tasks のタスク（TASK-XXX）を、着手可否の確認からPlan作成・実装・検証・self-review・push・PR作成まで止まらずに進める。「TASK-008を進めて」「TASK-008を実装して」「TASK-008に着手して」「TASK-008をやって」のように、タスクIDを挙げて作業を依頼されたときに使う。
argument-hint: "TASK-XXX"
---

# /run-task $ARGUMENTS

対象タスク `$ARGUMENTS` を、PRを作成してURLを出力するまで進める。途中で完了報告や確認のために
止まらない。止まってよいのは「止まる条件」に当たったときだけ。

`claude/task-*` ブランチでは、Stop hook（`scripts/claude-quality-gate.mjs`）が終了のたびに
CI相当の検査・コミット・push・PRの有無を確かめ、満たすまで作業に差し戻す。差し戻されたら、
示された理由を解消して続ける。

## 絶対に守ること

- testを削除・skip・弱めて通さない。期待値を実装に合わせて書き換える場合は、仕様上の根拠を
  Planに書く。
- `--no-verify`、force push、mainへのpush、PRのマージをしない（hookでも拒否される）。
- コミットにCo-Authored-Byなどの帰属トレーラーを付けない。
- 仕様・設計判断を推測で決めない。当てはまる場合は「止まる条件」に従う。
- 秘密情報（`.env*`、`master.key`等）を読まない・書かない・出力しない。

## 手順

### 1. 着手可否を判定する

```bash
node scripts/task-status.mjs $ARGUMENTS
```

- `runnable: false` なら、`reasons` を日本語で示して止まる。作業区分が設計判断・API契約なら、
  対話で一緒に進めることを提案する。ここではworktreeを作らない。
- `unblocking: true`（Blockedで依存がすべてDone）なら、依存先の判断・契約がこのタスクの前提を
  満たすか確認してから進む。満たさなければ止まる条件として扱う。

### 2. 作業場所を用意する

ブランチ名は `claude/task-<3桁の番号>-<英小文字の短いslug>`（例: `claude/task-008-dot-history`）。
この名前でないとhookが働かない。

```bash
git fetch origin main
git worktree list
```

- 同じタスクのworktreeが既にある（再開）: `EnterWorktree` に `path` を渡して入る。
- ない: `git worktree add .claude/worktrees/task-008 -b claude/task-008-<slug> origin/main` で作り、
  `EnterWorktree` に `path` を渡して入る。
- 既にこのセッションが別のworktreeにいて作業ツリーがcleanなら、そこで
  `git switch -c claude/task-008-<slug> origin/main` としてよい。

worktreeの中で依存を入れ、前回の状態を消す。

```bash
pnpm install --frozen-lockfile
(cd apps/api && bundle install)   # apps/api を変更する見込みがあるときだけ
scripts/claude-hook.sh claude-quality-gate.mjs --reset
```

### 3. 読んでからPlanを作る

1. タスクファイル、「根拠となる仕様書と見出し」、依存タスクのPlanを読む。
2. [AGENTS.md](../../../AGENTS.md) の「作業前に読む文書」の表に従い、領域ごとの必読文書を読む。
   Railsなら `rails-conventions.md` も読む。
3. 対象の実装と仕様が一致しているか確かめる。差異があれば根拠とともにPlanへ記録する。
4. [TEMPLATE](../../../docs/implementation-plans/TEMPLATE.md) から
   `docs/implementation-plans/<今日の日付>-task-008-<slug>.md` を作る。
5. タスクファイルの `状態` を In progress にし、`関連Implementation Plan` にリンクする。
6. Planとタスク更新を `docs(task-008): ...` としてコミットする。

AGENTS.mdの「重大な設計判断または複数の有力案がある場合」に当たるなら、止まる条件として扱う。

### 4. 実装する

- 1コミット = 1関心事。レビューで上から追える順（ロジック → UI、test は対象と同じコミット）。
- メッセージは `type(scope): 要約` と、「何を・なぜ」の箇条書き。既存コミットの体裁に合わせる。
- 仕様・architectureが変わるなら、関連する現行文書を同じ変更で更新する。
- 編集後にlint結果が返ってきたら、その場で直す。

### 5. 完了条件を検証して記録する

- `node scripts/task-status.mjs $ARGUMENTS` の `acceptanceCriteria` を1件ずつ確かめ、タスクの
  「必要な検証」も実施する。
- Planの `Completion Record` に、実行したcommand、結果、未実施の確認と理由を書く。
- 自分で検証できた完了条件だけ `[x]` にする。人間の確認が必要な条件は `[ ]` のまま残し、PRの
  「確認すること」に入れる。
- 全条件を検証できた場合だけタスクを Done にする。そうでなければ In progress のまま。

### 6. self-reviewする

`self-review` skillでdiff全体を確認し、該当するレビュー入口（`docs/code-review/`）とsecurity観点で
見直す。指摘は修正してコミットする。確信の持てない指摘はPRの「確認すること」に入れる。

### 7. pushしてPRを作る

```bash
git push -u origin HEAD
gh pr create --base main --title "<日本語のタイトル>" --body "<本文>"
```

- 本文は [.github/pull_request_template.md](../../../.github/pull_request_template.md) の見出し順に
  日本語で書く。テンプレートのコメント・プレースホルダーを残さない。
- 「確認すること」は、人間が確認する操作・画面・仕様上の判断と期待結果のTODOリストにする。
- 品質ゲートの上限に達した場合は、失敗している検査と試したことを「確認すること」の先頭に書く。
- 最後にPRのURLと、Doneにしたか・残した確認事項を短く報告する。

## 止まる条件

次のどれかに当たったら、推測で進めない。

- 仕様・設計判断に不明点がある、または複数の有力案がある。
- 完了条件が現在の仕様・実装と矛盾する。
- 秘密情報、外部サービスの設定、課金、本番環境の操作が必要。
- 依存先の判断・契約がこのタスクの前提を満たさない。

止まるときは、次の順で行う。

1. Planの未決定事項に、判断が必要な点・選択肢・確認済みの事実を書き、コミットしてpushする。
2. `scripts/claude-hook.sh claude-quality-gate.mjs --pause "<判断が必要な点を1行で>"` を実行する。
3. チャットで、判断してほしい点と選択肢（推奨があれば推奨）を示して止まる。

人間が判断したら、`scripts/claude-hook.sh claude-quality-gate.mjs --reset` を実行して手順の続きから再開する。
