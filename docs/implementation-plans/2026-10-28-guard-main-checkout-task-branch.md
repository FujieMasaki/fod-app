# Implementation Plan: 本体のcheckoutでタスクのブランチへ移ることを止める

## 1. Status

実施中

## 2. Goal

Claude Codeのセッションが、repositoryの本体のcheckout（`git worktree add`で作ったものではない作業ツリー）で
タスクのブランチ（`<type>/task-*`）へ移らないようにする。タスクのブランチでの作業は、そのタスクのworktreeで行う。

## 3. Background

- 2026-10-24、本体のcheckout（`dev/app/focus-on-dot`）で開いたセッションが、「#103の指摘を直して続きを回して」と
  頼まれ、本体で`git switch feat/task-009-2-job-and-aws`をはじめとするタスクのブランチの切り替えを続けた。
- 同じcheckoutでは、仕様の解説動画を作る別のセッション（repositoryの外だけを変更）も動いていた。Stop hookの
  品質ゲート（`scripts/claude-quality-gate.mjs`）はブランチ名と`git status`だけで判断するため、動画のセッションは
  止まるたびに、自分が作っていない`apps/api/db/schema.rb`などのコミットを求められ、十数回差し戻された。
- 最初は品質ゲートに`/run-task`を始めたセッションのidを記録し、ほかのセッションを外す案で直した（PR #109）。
  ただし、記録から24時間はほかのセッションに品質ゲートがかからない穴と、`--reset`の手順の追加、hookの複雑さを
  抱える。重なりの原因は「本体のcheckoutでタスクのブランチへ移ったこと」なので、そこを止める方針に替え、
  PR #109は閉じた（2026-10-28、人間が判断）。

## 4. Current State

- `/run-task`は、タスクごとに`.claude/worktrees/task-NNN`を作ってその中で進める（定期実行も同じ）。
- `pr-review-cycle`は、PRごとの作業を「そのPRのブランチへ`git switch`してから」行うと書いている。本体のcheckoutで
  起動すると、タスクのブランチへ本体ごと移る。
- PreToolUse hook（`scripts/claude-guard.mjs`）は、Bashのコマンドを解析し、`--no-verify`・force push・mainへの
  pushなどを拒否する。どの作業ツリーで実行されるかは見ていない。

## 5. Scope and Non-goals

- 対象: Claudeが本体のcheckoutで実行する`git switch`・`git checkout`のうち、タスクのブランチへ移るもの
  （作成を含む）と、`gh pr checkout`を拒否する。
- 対象外: 人間が端末で行う切り替え（hookはClaudeのBashだけを見る）。タスクのworktreeの中での切り替え。
  タスクでないブランチ（`fix/<slug>`など。品質ゲートの対象外）への切り替え。alias・script・変数展開を通した
  切り替え（既存のguardと同じく、見える範囲の安全網）。

## 6. References and Documents to Update

- 参照: [自律実行の仕組み](2026-09-26-autonomous-task-runner.md)（当時の記録として更新しない）
- 更新: `README.md`（hookの表のPreToolUse）
- 更新: `.claude/skills/pr-review-cycle/SKILL.md`（タスクのブランチは、そのタスクのworktreeで作業する）
- 更新: `.claude/skills/run-task/SKILL.md`（既にいるworktreeでブランチを作ってよいのは、本体のcheckoutでないとき）
- 更新: `docs/development/pull-requests.md`「人間がレビューする時機」の4（指摘はタスクのworktreeで直す）

## 7. Proposed Approach

1. `denyReason(command, context)`に、実行する場所の情報（`cwd`と、その場所が本体のcheckoutかを返す
   `isMainCheckout(dir)`）を渡せるようにする。渡されなければ、この判定はしない（既存の呼び出しとtestはそのまま）。
2. コマンドを左から見て、`cd <dir>`と`git -C <dir>`で実行する場所を追う。`~`や変数など解決できない移動の後は、
   場所が分からないので判定しない。
3. 本体のcheckoutで、`git switch`・`git checkout`の引数（`--`より前で、`-`で始まらない語）に、
   `refs/heads/`・`refs/remotes/<remote>/`・`origin/`を除いてタスクのブランチ名（`taskBranchPattern`）に
   当たるものがあれば拒否する。`git checkout <ref> -- <path>`はファイルの取り出しなので対象外。
4. 本体のcheckoutでの`gh pr checkout`は、移る先のブランチ名がコマンドから分からないため、PRを問わず拒否する。
5. 拒否の理由には、そのタスクのworktreeを使うこと（`git worktree list`で探す、なければ
   `git worktree add .claude/worktrees/task-NNN <branch>`）を書く。
6. 本体のcheckoutかどうかは、`git rev-parse --path-format=absolute --git-dir --git-common-dir`の2つが同じか
   で判定する（linked worktreeでは`--git-dir`が`.git/worktrees/<名前>`になる）。gitが失敗したら本体ではない
   として扱う（repositoryの外のコマンドを止めない）。

## 8. Why This Approach

- 重なりの原因（本体のcheckoutでタスクのブランチへ移ること）を直接止める。品質ゲートの判定は変えないため、
  #109のような「ゲートが外れる時間」は生まれない。
- 既存のPreToolUse hookに判定を1つ足すだけで、新しいhookや状態ファイルが要らない。
- 本体のcheckoutで作業するセッションは、タスクでないブランチなら従来どおり切り替えられる。

## 9. Data Flow

```text
Claude が Bash を実行しようとする → PreToolUse hook（stdin の cwd と command）
  → cd / git -C で実行する場所を追う
  → 本体の checkout で、タスクのブランチへの switch / checkout、または gh pr checkout → 拒否（exit 2、理由を返す）
  → それ以外 → 既存の判定へ
```

## 10. Files to Change

- 変更: `scripts/claude-guard.mjs`（実行する場所の追跡と、本体のcheckoutでの切り替えの拒否）
- 変更: `scripts/claude-guard.test.mjs`
- 変更: `.claude/skills/pr-review-cycle/SKILL.md`
- 変更: `.claude/skills/run-task/SKILL.md`
- 変更: `docs/development/pull-requests.md`
- 変更: `README.md`
- 新規: 本Plan

1つのPR。

## 11. Libraries / APIs

- Claude Code hookの入力`cwd`（Bashを実行する作業ディレクトリ）。
- `git rev-parse --git-dir --git-common-dir`。

## 12. Alternatives Considered

- 品質ゲートに持ち主のセッションを記録する（PR #109）: どの作業ツリーでも守られるが、24時間の穴と手順・hookの
  複雑さを抱える。閉じた。
- 手順書に「タスクのworktreeで直す」と書くだけ: 最も軽いが、今回のように普通の依頼から入ったときに守られない。
- `/run-task`を本体のcheckoutで始めたら止める: `/run-task`はもともとworktreeを作るため、今回の経路には効かない。

## 13. Risks / Things to Watch

- Claudeは本体のcheckoutでタスクのブランチを手早く見ることができなくなる。読むだけなら`git show <branch>:<path>`や
  `git diff`で足りる。
- 本体のcheckoutで`gh pr checkout`は、タスクでないPRでも拒否する。
- `cd`の追跡は単純で、subshell（`(cd x && …)`）の後も移った先のままとして扱う。拒否する側に倒れるだけで、
  素通りにはならない場合が多いが、完全ではない（既存のguardと同じく安全網）。

## 14. Verification

### Automated

- `node --test scripts/claude-guard.test.mjs`

### Manual

- 本体のcheckoutで、hookに`git switch feat/task-999-x`のpayloadを渡して拒否されること、linked worktreeでは
  許されることを確かめる。

## 15. Definition of Done

- 本体のcheckoutでタスクのブランチへ移るコマンドと`gh pr checkout`が拒否され、worktreeの中とタスクでない
  ブランチは従来どおり通る。
- lint / testが通る。
