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

- 決定済み（2026-10-29、人間が判断）: 本体のcheckoutから既存のタスクのworktreeへ入る前に確かめるのは、定期実行の
  セッションが作業中でないこと（`task-status.mjs`の`reasons`）だけにする。`runnable`全体は見ない（対話で進めるタスクや
  Doneのタスクでも止まってしまうため）。`FOD_DB_SUFFIX`は、ブランチが`apps/api/db/migrate/`を変えるときだけ求める
  （DBが混ざる場面だけ再起動の手間をかける）。

## 6. References and Documents to Update

- 参照: [自律実行の仕組み](2026-09-26-autonomous-task-runner.md)（当時の記録として更新しない）
- 更新: `README.md`（hookの表のPreToolUse）
- 更新: `.claude/skills/pr-review-cycle/SKILL.md`（タスクのブランチは、そのタスクのworktreeで作業する）
- 更新: `.claude/skills/run-task/SKILL.md`（既にいるworktreeでブランチを作ってよいのは、本体のcheckoutでないとき）
- 更新: `docs/development/pull-requests.md`「統合ブランチとサブのPR」（PRごとの作業でタスクのブランチへ移るのは
  worktreeの中）、「人間がレビューする時機」の4（指摘はタスクのworktreeで直す）、「マージ」の3（`main`の取り込みは
  タスクのworktreeで行う）
- 更新: `.claude/skills/exploratory-audit/SKILL.md`（`docs/task-NNN-audit-record`はworktreeで作る）
- 更新: `docs/code-review/frontend/README.md`（自動化の行。gitを起動するscript・testがgit hookの中でも`-C`の場所だけを
  操作するか、手順書の作業場所とhookの拒否が食い違わないか）

## 7. Proposed Approach

1. `denyReason(command, context)`に、実行する場所の情報（`cwd`と、その場所が本体のcheckoutかを返す
   `isMainCheckout(dir)`）を渡せるようにする。渡されなければ、この判定はしない（既存の呼び出しとtestはそのまま）。
2. コマンドを左から見て、`cd <dir>`と`git -C <dir>`で実行する場所を追う。`~`や変数など解決できない移動の後は、
   場所が分からないので判定しない。
3. 本体のcheckoutで、`git switch`・`git checkout`が、`refs/heads/`・`refs/remotes/<remote>/`・`origin/`を除いて
   タスクのブランチ名（`taskBranchPattern`）に当たるブランチへ移るなら拒否する。ブランチを作る（`-c`・`-b`・
   `--create`など）ときは新しい名前だけで判定し、それ以外は`--`より前の`-`で始まらない語で判定する。
   `git checkout <ref> -- <path>`はファイルの取り出しなので対象外にするが、pathのない末尾の`--`は切り替えとして扱う。
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
- 変更: `.claude/skills/exploratory-audit/SKILL.md`
- 変更: `README.md`
- 変更: `docs/code-review/frontend/README.md`（自動化の行。レビューで見つかった問題の再発防止）
- 新規: 本Plan

1つのPR。

## 11. Libraries / APIs

- Claude Code hookの入力`cwd`（Bashを実行する作業ディレクトリ）。前のBashの`cd`と`EnterWorktree`を反映する
  （§14のManualで確認）。
- `git rev-parse --path-format=absolute`（git 2.31以上）。古いgitでは判定が常に「本体ではない」になり、素通りになる。
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
- `cd`の追跡は単純で、subshell（`(cd x && …)`）の後も移った先のままとして扱う。`pushd`・`env -C`は追跡しない。
  どちらも実際の実行場所と違う場所で判定するため、素通りになる場合がある（既存のguardと同じく安全網）。
- `--`のない`git checkout <タスクのブランチ> <path>`（ファイルの取り出し）も、切り替えとして拒否する。`--`を付ければ通る。
  短いオプションをまとめた`git checkout -qb <新しいブランチ> <タスクのブランチ>`も、起点の名前で拒否する。
- heredocの本文（commit message・PR本文）に`git switch <タスクのブランチ>`や`gh pr checkout`を書くと、既存の判定と同じく
  コマンドとして解析されて拒否される。本文は`--body-file`・`-F <file>`で渡す（`pull-requests.md`の勧めと同じ）。
- `$(...)`とheredocの本文は外側のコマンドの後に解析するため、`cd`の追跡の順が実行の順と違うことがある（既知の穴）。
- guardは`taskBranchPattern`を`claude-quality-gate.mjs`から読み込む（ブランチ名の判定を食い違わせないため）。
  読み込みに失敗したとき（編集中の構文の誤りなど）は、本体のcheckoutの判定だけが外れ、既存の拒否は続く。
- 判定するのは、guard自身が属するrepository（`--git-common-dir`が同じもの）の本体のcheckoutだけ。同じブランチ名の
  形を使う別のrepositoryでは拒否しない。
- 判定しない切り替え（既知の穴）: `git switch -`・`git checkout -`・`@{-1}`（前のブランチへ戻る）、
  `git rebase <upstream> <branch>`、`git stash branch`、`git branch -m`、`git --git-dir`・`--work-tree`。どれも普段の
  手順にはなく、拒否すると行き先を調べるためにgitの起動が増えるため、安全網の範囲外とする。
- 定期実行のセッションが作業中のworktreeへ、本体から来たセッションが入ると、同じworktreeで重なる。`pr-review-cycle`の
  冒頭で、入る前に定期実行のセッションの有無を確かめる手順にした（§5の決定済み）。
- migrationのないタスクのworktreeでは、`FOD_DB_SUFFIX`なしで既定のDBを使う。本体のcheckoutで作業していた以前と同じ。
- git hookの中（pre-pushがtestを実行する）では`GIT_DIR`が設定されていて、`git -C <dir>`より優先される。
  `isMainCheckout`とtestの一時repositoryの操作は、`GIT_DIR`などを外した環境でgitを実行する。外さずに実行した
  最初の版では、pre-pushの中でtestが本物のrepositoryへ書き込み、共有の設定に`core.bare=true`が入って本体の
  checkoutが使えなくなった（2026-10-28、push前に気付いて元へ戻した）。

## 14. Verification

### Automated

- `node --test scripts/claude-guard.test.mjs`

- 本体のcheckoutとlinked worktreeを一時ディレクトリに作り、`isMainCheckout`の判定を本物のgitで確かめるtestを含む。
- 結果（2026-10-28）: `node --test scripts/claude-guard.test.mjs` 136件成功。`GIT_DIR`を使い捨てのrepositoryへ向けて
  同じtestを実行し、そのrepositoryが変わらないことも確かめた。`pnpm check`・`type-check`・`test`成功。

### Manual

- 本体のcheckoutで、hookに`git switch feat/task-999-x`のpayloadを渡して拒否されること、linked worktreeでは
  許されることを確かめる。
- 結果（2026-10-28）: `scripts/claude-hook.sh claude-guard.mjs`にpayloadを渡した。
  - `cwd`が本体（`dev/app/focus-on-dot`）、`git switch feat/task-009-2-job-and-aws`: exit 2（拒否）
  - `cwd`が本体、`git checkout feat/task-009-2-job-and-aws --`: exit 2（拒否）
  - `cwd`が`.claude/worktrees/task-009`、`git switch feat/task-009-2-job-and-aws`: exit 0
  - `cwd`が本体、`git switch -c fix/some-thing origin/main`: exit 0
  - `cwd`が本体、`git switch -c fix/x origin/feat/task-009-2-job-and-aws`: exit 0
  - `cwd`が`/tmp`（repositoryの外）、`git switch feat/task-009-x`: exit 0
- 結果（2026-10-29）: 一時repositoryに、PreToolUse hookの入力を記録する設定を置いて`claude -p`（2.1.286）を実行した。
  Bashで`cd sub`した次の呼び出しでは`cwd`が`…/repo/sub`、`EnterWorktree`の後は`…/repo/.claude/worktrees/probe`になり、
  hookの`cwd`が実際の作業ディレクトリを反映することを確かめた。

## 15. Definition of Done

- 本体のcheckoutでタスクのブランチへ移るコマンドと`gh pr checkout`が拒否され、worktreeの中とタスクでない
  ブランチは従来どおり通る。
- lint / testが通る。
