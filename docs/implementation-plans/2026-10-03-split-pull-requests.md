# Implementation Plan: PRの分割とタスク単位の人間のレビュー

## 1. Status

実施中（人間のレビューで、分け方を統合ブランチの形へ変えることになった。機械のレビューをやり直す）

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
  - 分けるときは、統合ブランチ（`<type>/task-NNN-<slug>-integration`）と`main`へのメインのPR（draft）を先に作り、サブのPRは
    統合ブランチへ向けて作る。タスクの変更は最後にメインのPRで一度に`main`へ入る（人間の判断。2026-10-03の
    人間のレビューで、サブのPRを1つずつ`main`へ入れる形から変更）。
  - サブのPRは、依存するものを積み重ね（stacked PR）、前のPRの修正は`git merge`で後ろへ取り込む（rebase・force pushは
    既存の規則で禁止のため）。AIはサブのPRを人間のマージを待たずにすべて作る（人間の判断）。
  - 人間は、すべてのサブのPRがLGTMになってから、統合ブランチへマージする前にレビューし、サブのPRを統合ブランチへ、
    最後にメインのPRを`main`へマージする。AIはどのPRもマージしない（人間の判断。hookの変更は不要）。
  - メインのPRは着手時にdraftで作り、本文のサブのPRの一覧を、LGTMの記録と進み具合の正本にする（人間の判断）。
  - 統合ブランチの名前は`<type>/task-NNN-<slug>-integration`にし、作業を始めた番号なしのブランチと分ける（人間の判断）。
    番号なしのブランチがpush済みでも、force pushせずに統合ブランチを作れるようにするため。push済みの番号なしの
    ブランチは、名前を変えずに1番目のサブのPRとして使う。
  - Codexの最終チェックが5回の上限に達した（統合ブランチの形にした後も端のケースの指摘が続いた）ため、人間の判断で
    1回だけ例外として6回目を実行する。そこで指摘が出たら止まる。
  - 新しい手順で使う`git merge`・`git branch -m`・`git branch -D`・`gh pr edit`・`gh api`・`git cherry-pick`・`git reset --soft`・`bin/rails db:drop`・`bin/rails runner`・
    `git checkout <コミット> -- <path>`は許可ルールにないため、実行のたびに確認が出る。許可ルール（`.claude/settings.json`）への追加は人間が行い、このPRでは変えない。
  - 契約・API・Webは別のPRに分けてよい（人間の判断）。ただし契約のPRには生成した型・Zod schemaを入れる。
    統合ブランチに集めるので`main`へは一度に入る。expand・migrate・contractの段階は、同じ統合ブランチにまとめない。既存の「同じPRで更新する」規約
    （`docs/architecture.md`・`contracts/README.md`・`docs/code-review/backend/README.md`）を同じ変更で直す。
  - サブのPRはmerge commitで統合ブランチへマージする（squashすると後ろのPRのdiffに前の変更が再び現れる）。
  - Planとタスクファイルは1番目のPRで作り、完了の記録は最後のPRで書く。
  - 定期実行でも、分割・PRごとの機械のレビュー・ガイドの作成まで行う（人間の判断）。4時間の打ち切り、
    許可ルールにないコマンドの拒否、レポートに1件しかPRが載らないことは、下のRisksに書き、scriptの見直しは別のPRで行う。
  - PRごとのLGTMのコミットは、メインのPRの本文の一覧に書き足す（人間の判断。当初は各PR本文の一覧だったが、
    メインのPRができたので1か所にまとめた）。中断後の再開で、どのPRのレビューが済んだかを判断する記録にする。
  - 分けたPRの途中で止まるときは、ブランチを切り替えずに今いるブランチのPlanへ書き、その記録だけのコミットは
    LGTMの取り消しに当たらないとする（人間の判断）。
  - 人間のレビューはタスク単位で、すべてのPRがLGTMになってから1回。仕様・設計・securityの判断が必要なときは
    待たずに止まって聞く（既存の止まる条件のまま）。

## 6. References and Documents to Update

- 参照: AGENTS.md、上記3 skill、`scripts/claude-quality-gate.mjs`、`scripts/codex-final-check.mjs`。
- 更新: AGENTS.md（Pull Requests・タスクの自動実行）、README.md（Claude Codeでのタスク実行）、上記3 skill、
  `docs/architecture.md`・`contracts/README.md`・`docs/code-review/backend/README.md`・`docs/development/backend.md`（契約・API・Webを分けてよいこと）、`docs/implementation-plans/TEMPLATE.md`
  （「10. Files to Change」にPRごとの分け方の欄）。
- 新規: `docs/development/pull-requests.md`（分割・統合ブランチとサブのPR・マージ・人間のレビューの時機の正本）。

## 7. Proposed Approach

1. `docs/development/pull-requests.md`に、上限・数えないファイル・分け方・統合ブランチとサブのPR・マージ手順・
   人間のレビューの時機をまとめる。各skillはここを参照し、規約本文を複製しない。
2. `run-task`: PlanでPRの分け方を決め、PRの順にブランチを積んで実装し、PRを作った後に
   `pr-review-cycle`の手順2〜8をPRごとに回し、最後にタスク全体のガイドを1つ渡す。
3. `pr-review-cycle`: PR作成前にファイル数を数えて分ける手順、前のPRの修正の取り込み、ガイドを
   すべてのPRのLGTM後に1つだけ作ること、人間の指摘への対応を足す。
4. `human-review-artifact`: 複数PRを1ページにまとめる場合のタイトル・マージ順の一覧・PRごとの確認項目。

## 8. Why This Approach

- 20ファイルはユーザーの指定。生成物・lockfileは読む価値が低く、数えると不要な分割が増える。
- 積み重ねにすると各PRのdiffがそのPRの分だけになり、1番目から順に読める。依存しないPRを統合ブランチから
  分けることも許し、無理に直列にしない。
- 統合ブランチに集めると、タスクの変更が`main`へ一度に入る。`main`のどの時点でもWebとAPIの互換性を保つ順番の
  工夫、`main`へのbaseの付け替え、PRごとの「mainを取り込むか」の判断が要らなくなり、最後に統合した全体でCIが走る。
- 人間のレビューをタスク単位にまとめると、途中の設計変更による見直しを避けられ、ガイドも1つで済む。

## 9. Data Flow

アプリのデータフローの変更はない。作業の流れは次のとおり。

```text
Plan（PRの分け方） → 統合ブランチとメインのPR（draft） → サブのPRごとに実装・ブランチを積む → サブのPRをすべて作成
→ サブのPRごとに機械のレビュー（前のPRの修正は後ろへmerge） → すべてLGTM
→ タスク全体のガイド1つ → 人間のレビュー → サブのPRを統合ブランチへ順にマージ → メインのPRをmainへマージ
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
- サブのPRを1つずつ`main`へマージする（当初の案）: `main`へ途中の状態が入るため、互換性を保つ順番の工夫と、
  マージのたびのbaseの付け替え・mainの取り込みが要る。人間のレビューで統合ブランチの形に変更。
- AIがLGTMのサブのPRを統合ブランチへマージする: 積み重ねが不要になるが、人間がマージ前にレビューできず、
  hookの変更も要る。人間の判断で不採用。

## 13. Risks / Things to Watch

- サブのPRを、baseを付け替えずにマージすると統合ブランチではなく前のブランチへ入る。マージ手順を
  規約とガイドに書いた。GitHubの「マージ後にheadブランチを自動で削除」を有効にすると自動で付け替わる。
- メインのPRは20ファイルを超える。行ごとには読まない前提で、上限の例外とした。その分、統合ブランチに
  レビューを経ない変更が入らないよう、AIが直接pushしてよいものを空のコミットとコンフリクトのない`main`の取り込みに
  限り、`main`へマージする前に`git log --first-parent`で中身を確かめる手順を人間のマージ手順に入れた
  （サブエージェントの指摘）。`main`の取り込みでコンフリクトが出たら、AIは解消せずに止まる。
- 許可ルールを足すまで、定期実行で分けるタスクは、許可ルールにない`git branch -m`・`git merge`・`gh pr edit`等で
  止まりうる（拒否されたら止まる条件）。定期実行で分割まで進めるには、許可ルールの追加が要る。
- 前のPRの修正を取り込み忘れると、後ろのPRが古い前提でレビューされる。取り込みを手順に入れた。
- `run-task`の範囲が機械のレビューまで広がるため、1回の実行が長くなる。
- サブのPRをsquashでマージすると、後ろのPRのdiffに前のPRの変更が再び現れる。merge commitでマージすると規約に書いた。
- Stop hookはブランチを切り替えると状態が初期化され、今いるブランチしか確かめない。すべてのブランチの
  push状態の確認を`run-task`の手順9に入れた。
- `HEAD:<ブランチ>`のpushで別のPRの変更が混ざりうる。積み重ねたPRでは`<ブランチ>:<ブランチ>`の形にした。
- 定期実行では、PR数 ×（サブエージェント + Codexの最終チェック最大20分 × 往復）で4時間の打ち切りを超えうる。
  打ち切られても、PR本文のLGTMの記録から再開できるようにした。積み重ねの途中（取り込み中、後ろのブランチが未push）で
  打ち切られた場合の後始末は、scriptの見直し（別のPR）で扱う。
- 定期実行（`-p`、`--permission-mode auto`）では確認を出せないため、許可ルールにない`git merge`・`gh pr edit`等が
  拒否されうる。拒否されたら`run-task`の止まる条件に当たる。
- 定期実行のレポート・通知には、最後にいたブランチのPRしか載らない。`run-task`は最後に統合ブランチへ切り替えて
  終わるので、メインのPRが載る（サブのPRの一覧はその本文にある）。途中で打ち切られた場合は、別のPRで直す。
- 定期実行で、統合ブランチから作ったばかりのブランチにいるまま打ち切られても、そのブランチはupstreamが
  `origin/<統合ブランチ>`になり（gitの既定のbranch.autoSetupMerge）、空のコミットも`origin/main`にないため、
  `task-scheduler.mjs`の`untouched`には当たらず、worktreeは残る（サブエージェントの指摘で、当初の見立てを訂正）。
- `main`の取り込みは、ローカルの統合ブランチが古いままだとpushが拒否され、guardの案内どおり`--force-with-lease`を
  使うとサブのPRのマージを消しうる。リモートへ`--ff-only`で揃えてから取り込み、拒否されたらforce pushせずに止まる
  手順にした（サブエージェントの指摘）。
- PRコメントは公開repositoryで誰でも書けるため、人間の指摘として扱うのはレビュアーのコメントだけにした（サブエージェントの指摘）。
- `bin/rails db:prepare`は適用済みのmigrationを巻き戻さないため、migrationが違う前のブランチへ戻ると、後ろのPRの
  テーブルが残ったDBで検証してしまう（Codexの指摘）。タスク専用DBを切り替え先の`schema.rb`から作り直す手順にした。
- `DATABASE_URL`があると`FOD_DB_SUFFIX`を付けても既定のDBを指し、`db:drop`で開発データを消しうる（Codexの指摘）。
  消す前に実際の接続先のDB名を確かめる手順にした。確認とdropは別々のコマンドで、手順を飛ばされると防げないため、
  DB名の検査とdropを1つのscriptにまとめることを、scriptの見直し（別のPR）で検討する。
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

- 状態: 実施中（`de980db`でサブエージェント・CodexともLGTMになった後、人間のレビューで統合ブランチの形へ変更）
- 実装差異: 当初の「サブのPRを1つずつ`main`へマージする」形から、統合ブランチとメインのPRの形へ変えた。
- 検証結果: `taskBranchPattern`が`feat/task-008-1-dot-model`に一致し、codex-final-checkのbase検査が
  `origin/feat/task-008-1-dot-model`を受け付けることをnodeで確認した。`pnpm lint:naming`は成功。
  `docs/development/pull-requests.md`の見出しと、skillからのアンカーリンクの対応を目視で確認した。
  DBの接続先を確かめる`bin/rails runner 'puts ActiveRecord::Base.connection_db_config.database'`が、
  `FOD_DB_SUFFIX=_task_999`で`…_development_task_999`・`…_test_task_999`を、`DATABASE_URL`を足すと既定の
  `focus_on_dot_api_development`を出すことを確かめた（接続・削除はしていない）。
  `git show --remerge-diff --format=`が、競合のないmerge commit（`fc8907c`）では空、コンフリクトを解消した
  merge commit（`71311d2`）では解消の内容を出すことを確かめた。
- 対応しなかった任意改善: なし（`de980db`の時点で残した4件は、統合ブランチの形への変更とその後のレビューで対応した。
  AIが所有者のtokenで書いたPRコメントを人間の指摘と取り違えないよう、AIはPRコメントを書かず、記録はPR本文・Plan・
  会話に残すと規約に書いた）。
- 関連: PR #50
