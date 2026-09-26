# Implementation Plan: 実装タスクをPR作成まで自動で進める仕組み

## 1. Status

完了（2026-09-26）。実装差異と検証結果は16章に記録した。

## 2. Goal

人間が「TASK-008を進めて」または`/run-task TASK-008`と指示すると、Claude Codeが着手可否の確認、
Plan作成、実装、品質検査、self-review、コミット、push、PR作成までを途中で止まらずに進める。
テストが失敗しても終了せず修正を続け、修正で解決しない場合と人間の判断が必要な場合だけ止まる。

## 3. Background

- 現在は1タスクごとに、実装・検査・PR作成の各段階で人間が次の指示を出している。
- Claude Codeは、Bashのcommandが失敗しただけでは止まらない。止まるのはClaudeがターンを
  終えると判断したときであり、「失敗したまま完了報告する」「途中で確認を求める」ことが継続を妨げる。
- 設計判断は人間と一緒に行う方針で合意した（2026-09-26）。自動化の対象は実装系のタスクに限る。
- PRは作成者本人だけがレビューするため、Draftではなく通常のPRにする。マージは人間が行う。
- 起動は手動とし、定期実行はしない。

## 4. Current State

- `docs/tasks/TASK-*.md`は表形式で`状態`（Todo / In progress / Done / Blocked）、`作業区分`、
  `依存するタスクID`、`確認可能な完了条件`（checkbox）を持つ。2026-09-26時点でTodoは設計判断の
  TASK-002〜004だけで、自動化の対象になるタスクはまだない。
- `.claude/`には個人用の`settings.local.json`（permission allowlist）と`launch.json`だけがあり、
  共有の`settings.json`、hook、Skillはない。
- Lefthookがpre-commitでESLintと命名チェック、pre-pushで`pnpm type-check`と`pnpm test`を実行する。
- CIは`scripts/ci-changes.mjs`の`classifyPaths`で変更範囲（web / api）を判定し、webは
  check / type-check / test / build、apiはRuboCop / Brakeman / bundler-audit / RSpecを実行する。
- hookを実行するshellの既定のNodeはv14になりうる。nodebrewの`~/.nodebrew/current/bin`はv22.23.1。
  `apps/api`はrbenvでRuby 3.4.10、ローカルのPostgreSQLに接続できる。

## 5. Scope and Non-goals

### 今回の対象

- 手順を定義するSkill `/run-task`。
- 終了時の品質ゲート（Stop hook）、危険な操作の拒否（PreToolUse hook）、編集ファイルの即時lint
  （PostToolUse hook）。
- タスクファイルから着手可否を判定するscriptと、hook scriptのtest。
- 共有の`.claude/settings.json`（hook登録とpermission）。
- 関連する現行文書の更新。

### 今回の対象外

- 設計判断（`作業区分`が設計判断・API契約）のタスクの自動化。これまでどおり人間と対話で進める。
- 定期実行、複数タスクの並列・連続実行、自動マージ。
- CIの変更。

### 未決定で、今回確定しない事項

- 1タスクあたりのターン上限の最適値。まず40で運用し、実績を見て調整する。

## 6. References and Documents to Update

### 参照

- [AGENTS.md](../../AGENTS.md)、`personal-conventions.md`（コミット分割・帰属トレーラーなし）
- [docs/tasks/README.md](../tasks/README.md)（状態・依存・Doneの定義）
- [docs/code-review/](../code-review/)（self-reviewの観点）
- [.github/pull_request_template.md](../../.github/pull_request_template.md)
- Claude Code公式文書: hooks、skills、`/goal`、permission modes

### 同じ変更で更新する現行文書

- `AGENTS.md`: 自動実行の対象と、自動実行中も守る規約（推測で実装しない等）への入口。
- `docs/tasks/README.md`: 自動実行できるタスクの条件と、状態の更新ルール。
- `README.md`: Claude Codeのhookと`/run-task`の使い方を「Local Git Hooks」の近くに追記。
- `docs/architecture.md`: rootが管理するものにClaude Code設定を追記。

## 7. Proposed Approach

### Step 1: 着手可否の判定script

`scripts/task-status.mjs TASK-008`がタスクファイルを読み、次をJSONで返す。

- `runnable`: 次をすべて満たすときtrue。
  - `作業区分`が設計判断・API契約ではない。
  - `状態`がTodo、またはBlockedで依存タスクがすべてDone（Blocked解除の候補）。
    In progressは再開として扱う。Doneは対象外。
  - `依存するタスクID`がすべてDone。
- `reasons`: 対象外のときの理由（例: `TASK-005 is Blocked`）。
- `acceptanceCriteria`: 完了条件のcheckbox一覧（自己検証に使う）。

判定を正規表現の手作業でなくscriptにすることで、Skillの手順がずれても判定結果が変わらず、
testで固定できる。

### Step 2: Skill `/run-task`（`.claude/skills/run-task/SKILL.md`）

`description`に「TASK-XXXを進めて」「TASK-XXXを実装して」などの言い方を含め、自然文でも
起動しやすくする。確実に起動したいときは`/run-task TASK-008`と入力する。手順は次の順。

1. `node scripts/task-status.mjs <ID>`で判定する。対象外なら理由を示して止まる（設計判断なら
   対話で進めることを提案する）。
2. mainを最新にし、worktreeとブランチ`claude/task-008-<slug>`を作る。依存をinstallする。
3. 前回の停止の印があれば消す（Step 6）。
4. タスクファイル・根拠仕様・AGENTS.mdの必読文書を読み、Implementation Planを作る。タスクの
   状態をIn progressにし、`関連Implementation Plan`にリンクする。
5. 実装し、関心事ごとにコミットする（ロジック → UI、帰属トレーラーなし）。
6. 完了条件を1件ずつ検証し、Planの`Completion Record`に証跡を記録する。人間の確認が必要な
   条件は未チェックのまま残し、タスクはIn progressのままにする。全条件を検証できた場合だけDone。
7. `self-review`でdiffを確認し、指摘を修正する。
8. pushし、PR templateに従う日本語のPRを作る。PR URLを出力して終わる。

**止まる条件（エスカレーション）**: 仕様・設計判断に不明点がある、完了条件が現状の仕様と矛盾する、
秘密情報や外部サービスの設定が必要、のいずれかに当たったら推測で実装しない。Planの未決定事項に
記録し、停止の印を残して（Step 6）、チャットで人間に判断を求めて止まる。

### Step 3: 品質ゲート（Stop hook）`scripts/claude-quality-gate.mjs`

Claudeがターンを終えようとするたびに実行する。

1. 現在のブランチが`claude/task-*`でなければ何もしない（通常の会話では検査しない）。
2. `git merge-base origin/main HEAD`からの差分（未コミットを含む）を`classifyPaths`に渡し、
   CIと同じ基準でweb / apiの要否を決める。docsだけなら検査しない。
3. webならroot scriptの`check` / `type-check` / `test`、apiなら`rubocop` / `brakeman` / `rspec`を
   実行する。`build`と`bundler-audit --update`は時間とnetworkの都合でCIに任せる。
4. 失敗したら終了をblockし、失敗したcommandと出力の末尾をreasonとしてClaudeに返す。
5. 連続失敗の回数をgit dir内の状態ファイルに記録する。5回目の失敗では「修正上限に達した。
   失敗内容をPlanに記録してローカルでコミットし、push・PR作成はせずに人間へ報告して止まる」と
   blockし、その次は終了を許可する。成功したら回数をリセットする。pre-pushが同じ検査を実行するため、
   失敗したままではpushもPR作成もできないことによる（PR #29のレビューで修正）。

PATHの先頭に`~/.nodebrew/current/bin`を加え、hookでもNode 22を使う。

### Step 4: 危険な操作の拒否（PreToolUse hook）`scripts/claude-guard.mjs`

Bashのcommandを検査し、次を拒否してClaudeに理由を返す。

- `--no-verify`（Lefthookの回避）
- `git push --force` / `-f`（`--force-with-lease`は許可）と、`main`へのpush
- `gh pr merge`（マージは人間が行う）
- `git commit`での`Co-Authored-By`トレーラー

`.env*`・`master.key`・`credentials/*.key`の読み取りは`settings.json`の`permissions.deny`で拒否する。
これらは作業ブランチに関係なく常に有効にする。

### Step 5: 編集ファイルの即時lint（PostToolUse hook）

`claude/task-*`ブランチで、Edit / Writeしたファイルだけを対象にESLint（js/ts）またはRuboCop（rb）を
実行する。失敗しても止めず、結果をClaudeへの追加情報として返す。最後に品質ゲートでまとめて失敗する
より、編集直後に直すほうが修正が小さいため。

### Step 6: PR作成まで継続させる仕組み（`/goal`の代わりにStop hookで判定）

公式文書では、`/goal`はユーザーが入力するcommandで、Skillやhookから設定する方法が示されていない。
`/goal`に頼ると、人間が`/run-task`の後にもう1行入力する必要がある。そこで、品質ゲートと同じStop hookで
「完了したか」も判定する。

- 品質ゲートが通った後、`gh pr view`で現在のブランチのPRがあるか確認する。なければ
  「PRを作成するまで続ける」とblockする。
- 人間の判断が必要で止まる場合、Claudeは`scripts/claude-hook.sh claude-quality-gate.mjs --pause "<理由>"`を
  実行し、git dir内に停止の印を残す。印があればblockしない。次の`/run-task`で印を消す。
- 継続の上限として、ブランチごとのblock回数を数え、40回で終了を許可する（ターン上限の代わり）。

判定がharnessで決まるため、評価役モデルの解釈に左右されない。人間が追加で`/goal`を入力しても
併用でき、妨げない。

### Step 7: 共有設定 `.claude/settings.json`

- hooks: Stop → 品質ゲート、PreToolUse(Bash) → guard、PostToolUse(Edit|Write) → lint。
- permissions.allow: `pnpm`、`git`（add/commit/push/switch/worktree等）、`gh pr create`、
  `bundle exec`、`bin/rails`など自動実行で必要なcommand。
- permissions.deny: 秘密情報のRead、`gh pr merge`。
- `.gitignore`に`.claude/worktrees/`を加える。

起動時のpermission modeは`acceptEdits`（またはauto mode）を推奨し、`bypassPermissions`は使わない。

## 8. Why This Approach

- **Skill + hookの役割分担**: 手順はSkillに書き、必ず守らせたい検査はhookに置く。Skillの手順は
  Claudeが解釈するため飛ばされうるが、hookはharnessが実行するので必ず効く。
- **品質ゲートをStop hookにする**: 失敗したcommandを通すのではなく、終了を差し戻すことで
  「失敗したまま完了報告する」ことを防ぐ。
- **CIと同じ判定を再利用**: `classifyPaths`を使い、ローカルとCIで検査対象がずれないようにする。
- **ブランチ名で有効化**: 通常の会話で毎回テストが走ると遅く邪魔になる。ブランチ名は状態ファイルより
  壊れにくく、人間にも見える。
- **scriptをNodeで書き`scripts/`に置く**: 既存のCI scriptと同じ形で、`pnpm test:scripts`に乗る。

## 9. Data Flow

アプリケーションのデータフローに変更はない。開発作業の流れは次のとおり。

```text
人間:「TASK-008を進めて」/ /run-task TASK-008
↓
Skill: task-status.mjs で判定 → 対象外なら理由を示して停止
↓
worktree・ブランチ作成 → 状態リセット → Plan → 実装・コミット
  ├ Edit/Write ごと: PostToolUse lint → 結果をClaudeへ
  └ Bash ごと: PreToolUse guard → 危険なcommandは拒否
↓
ターン終了のたび: Stop hook
  ├ 停止の印あり → 終了を許可（人間の判断待ち）
  ├ 検査失敗 → block（出力をClaudeへ）→ 修正を続ける（5回まで）
  ├ 検査成功・PRなし → block（PR作成まで続ける）
  └ 検査成功・PRあり → 終了を許可
↓
self-review → push → PR作成 → URL出力 → 停止
↓
人間: PRの「確認すること」を確認してマージ
```

正本: タスクの状態は`docs/tasks/TASK-*.md`、検証の証跡は各タスクのPlan。

## 10. Files to Change

- `.claude/skills/run-task/SKILL.md`（新規）: 自動実行の手順。
- `.claude/settings.json`（新規）: hook登録とpermission。
- `scripts/task-status.mjs` / `scripts/task-status.test.mjs`（新規）: 着手可否の判定とtest。
- `scripts/claude-quality-gate.mjs` / `.test.mjs`（新規）: Stop hookの品質ゲート。
- `scripts/claude-guard.mjs` / `.test.mjs`（新規）: PreToolUseの拒否判定。
- `scripts/claude-lint-edited.mjs` / `.test.mjs`（新規）: PostToolUseの即時lint。
- `scripts/claude-hook.sh`（新規）: hookをNode 22 / rbenvのPATHで起動するwrapper。
- `eslint.config.mjs`（変更）: `.claude/worktrees/**`をlint対象から外す。
- `.gitignore`（変更）: `.claude/worktrees/`。
- `AGENTS.md`、`docs/tasks/README.md`、`README.md`、`docs/architecture.md`（変更）: 6章のとおり。
- このPlan（新規）。

## 11. Libraries / APIs

新しいdependencyは追加しない。

- Claude Code hooks（Stop / PreToolUse / PostToolUse）: 標準入力のJSONを受け、終了をblockする・
  toolを拒否する・追加情報を返す。
- Claude Code Skills: 手順の定義と`/run-task`の起動。
- `gh pr view`: 現在のブランチにPRがあるかの判定。
- Node標準（`node:child_process`、`node:fs`、`node:test`）と既存の`scripts/ci-changes.mjs`。

## 12. Alternatives Considered

- **`claude -p`を呼ぶshell script**: 途中経過が見えず、止まったときにその場で相談できない。
  手動起動ならSkillのほうが合う。
- **hookを使わずSkillの手順だけで検査させる**: 手順は飛ばされうるため、完了前の検査を保証できない。
- **設計判断タスクも選択肢を整理したPRまで自動化する**: 判断材料が不足したまま調べると前提を
  直して再調査になり、トークンが無駄になる。対話で進める方針で合意した。
- **品質ゲートを常に有効にする**: 通常の会話でも毎回テストが走り遅い。
- **`/goal`で継続させる**: Skillから設定できず、人間の追加入力が必要になる。評価役モデルは会話しか
  見ないため、PRの有無を確実には判定できない。任意の併用は妨げない。

## 13. Risks / Things to Watch

- **無限ループ・費用**: 品質ゲートの連続失敗上限（5回）、ブランチごとのblock上限（40回）、harnessの
  Stop hook連続block上限（既定8回）で抑える。harnessの上限に先に当たる場合は、block間でClaudeが
  作業を進めている限り連続とはみなされない想定のため、実装時に挙動を確認する。
- **`gh`の失敗**: 未ログイン・network断で`gh pr view`が失敗した場合は、PRなしと誤判定して無限に
  blockしないよう、理由を返して終了を許可する。
- **testを弱めて通す**: 失敗を消すためにtestを削除・skipする恐れがある。Skillで禁止し、
  self-reviewとPRの「確認すること」でtest差分を確認対象にする。
- **guardの抜け道**: 文字列検査は完全ではない（別名・scriptの経由など）。permissionとLefthookと
  併用する安全網として扱い、唯一の防御にしない。mainの保護はGitHubのruleset（PR必須・force push禁止・
  CI Gate必須）が最終的に担う。
- **Stop hookの実行時間**: RSpecやVitestが長くなると毎ターンの終了が遅くなる。変更範囲で絞り、
  必要ならtimeoutを設定する。
- **worktreeの依存**: 新しいworktreeには`node_modules`とbundleがない。Skillの準備手順で入れる。
- **hook環境のruntime**: Node v14やsystem Rubyで動くと誤って失敗する。PATHを明示し、rbenvの
  `.ruby-version`は`apps/api`で実行して解決する。
- **仕様の変化**: Claude Codeのhook出力形式やgoalの挙動は更新されうる。実装時に公式文書で確認する。

## 14. Verification

### Automated

- `node --test scripts/task-status.test.mjs`: 対象の作業区分、状態ごとの判定、依存未完了、
  存在しないID、完了条件の抽出。
- `node --test scripts/claude-quality-gate.test.mjs`: ブランチ判定、docsのみでskip、失敗時のblock、
  連続失敗の上限、成功時のリセット、PRなしでblock・PRありで許可、停止の印、`gh`失敗時の許可
  （commandの実行部分は差し替えてtestする）。
- `node --test scripts/claude-guard.test.mjs`: 拒否すべきcommandと許可すべきcommand
  （`--force-with-lease`、feature branchへのpush等）。
- `pnpm check`、`pnpm test`。

### Manual

- 対象外のタスク（TASK-002: 設計判断、TASK-008: 依存未完了）で`/run-task`を実行し、理由を示して
  止まることを確認する。
- 検証用の小さいダミータスクで、わざと失敗するtestを含めて実行し、品質ゲートでblockされ修正に
  戻ること、PR作成まで進むことを確認する（検証後にダミーは削除する）。
- 「TASK-XXXを進めて」の自然文でSkillが起動することを確認する。
- guardが`git push --no-verify`と`gh pr merge`を拒否することを確認する。

## 15. Definition of Done

- 対象外のタスクでは理由を示して止まり、対象のタスクではPR作成まで止まらず進む。
- testの失敗では終了せず修正に戻り、上限に達したら失敗内容をPlanに記録し、PRを作らずに人間へ引き継いで止まる。
- 危険な操作が拒否される。
- 追加したscriptのtestと`pnpm check` / `pnpm test`が通る。
- 関連する現行文書が更新され、実装内容を人間が説明できる。

## 16. Completion Record

- 状態: 2026-09-26 完了。
- 実装差異:
  - hookの起動をwrapper `scripts/claude-hook.sh`経由にした。PATHにNodeがない環境ではhook scriptそのものが
    起動できないことを確認したため（`env: node: No such file or directory`）。JS側のPATH調整は不要になり外した。
  - Stop hookは、PRの有無に加えて未コミット・未pushの変更も差し戻す。PR作成後の追加修正がpushされずに
    終わることを防ぐため。
  - blockはexit code 2 + stderrで返す。公式文書でStop hookのJSON出力形式の記述が揺れているため、
    文書が一致して示す方式を選んだ。止めずに情報だけ返すときは`systemMessage`を出す。
  - 連続失敗の上限に達したときは、失敗内容をPlanに記録してローカルでコミットし、push・PR作成はせずに人間へ
    報告するよう指示してblockし、次の終了を許可する（`gaveUp`）。当初は失敗内容を書いたPRを作る指示だったが、
    pre-pushが同じ検査を実行するためpushできず、指示どおりに終えられないとPR #29のレビューで指摘を受けて
    変更した。
  - guardは、引用符の中身を消してから文字列を照合する方式から、シェルの引用符・escapeを解釈して単語に分ける
    方式に変えた。`git push origin "HEAD:main"`や`LEFTHOOK="0"`が検査をすり抜けるとPR #29のレビューで
    指摘されたため。コミットメッセージなど値を取るoptionの次の単語だけを検査対象から外す。
  - main保護は、送信先を`HEAD:<branch>`のように明示したpushだけを許可し、送信先がmainなら拒否する。
    refspecの省略、`HEAD` / `@`、`:`のないbranch名は拒否する。PR #29の1回目のレビューで、main上での
    `git push origin HEAD`がmainに送られると指摘され、一度は実行先の現在ブランチで判定した。しかし2回目の
    レビューで、`git switch main && git push origin HEAD`（判定時点ではまだタスクブランチ）や
    `push.default=upstream`でupstreamがmainの場合にすり抜けると指摘された。実行時の状態に依存する判定は
    防げないため、送信先の明示を必須にした。`--all` / `--mirror`も拒否する。
  - 短縮optionの連結（`-nm"msg"`、`-uf`）は、gitと同じく左から読み、値を取るflagまでを検査する。
    `-nm"wip: hook check"`のように値に空白や記号を含むと検査を飛ばしていたと、2回目のレビューで指摘されたため。
  - tokenizerはリダイレクト（`2>&1`、`>>log`、`&>log`、`<<'EOF'`）のfd番号と対象を引数から除く。`2>&1`の`&`を
    区切りとして扱い、`2>`をrefspecと誤認して正しいpushを拒否していたため（対応中に自分のpushで発見）。
    heredocの本文はコマンドとして検査する。`sh <<EOF`のように実行されうるため、誤検知を許して安全側に倒す。
  - PR #29の3回目のレビューで、`refs/heads/*:refs/heads/*`のようなwildcard refspec、heredoc本文中の`'`が
    後続のコマンドを隠す問題、`2>&-`が次の`-n`を消す問題を指摘された。tokenizerを次のように作り直した。
    - heredocは終端の行を認識して本文を切り出し、外側のコマンドとは別に解析する（本文も検査は続ける）。
    - `$(...)`と`` `...` ``（二重引用符の中を含む）、`sh -c` / `bash -c` / `eval`の引数を、それぞれ別の
      コマンドとして解析する。`command` / `exec` / `nohup`などの前置きは外してから判定する。
    - リダイレクト演算子を明示的に解析し、`>&-` / `<&-`は対象を取らない。
    - 閉じていない引用符・heredoc・置換を含む場合は推測せず、git / ghを含むコマンドなら拒否する。
    - wildcard（`*`）と否定（`^`）のrefspecを拒否する。
  - GitHubのruleset「main: CI必須」がmainへのPR必須・force push禁止・削除禁止・CI Gate必須を強制して
    おり、bypass actorもいないことを確認した。mainへの直接pushとLefthook回避の最終的な防御はこのrulesetと
    CIが担い、guardは手元で早く止めるための多重防御と位置づける。
  - worktreeは`EnterWorktree`の`name`ではなく、`git worktree add`で作って`path`で入る。hookを有効にする
    ブランチ名`claude/task-*`を固定するため。
  - `.claude/worktrees/**`をESLintの対象から外した。main側の`eslint .`がworktreeの中まで検査しないようにするため。
- 検証結果:
  - `pnpm test:scripts`: 131件pass（task-status 8、quality-gate 11、guard 94、lint-edited 3と既存test）。PR #29の
    2回目のレビュー対応後の値。
  - `pnpm exec eslint scripts/`、`pnpm lint:naming`: pass。
  - `node scripts/task-status.mjs`を実タスクで実行: TASK-002は設計判断、TASK-008 / TASK-016は依存未完了
    として`runnable: false`になり、理由が示された。
  - 一時ブランチ`claude/task-999-smoke`で、`PATH=/usr/bin:/bin`の最小環境からwrapper経由でStop hookを実行した。
    web / apiの全検査が約10秒で通った後、未コミットの変更でblockされた（exit 2）。失敗するtestを一時的に
    追加すると`pnpm test`の失敗出力付きで`(1/5)`としてblockされ、`--pause`後は`systemMessage`付きで終了が
    許可され、`--reset`で状態ファイルが消えた。`gh pr view`はPRのないブランチで`none`を返した。確認後に
    一時ブランチとtestは削除した。
  - このセッションで`git push --dry-run --no-verify ...`を実行し、PreToolUse hookが拒否した。
  - 実際のgitで、pre-commitが必ず失敗する一時repositoryを作り、`git commit -nm"wip: hook check"`がhookを
    回避して成功すること（guardが防ぐべき挙動）と、guardがこのcommandを拒否することを確認した。
  - 3回目のレビューの3件も実際のgitで再現した。wildcard refspecのdry-runで`main -> main`が含まれること、
    `git commit 2>&- -n`が失敗するpre-commitを回避すること。guardは3件とも拒否し、
    `git push -u origin HEAD:claude/task-999-x 2>&1`は許可した。
  - 未実施: 実際のタスクで`/run-task`をPR作成まで通す確認、自然文「TASK-XXXを進めて」でのSkill起動確認、
    PostToolUse lintのセッション内での確認。現在は実行可能な実装タスクがなく、新しいセッションでの確認が
    必要なため。PRの「確認すること」に入れる。
- 関連: 本PR。
