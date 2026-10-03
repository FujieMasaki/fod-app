# Implementation Plan: PRの分割とタスク単位の人間のレビュー

## 1. Status

実施中（機械のレビュー中。Codexの最終チェックでLGTMになったら完了にする）

## 2. Goal

AIが自動で作るPRを、人間が1回で読み切れる大きさ（レビュー対象のファイル20個まで）に分ける。人間の
レビューは、タスクのすべてのPRが機械のレビュー（セルフレビュー → サブエージェント → Codex）で
LGTMになってから、タスク単位で1回行う。

## 3. Background

- TASK-006のPR #48は83ファイル・約3,700行で、人間が通して読むには大きすぎた。
- 分割の基準がなく、`run-task`は1ブランチ1PRを前提にしていた。
- 分割すると、どのPRの時点で人間がレビューするかが決まっていない。途中のPRを個別に見ると、後のPRで
  前の設計が変わったときに見直しが二度手間になる。
- `run-task`はPR作成で終わり、機械のレビュー（`pr-review-cycle`）と人間のレビュー用ガイドの作成に
  つながっていなかった。

## 4. Current State

- `.claude/skills/run-task/SKILL.md`: 1ブランチ（`<type>/task-NNN-<slug>`）で実装し、PRを1つ作って終わる。
- `.claude/skills/pr-review-cycle/SKILL.md`: 1つのPRについてレビューを回し、LGTM後にガイドを作る。
- `.claude/skills/human-review-artifact/SKILL.md`: PRごとに1ページ（`PR #<番号> レビューガイド`）。
- `scripts/claude-quality-gate.mjs`: `<type>/task-NNN(-…)`のブランチで、検査・push・PRの有無を確かめる。
  分けたブランチ名にも一致する。ただし、状態ファイルはworktreeに1つで、ブランチが変わると初期化される
  （修正5回・差し戻し40回の上限が数え直しになる）。push・PRの有無は今いるブランチしか見ない。差し戻しの
  文言は「PRを作ってURLを出す」までで、機械のレビュー・ガイドの作成は確かめない。
- `scripts/claude-guard.mjs`: pushの送信先が`main`か省略されているかを確かめる。`HEAD:<別のPRのブランチ>`の
  ように、送信先は明示されているが今いるブランチと違うpushは検出しない。
- `scripts/codex-final-check.mjs`: baseに`origin/<任意のブランチ>`を受け付けるため、積み重ねたPRでも使える。
- `scripts/task-scheduler.mjs`（PR #49、本PRの作業中にmainへ入った）: `/run-task`を`claude -p --permission-mode auto`で
  無人起動し、4時間で打ち切る。結果のレポートには、セッションが最後にいたブランチのPRだけが載る。
  タスクの判定に使うブランチ名の正規表現（`task-(\d{3})(?:-|$)`）は、分けたブランチ名にも一致する。

## 5. Scope and Non-goals

- 対象: 分割の規約の新設、`run-task`・`pr-review-cycle`・`human-review-artifact`の手順、AGENTS.md・README.mdの要約。
- 対象外: hook・scriptの変更。ブランチ名・baseの形式は現状で通るため、上記の制約は手順（`<ブランチ>:<ブランチ>`
  の形のpush、すべてのブランチのpush状態の確認）で補い、hookの改修は必要になったら別のPRで行う。
  マージの自動化（マージは人間が行う）。
- 決定済み:
  - 上限は「レビュー対象のファイル20個」。lockfile・生成物（`schema.rb`、`api-contract.d.ts`）、
    タスクファイルの状態だけの更新は数えない。testとPlan・仕様文書は数える。
  - 依存するPRは積み重ね（stacked PR）にし、前のPRの修正は`git merge`で後ろへ取り込む（rebase・force pushは
    既存の規則で禁止のため）。
  - 新しい手順で使う`git merge`・`git branch -m`・`git branch -D`・`gh pr edit`・`gh api`・`git cherry-pick`・`bin/rails db:drop`・
    `git checkout <コミット> -- <path>`は許可ルールにないため、実行のたびに確認が出る。許可ルール（`.claude/settings.json`）への追加は人間が行い、このPRでは変えない。
  - 契約・API・Webは別のPRに分けてよい（人間の判断）。ただし契約のPRには生成した型・Zod schemaを入れ、
    mainへ入ったどの時点でもWebとAPIの互換性を保つ順にする。既存の「同じPRで更新する」規約
    （`docs/architecture.md`・`contracts/README.md`・`docs/code-review/backend/README.md`）を同じ変更で直す。
  - 積み重ねたPRはmerge commitでマージする（既存のPRもmerge commitでマージしている）。
  - Planとタスクファイルは1番目のPRで作り、完了の記録は最後のPRで書く。
  - 定期実行でも、分割・PRごとの機械のレビュー・ガイドの作成まで行う（人間の判断）。4時間の打ち切り、
    許可ルールにないコマンドの拒否、レポートに1件しかPRが載らないことは、下のRisksに書き、scriptの見直しは別のPRで行う。
  - PRごとのLGTMのコミットは、各PR本文の「概要」にあるPRの一覧に書き足す（人間の判断）。中断後の再開で、
    どのPRのレビューが済んだかを判断する記録にする。
  - 分けたPRの途中で止まるときは、ブランチを切り替えずに今いるブランチのPlanへ書き、その記録だけのコミットは
    LGTMの取り消しに当たらないとする（人間の判断）。
  - 人間のレビューはタスク単位で、すべてのPRがLGTMになってから1回。仕様・設計・securityの判断が必要なときは
    待たずに止まって聞く（既存の止まる条件のまま）。

## 6. References and Documents to Update

- 参照: AGENTS.md、上記3 skill、`scripts/claude-quality-gate.mjs`、`scripts/codex-final-check.mjs`。
- 更新: AGENTS.md（Pull Requests・タスクの自動実行）、README.md（Claude Codeでのタスク実行）、上記3 skill、
  `docs/architecture.md`・`contracts/README.md`・`docs/code-review/backend/README.md`・`docs/development/backend.md`（契約・API・Webを分けてよいこと）。
- 新規: `docs/development/pull-requests.md`（分割・積み重ね・マージ・人間のレビューの時機の正本）。

## 7. Proposed Approach

1. `docs/development/pull-requests.md`に、上限・数えないファイル・分け方・積み重ね・マージ手順・
   人間のレビューの時機をまとめる。各skillはここを参照し、規約本文を複製しない。
2. `run-task`: PlanでPRの分け方を決め、PRの順にブランチを積んで実装し、PRを作った後に
   `pr-review-cycle`の手順2〜8をPRごとに回し、最後にタスク全体のガイドを1つ渡す。
3. `pr-review-cycle`: PR作成前にファイル数を数えて分ける手順、前のPRの修正の取り込み、ガイドを
   すべてのPRのLGTM後に1つだけ作ること、人間の指摘への対応を足す。
4. `human-review-artifact`: 複数PRを1ページにまとめる場合のタイトル・マージ順の一覧・PRごとの確認項目。

## 8. Why This Approach

- 20ファイルはユーザーの指定。生成物・lockfileは読む価値が低く、数えると不要な分割が増える。
- 積み重ねにすると各PRのdiffがそのPRの分だけになり、1番目から順に読める。依存しないPRを`main`から
  分けることも許し、無理に直列にしない。
- 人間のレビューをタスク単位にまとめると、途中の設計変更による見直しを避けられ、ガイドも1つで済む。

## 9. Data Flow

アプリのデータフローの変更はない。作業の流れは次のとおり。

```text
Plan（PRの分け方） → PRごとに実装・ブランチを積む → PR作成
→ PRごとに機械のレビュー（前のPRの修正は後ろへmerge） → すべてLGTM
→ タスク全体のガイド1つ → 人間のレビュー → 1番目から順にマージ
```

## 10. Files to Change

- `docs/development/pull-requests.md`（新規）
- `docs/architecture.md`、`contracts/README.md`、`docs/code-review/backend/README.md`、`docs/development/backend.md`（変更）
- `AGENTS.md`、`README.md`、`.claude/skills/run-task/SKILL.md`、`.claude/skills/pr-review-cycle/SKILL.md`、
  `.claude/skills/human-review-artifact/SKILL.md`（変更）
- `docs/implementation-plans/TEMPLATE.md`（変更。「10. Files to Change」にPRごとの分け方の欄）
- 本Plan（新規）

## 11. Libraries / APIs

追加なし。

## 12. Alternatives Considered

- すべてのPRを`main`から独立に作る: 依存する変更（model → API）では後のPRが単独でCIを通らない。不採用。
- 実装後に1つのPRとして作り、レビューの時だけコミット単位で読む: GitHub上でファイル数が減らず、
  レビューのコメントも1つのPRに混ざる。不採用。
- PRごとに人間がレビューする: 途中の設計変更で見直しが二度手間になる。不採用。

## 13. Risks / Things to Watch

- 積み重ねたPRを、baseを付け替えずにマージすると`main`ではなく前のブランチへ入る。マージ手順を
  規約とガイドに書いた。GitHubの「マージ後にheadブランチを自動で削除」を有効にすると自動で付け替わる。
- 前のPRの修正を取り込み忘れると、後ろのPRが古い前提でレビューされる。取り込みを手順に入れた。
- `run-task`の範囲が機械のレビューまで広がるため、1回の実行が長くなる。
- squashでマージすると、後ろのPRのdiffに前のPRの変更が再び現れる。merge commitでマージすると規約に書いた。
- Stop hookはブランチを切り替えると状態が初期化され、今いるブランチしか確かめない。すべてのブランチの
  push状態の確認を`run-task`の手順9に入れた。
- `HEAD:<ブランチ>`のpushで別のPRの変更が混ざりうる。積み重ねたPRでは`<ブランチ>:<ブランチ>`の形にした。
- 定期実行では、PR数 ×（サブエージェント + Codexの最終チェック最大20分 × 往復）で4時間の打ち切りを超えうる。
  打ち切られても、PR本文のLGTMの記録から再開できるようにした。積み重ねの途中（取り込み中、後ろのブランチが未push）で
  打ち切られた場合の後始末は、scriptの見直し（別のPR）で扱う。
- 定期実行（`-p`、`--permission-mode auto`）では確認を出せないため、許可ルールにない`git merge`・`gh pr edit`等が
  拒否されうる。拒否されたら`run-task`の止まる条件に当たる。
- 定期実行のレポート・通知には、分けたPRのうち最後のブランチのPRしか載らない（別のPRで直す）。
- 定期実行で、`origin/main`から作ったばかりの互いに依存しないブランチにいるまま打ち切られると、`task-scheduler.mjs`の
  `untouched`が今いるブランチだけを見て、worktreeを作業なしとして消す（ほかのブランチのコミットは残るが、
  翌日に同じタスクが最初から始まりうる）。scriptの見直し（別のPR）で、同じタスクのすべてのブランチを見るようにする。
- PRコメントは公開repositoryで誰でも書けるため、人間の指摘として扱うのはレビュアーのコメントだけにした（サブエージェントの指摘）。
- `bin/rails db:prepare`は適用済みのmigrationを巻き戻さないため、migrationが違う前のブランチへ戻ると、後ろのPRの
  テーブルが残ったDBで検証してしまう（Codexの指摘）。タスク専用DBを切り替え先の`schema.rb`から作り直す手順にした。
- `DATABASE_URL`があると`FOD_DB_SUFFIX`を付けても既定のDBを指し、`db:drop`で開発データを消しうる（Codexの指摘）。
  消す前に実際の接続先のDB名を確かめる手順にした。
- GitHub上でマージ・baseを付け替えてもローカルの`origin/main`は更新されないため、取り込みの要否を判断する前に
  fetchする（Codexの指摘）。

## 14. Verification

- Markdownと skill の文書だけの変更のため、自動testの対象外。
- 各skillの相互参照・リンク先の見出しアンカー、`scripts/claude-quality-gate.mjs`のブランチ名の正規表現
  （`^(feat|…)/task-\\d{3}(?:-|$)`）が`feat/task-008-1-dot-model`に一致すること、
  `scripts/codex-final-check.mjs`のbaseの正規表現が`origin/feat/task-008-1-dot-model`を受け付けることを確認する。

## 15. Definition of Done

- 規約の正本が1つで、各skillとAGENTS.mdがそれを参照し、本文を複製していない。
- skill同士・規約との手順（分割、push、取り込み、ガイドの時機）が矛盾しない。
- 機械のレビュー（サブエージェント・Codex）でLGTMになる。

## 16. Completion Record

- 状態: 実施中
- 実装差異: なし
- 検証結果: `taskBranchPattern`が`feat/task-008-1-dot-model`に一致し、codex-final-checkのbase検査が
  `origin/feat/task-008-1-dot-model`を受け付けることをnodeで確認した。`pnpm lint:naming`は成功。
  `docs/development/pull-requests.md`の見出しと、skillからのアンカーリンクの対応を目視で確認した。
- 関連: PR #50
