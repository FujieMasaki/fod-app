---
name: run-task
description: docs/tasks のタスク（TASK-XXX）を、着手可否の確認からPlan作成・実装・検証・レビューしやすい大きさへのPR分割・push・PR作成・機械のレビューまで止まらずに進め、最後にタスク全体の人間のレビュー用ガイドを渡す。「TASK-008を進めて」「TASK-008を実装して」「TASK-008に着手して」「TASK-008をやって」のように、タスクIDを挙げて作業を依頼されたときに使う。
argument-hint: "TASK-XXX"
---

# /run-task $ARGUMENTS

対象タスク `$ARGUMENTS` を、PRを作成し、すべてのPRが機械のレビューでLGTMになり、人間のレビュー用
ガイドを渡すまで進める。途中で完了報告や確認のために止まらない。止まってよいのは「止まる条件」に
当たったときだけ。

PRは[PRの分割と人間のレビュー](../../../docs/development/pull-requests.md)に従い、レビュー対象の
ファイルが1つあたり20個までになるように分ける。

`<type>/task-*` ブランチでは、Stop hook（`scripts/claude-quality-gate.mjs`）が終了のたびに
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

ブランチ名は `<type>/task-<3桁の番号>-<英小文字の短いslug>`（例: `feat/task-008-dot-history`）。
PRを分ける場合は `<type>/task-<3桁の番号>-<順番>-<slug>`（例: `feat/task-008-1-dot-model`）。
この形でないとhookが働かない。

`<type>` はそのタスクの主な変更の種別を1つ選ぶ。使えるのは次の6つだけ。

| type | 選ぶ場面 |
| --- | --- |
| `feat` | 機能を追加する |
| `fix` | 不具合を直す |
| `refactor` | 振る舞いを変えずに構造を整える |
| `chore` | 設定・依存・ツールを更新する |
| `docs` | 文書だけを変更する |
| `test` | testだけを追加・整備する |

迷ったらタスクの完了条件で最も大きい変更に合わせる（例: 機能追加に伴うtestは `feat`）。
PRのタイトル・先頭のコミットのtypeと揃える。PRを分ける場合は、PRごとに選んでよい。

```bash
git fetch origin main
git worktree list
```

- 同じタスクのworktreeが既にある（再開）: `EnterWorktree` に `path` を渡して入る。
- ない: `git worktree add .claude/worktrees/task-008 -b <type>/task-008-<slug> origin/main` で作り、
  `EnterWorktree` に `path` を渡して入る。
- 既にこのセッションが別のworktreeにいて作業ツリーがcleanなら、そこで
  `git switch -c <type>/task-008-<slug> origin/main` としてよい。
- 分けるかどうかは手順3のPlanで決まるため、ここでは番号なしの名前で作る。Planで分けると決めたら、
  最初のpushより前に `git branch -m <type>/task-008-1-<slug>` で1番目のブランチの名前に変える。2番目以降は
  手順4で作る。

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
   `docs/implementation-plans/<今日の日付>-task-008-<slug>.md` を作る。「10. Files to Change」には、
   [分け方](../../../docs/development/pull-requests.md#分け方)に従い、PRごとのファイル・順番・ブランチ名・
   レビュー対象のファイル数を書く。合計で20以下なら1つのPRと書く。
5. タスクファイルの `状態` を In progress にし、`関連Implementation Plan` にリンクする。
6. Planとタスク更新を `docs(task-008): ...` としてコミットする。

AGENTS.mdの「重大な設計判断または複数の有力案がある場合」に当たるなら、止まる条件として扱う。

### 4. 実装する

- Planに書いたPRの順に実装する。1つのPRの分を実装・検証・コミットしたら、
  `git switch -c <type>/task-008-<次の順番>-<slug>` でそこから次のブランチを作って続ける
  （互いに依存しないPRは`origin/main`から作る）。各ブランチは単独で検査が通る状態にする。
- 実装中にPRの大きさがPlanから変わったら、Planを直してから分け直す。Planの修正は1番目のブランチで
  コミットし、後ろのブランチへ順に`git merge`で取り込む（Planだけの取り込みは、レビューのやり直しに当たらない）。
- lockfile・migrationが違うブランチへ切り替えたら、`pnpm install --frozen-lockfile`・`bundle install`・
  `bin/rails db:prepare`を実行し直してから検査する（前のブランチの依存で検査が通ってしまうのを防ぐ）。
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
- PRを分けた場合、この記録は1番目のPRの上に積んだ最後のブランチでコミットする（`main`から分けた互いに
  依存しないPRには書かない。Planとタスクファイルは1番目と最後のPRにまたがる。
  [分け方](../../../docs/development/pull-requests.md#分け方)を参照）。

### 6. self-reviewする

`self-review` skillでタスク全体のdiff（`origin/main...<最後のブランチ>`。`main`から分けた互いに依存しない
PRがあれば、そのdiffも）を確認し、該当するレビュー入口（`docs/code-review/`）とsecurity観点で
見直す。指摘は、そのファイルを持つPRのブランチへ切り替えて修正・コミットし、後ろのブランチへ順に
`git merge`で取り込む（[`pr-review-cycle`](../pr-review-cycle/SKILL.md)の手順6と同じ）。確信の持てない
指摘はPRの「確認すること」に入れる。

### 7. pushしてPRを作る

PRごとに1番目から順に、そのPRのブランチへ`git switch`し、`git rev-parse --abbrev-ref HEAD`がpush先と一致する
ことを確かめてから、`<ブランチ>:<ブランチ>`の形で送信先を明示してpushし、PRを作る（例は2番目のPR）。
pre-pushの検査は今いるブランチの作業ツリーを検査するため、切り替えないと、そのブランチを単独で検証したことにならない。
`HEAD:<ブランチ>`の形は使わない（ブランチを行き来するため、別のPRの変更を混ぜてpushしうる）。

```bash
git push -u origin feat/task-008-2-dot-api:feat/task-008-2-dot-api
gh pr create --base feat/task-008-1-dot-model --head feat/task-008-2-dot-api \
  --title "<日本語のタイトル>（2/3）" --body "<本文>"
```

baseは1つ前のブランチにする。1番目と、互いに依存しないPRは`main`にする。PRが1つだけなら
タイトルに順番を付けない。

pushの前に、各ブランチで`git diff --name-only <base>...<ブランチ>`（baseは1つ前のブランチか`origin/main`）の
ファイルを数え、[数えないファイル](../../../docs/development/pull-requests.md#大きさの上限)を除いて20以下か
確かめる。Planの見積もりより増えて超えていたら、Planを直してから分け直す。self-review・仕組み化で
ファイルが増えたときも、pushの前に数え直す。

- pushは送信先のブランチを必ず明示する。`git push` や `git push origin HEAD` のように送信先を省略する形は、
  実行時のブランチや設定でmainに送られうるためhookで拒否される。
- 本文は [.github/pull_request_template.md](../../../.github/pull_request_template.md) の見出し順に
  日本語で書く。テンプレートのコメント・プレースホルダーを残さない。
- 「確認すること」は、人間が確認する操作・画面・仕様上の判断と期待結果のTODOリストにする。そのPRで
  確かめられることだけを書く。
- PRを分けた場合は、全部作ってから各PRの「概要」に、同じタスクのPRの一覧（番号・タイトル・base）と
  マージの順番を書き足す（`gh pr edit <番号> --body`）。

### 8. 機械のレビューを回す

[`pr-review-cycle`](../pr-review-cycle/SKILL.md) の手順2〜8（セルフレビュー → サブエージェント →
Codex → 仕組み化）を、PRごとに1番目から順に回す。各PRの前に、そのPRのブランチへ`git switch`する
（diff・Codexの最終チェックは`HEAD`を基準にするため）。比較の基準は、そのPRのbase（`origin/<1つ前のブランチ>`）にする。

- 前のPRを修正したら、後ろのブランチへ順に`git merge`で取り込んでpushしてから、後ろのPRへ進む。
  rebase・force pushはしない。
- 取り込みでコンフリクトの解消や追加の修正が入った、または前のPRの修正が後ろのPRで使うinterface・
  振る舞いを変えた、既にLGTMのPRは、レビューをやり直す。
- Stop hook（品質ゲート）は今いるブランチのpush・PRしか確かめず、ブランチを切り替えると修正回数の数えも
  初めからになる。hookが通ったことを、すべてのPRの完了とみなさない。
- 途中のPRがLGTMになっても、人間へ個別のレビューを頼まない。

### 9. 人間のレビュー用ガイドを渡す

すべてのPRがLGTMになり、`git fetch origin <各ブランチ>`の後に、すべてのブランチで`git rev-parse <ブランチ>`と`git rev-parse <ブランチ>@{u}`が
一致し、`git status`がcleanなら、[`human-review-artifact`](../human-review-artifact/SKILL.md) でタスク全体のガイドを1つ作る。最後に、ガイドのURL、PRの一覧（マージの順番）、Doneにしたか・残した確認事項、
PRごとのレビューの反復回数を短く報告する。

人間から指摘が来たら、該当するPRで直し、後ろのブランチへ取り込み、直したPRを手順8のとおり
レビューし直してから、ガイドを更新して再び渡す。

## 止まる条件

次のどれかに当たったら、推測で進めない。

- 仕様・設計判断に不明点がある、または複数の有力案がある。
- 完了条件が現在の仕様・実装と矛盾する。
- 秘密情報、外部サービスの設定、課金、本番環境の操作が必要。
- 依存先の判断・契約がこのタスクの前提を満たさない。
- 手順8で、[`pr-review-cycle`](../pr-review-cycle/SKILL.md)の「止まる条件」に当たった（レビューの往復の
  上限、securityの指摘を対応不要と判断したい、Codexの最終チェックが実行できない、など）。

止まるときは、次の順で行う。

1. Planの未決定事項に、判断が必要な点・選択肢・確認済みの事実を書き、コミットする。PRを分けている場合は、
   1番目のブランチでコミットし、後ろのブランチへ順に`git merge`で取り込む。検査が通っていて
   pushできる場合だけpushする（pre-pushが失敗しても回避しない）。
2. `scripts/claude-hook.sh claude-quality-gate.mjs --pause "<判断が必要な点を1行で>"` を、最後に実行する。
   品質ゲートの状態は今いるブランチに結び付き、ブランチを切り替えると`--pause`が消えるため、この後は
   ブランチを切り替えない。
3. チャットで、判断してほしい点と選択肢（推奨があれば推奨）を示して止まる。

人間が判断したら、`scripts/claude-hook.sh claude-quality-gate.mjs --reset` を実行して手順の続きから再開する。

### 品質ゲートの修正上限に達したとき

どれかのブランチで上限に達したら、ほかのブランチへ移らず、タスク全体をここで止める（ブランチを切り替えると
品質ゲートの状態が初期化され、上限が効かなくなるため）。

検査が5回続けて失敗すると、品質ゲートが上限を知らせる。pre-pushも同じ検査を実行するため、
失敗したままではpushもPR作成もできない。この場合はPRを作らずに人間へ引き継ぐ。

1. Planの `Completion Record` に、失敗している検査、試したこと、考えられる原因を書く。
2. pre-commitが通ればローカルでコミットする。push・PR作成はしない。
3. チャットで同じ内容を報告して止まる。再開時は `--reset` を実行してから続ける。
