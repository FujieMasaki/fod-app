# Implementation Plan: 実行可能なタスクを毎朝4時に並列で着手する

## 1. Status

実施中（2026-10-02）。実装と自動検証は完了。launchdへの登録はマージ後に行う。

## 2. Goal

毎朝4時に、`/run-task`で自動実行できるタスクをすべて洗い出し、他のセッションが着手していないものを
並列で起動する。各セッションはPR作成（人間の確認待ち）まで進む。着手できるタスクがない日は起動せず、
残っているタスクと止まっている理由を通知する。

## 3. Background

- [実装タスクを自動で進める仕組み](2026-09-26-autonomous-task-runner.md)では「起動は手動とし、
  定期実行はしない」とした。PR確認を人間が並列で行う前提に変わったため、起動を定期化する（2026-10-02）。
- 決定事項（2026-10-02、人間の回答）:
  - 実行場所はローカルのMac。スリープ防止アプリで常時起動しているため、launchdで4時に起動する。
  - 1回で実行可能なタスクを並列で進める。各タスクはPR作成まで進め、人間が並列でPRを確認する。
  - 実行可能なタスクがない日は通知だけにし、残っているタスクを示す。
- ボトルネックのタスク（未完了で後続が待っているもの）が終わるまで後続を実装しない条件は、
  `task-status.mjs`の判定（依存先がすべてDone）で既に満たす。定期実行でもこの判定を変えない。

## 4. Current State

- `scripts/task-status.mjs`が1タスクずつ自動実行の可否を判定する。全タスクを一覧する手段はない。
- `/run-task`は`.claude/worktrees/task-NNN`にworktreeを作り、`<type>/task-NNN-<slug>`ブランチで作業する。
  タスクファイルの状態（In progress）はブランチ側にしか書かれず、PRがマージされるまでmainから見えない。
- 作業済みのリモートブランチはマージ後も残っているため、ブランチの有無では着手中かを判定できない。
- RSpecのテストDBは`focus_on_dot_api_test`の1つで、複数worktreeから同時に実行すると競合する。
- ルートのcheckoutは人間の作業で任意のブランチにいるため、そこにあるSkill・scriptはmainより古いことがある。
- 品質ゲートの状態はworktreeごとの`git-dir`に保存され、並列実行で競合しない。
- 2026-10-02のorigin/mainでは、TASK-005がDoneになりTASK-006が実行可能。TASK-003（設計判断）は
  In progressで、生成・録音系の実装タスクを止めている。

## 5. Scope and Non-goals

### 今回の対象

- 全タスクの判定、着手済みの判定、起動対象の決定、残りタスクの通知文を作る`scripts/task-scheduler.mjs`。
- launchdから起動され、origin/mainの最新のscriptで実行するための起動script。
- launchdへの登録・解除script。
- 並列実行のためのテストDB分離と、`/run-task`の作業場所の手順の更新。

### 今回の対象外

- 設計判断・API契約の自動化。従来どおり人間と対話で進める。
- PRのマージ、Done判定の自動化。
- クラウド実行。ローカルのPostgreSQL・rbenv・hookに依存するため扱わない。

## 6. References and Documents to Update

- 参照: [docs/tasks/README.md](../tasks/README.md)、[run-task Skill](../../.claude/skills/run-task/SKILL.md)、
  [autonomous-task-runner Plan](2026-09-26-autonomous-task-runner.md)、[architecture.md](../architecture.md)。
- 更新: `docs/tasks/README.md`の運用ルール、`README.md`のClaude Codeでのタスク実行、
  `.claude/skills/run-task/SKILL.md`の作業場所の手順、`docs/architecture.md`のroot管理対象。

## 7. Proposed Approach

1. **全タスクの判定**: `docs/tasks/TASK-*.md`をすべて`evaluateTask`で判定する。
2. **着手済みの判定**: 次のどちらかがあるタスクを着手済みとして除外する。
   - `.claude/worktrees/task-NNN`（`/run-task`と定期実行が作る作業場所）がある。
   - head branchが`task-NNN`を含むopen PRがある。
   - 加えて、mainで`In progress`のタスクは除外する（作業中か、人間の確認待ちのため）。
3. **起動順**: 実行可能なタスクを、未完了の後続タスク数（推移的）が多い順に並べ、上限
   （既定3、`FOD_TASK_MAX_PARALLEL`で変更）まで起動する。
4. **起動**: タスクごとに`git worktree add --detach .claude/worktrees/task-NNN origin/main`で作業場所を
   確保する。worktreeの作成は既存パスで失敗するため、作成できたことを着手の確保とする。
   そのworktreeで`claude -p "/run-task TASK-NNN" --permission-mode auto`を起動する。
   `git`の同時実行によるlock競合を避けるため、起動は30秒ずつずらす。
5. **テストDBの分離**: `database.yml`のtest DB名に`TEST_ENV_NUMBER`を付ける（parallel_testsと同じ慣例）。
   定期実行は`TEST_ENV_NUMBER=_task_NNN`を渡し、`/run-task`はapiを変える場合にtest DBを準備する。
6. **通知**: 全セッションの終了後、タスクごとの結果（PR URL、止まった理由）をレポートに書き、
   macOSの通知を出す。起動対象がない日は、残っているタスクと理由、最初に解消すべきボトルネックを通知する。
7. **最新のscriptで動かす**: launchdは`origin/main`の起動scriptを`git show`で取り出して実行し、
   起動scriptは専用の`.claude/worktrees/scheduler`をorigin/mainへdetachして、そこからNode scriptを動かす。

## 8. Why This Approach

- 判定は既存の`evaluateTask`を再利用し、自動実行の条件を1か所に保つ。
- 着手済みの印を新しく作らず、`/run-task`が元々作るworktreeとPRを使う。worktreeは作成時に既存パスで
  失敗するため、追加の仕組みなしで重複起動を防げる。
- `/run-task`の手順はそのまま使い、定期実行は起動・作業場所の確保・通知だけを担う。

## 9. Data Flow

```text
launchd（毎日4:00）
↓ git fetch → origin/mainの起動scriptを実行
scheduler worktree（origin/mainにdetach）
↓ node scripts/task-scheduler.mjs run
docs/tasks（origin/main） + .claude/worktrees + open PR
↓ 起動対象を決定
task-NNN worktree × N → claude -p "/run-task TASK-NNN"（並列）
↓
PR作成 / 停止理由
↓
~/Library/Logs/focus-on-dot/<日付>/report.md + macOS通知
```

## 10. Files to Change

- 新規 `scripts/task-scheduler.mjs`: 判定・起動・通知。純粋関数をexportしてtestする。
- 新規 `scripts/task-scheduler.test.mjs`: 着手済み判定、起動順、通知文のtest。
- 新規 `scripts/task-scheduler.sh`: launchdから実行する起動script。
- 新規 `scripts/install-task-scheduler.sh`: launchdへの登録・解除。
- 変更 `apps/api/config/database.yml`: test DB名に`TEST_ENV_NUMBER`を付ける。
- 変更 `.claude/skills/run-task/SKILL.md`: detachされたworktreeから始める場合とtest DBの準備。
- 変更 `docs/tasks/README.md`、`README.md`、`docs/architecture.md`。

## 11. Libraries / APIs

- launchd（`StartCalendarInterval`）: macOS標準の定期実行。ログイン中のユーザーの権限で動き、
  Claude Codeの認証情報（Keychain）を使える。
- `claude -p --permission-mode auto --output-format json`: 無人で`/run-task`を実行し、結果を取得する。
- `osascript`の`display notification`: 追加のdependencyなしでmacOS通知を出す。
- 新しいnpm / gem dependencyは追加しない。

## 12. Alternatives Considered

- **クラウドのroutine**: Macの状態に依存しないが、Ruby・PostgreSQL・hookの環境構築が別途必要。
  人間の回答でローカル実行に決めた。
- **リモートブランチの有無で着手済みを判定**: マージ済みのブランチが残るため誤判定する。
- **タスクファイルをIn progressにしてmainへpush**: mainへのpushはhookで禁止しており、採用しない。

## 13. Risks / Things to Watch

- 異常終了したセッションのworktreeが残ると、そのタスクは着手済みのまま再起動されない。
  通知とレポートに「着手済み（worktree …）」として出し、PRがなければ人間が確認して削除する。
- 並列数だけAPI利用量とCPU負荷が増える。上限は環境変数で調整する。
- タスクごとのtest DBが残る。不要になったら`dropdb`で削除する。
- 初回の通知はmacOSの許可が必要な場合がある。

## 14. Verification

### Automated

- `pnpm test:scripts`で着手済み判定・起動順・通知文のtestを実行する。

### Manual

- `node scripts/task-scheduler.mjs plan --root <repo>`で、現在のタスクに対する起動対象と通知文を確認する
  （ローカルにtask-006のworktreeがあるため、現状は起動0件の想定）。
- launchdへの登録はPRマージ後に行う（起動scriptをorigin/mainから取り出すため）。

## 15. Definition of Done

- 実行可能なタスクだけが、着手済みを除いて並列で起動される。
- 実行可能なタスクがない日は、残りタスクと理由が通知される。
- lint / testが通る。

## 16. Completion Record

- 状態: 2026-10-02 実装完了、launchd登録はマージ後。
- 実装差異: なし。
- 検証結果:
  - `pnpm test:scripts`: 156件成功（`task-scheduler.test.mjs`の7件を含む）。`pnpm lint`: 成功。
  - `node scripts/task-scheduler.mjs plan --root <repo>`: 起動0件。origin/mainではTASK-005がDoneで
    TASK-006は実行可能だが、ローカルに`.claude/worktrees/task-006`（PR未作成）があるため着手済みとして
    除外された。ボトルネックとしてTASK-006（後続10件）、TASK-003（後続8件）が出た。
  - `TEST_ENV_NUMBER=_probe`で`db:prepare`とRSpecを実行し、`focus_on_dot_api_test_probe`で192件成功。
    削除後、既定のtest DBでも192件成功。
  - 未実施: `run`モードでの実際のセッション起動と、launchdからの起動・通知。マージ後に登録して確認する。
- 関連: [自動実行の仕組み](2026-09-26-autonomous-task-runner.md)。
