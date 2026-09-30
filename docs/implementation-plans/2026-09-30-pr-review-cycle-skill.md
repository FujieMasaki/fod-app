# PR Review Cycle Skill Implementation Plan

## 1. Status

完了（2026-09-30）。**このPlanは実装前ではなく、実装コミット後にCodexレビューの指摘を受けて
事後的に作成した。**AGENTS.mdへの1行追記とskillファイル追加という小さな変更だと判断してPlan
作成を省略したが、複数ファイルにまたがるワークフロー変更であり、レビューで規約違反と指摘された。
次回以降、`.claude/skills/` への新規skill追加でも実装前にPlanを作成する。

## 2. Goal

「PR作成して」と依頼されたときに、PR作成→セルフレビュー→codex CLIレビュー→指摘修正の
ループをLGTMが出るまで自動で回し、同種の指摘の再発防止まで行う運用を、確実に毎回同じ手順で
実行できるようにする。

## 3. Background

- これまでPR作成後のレビュー運用（セルフレビュー→codexへレビュー依頼→修正）は、都度チャットで
  口頭指示する必要があり、指示を忘れると同じ手順を言い直すことになっていた。
- Claude Codeのメモリ（記憶）機能は次回セッションでの参照確度を保証しない
  （`update-config` skillの説明にある通り、確実な自動実行にはメモリではなく、明示的に
  参照される手順書が必要）。
- このプロジェクトには既に`run-task` skillという「タスクIDを渡すと決まった手順で自動実行する」
  前例があり、同じ形でPRレビューのループも手順化できると判断した。

## 4. Current State

- `AGENTS.md`の「Pull Requests」セクションには、PR作成時に確認せず進める規約と
  タイトル・本文の形式は既にあったが、PR作成後のレビューループについての規定はなかった。
- `docs/tasks`向けの`run-task` skillが、着手可否判定からPR作成までを手順化する前例として
  既に存在する（`.claude/skills/run-task/SKILL.md`）。
- `codex` CLIは既にこのマシンにインストール済みで、このリポジトリの
  `.claude/settings.local.json`には`Bash(codex review *)`の許可設定が既にあり、
  過去のPR（例: product-visionのPlanの記述）でも`codex review`によるレビューが
  実際に使われていた。

## 5. Scope and Non-goals

- 今回の対象: 「PR作成して」という依頼をトリガーに、PR作成後のセルフレビュー・
  codexレビュー・修正・再発防止までを1つのskillとして定義し、AGENTS.mdから参照させること。
- 今回の対象外: PR作成前の実装・実装計画そのもの（既存のAGENTS.md本文・`run-task` skillの
  範囲）。codex CLI自体のインストール・認証設定（既に完了済みの前提とする）。
- 未決定事項: なし。5回のループ上限、仕組み化の粒度は本Planで確定する。

## 6. References and Documents to Update

- 参照: `AGENTS.md`の「Pull Requests」「Code Review」セクション、
  `.github/pull_request_template.md`、既存の`.claude/skills/run-task/SKILL.md`。
- 更新: `AGENTS.md`（1行追記）、新規`.claude/skills/pr-review-cycle/SKILL.md`。

## 7. Proposed Approach

1. `.claude/skills/pr-review-cycle/SKILL.md`を新規作成し、次の手順を定義する。
   PR作成 → セルフレビュー → `codex review --base <branch>` → 指摘があれば修正して
   コミット・push → 再セルフレビュー → 再度codexレビュー、をLGTMまで繰り返す。
2. LGTM後、同種の指摘を防ぐための仕組み化（レビュー観点・lint・実装規約への反映）を行い、
   その変更自体も同じレビューループを1周させてからPRを完了とする。
3. レビュー→修正ループが5回続いても収束しない場合や、codex自体が実行できない場合は
   自動実行を止め、チャットで人間に判断を仰ぐ。
4. `AGENTS.md`の「Pull Requests」セクションに、「PR作成して」で本skillを参照する旨を
   1行追記し、どのセッションでも確実に同じ手順が起動するようにする。

## 8. Why This Approach

- 既存の`run-task` skillと同じ「skillファイル＋AGENTS.mdからの参照」という構成にすることで、
  このリポジトリの既存の自動実行の仕組みと一貫性を保てる。
- メモリだけに留めず、リポジトリにコミットされたskillにすることで、チームメンバーや
  別セッションから見ても同じ手順が確認・修正できる。
- ループ上限（5回）と、codex実行失敗時の停止条件を明示することで、無限ループや
  握りつぶしを防げる。

## 9. Data Flow

このskillはUIやAPIのデータフローを持たない、Claude Codeのワークフロー定義そのものである。

```text
ユーザーの「PR作成して」という発言
↓
AGENTS.mdの該当行を経由してpr-review-cycle skillが読み込まれる
↓
Bashで gh pr create / codex review を実行
↓
指摘があれば修正コミット・push（ループ）
↓
LGTM・仕組み化後、PRのURLを報告
```

## 10. Files to Change

- `.claude/skills/pr-review-cycle/SKILL.md`（新規）: このskillの手順・止まる条件を定義する。
- `AGENTS.md`（変更）: 「Pull Requests」セクションから本skillを参照する1行を追記する。
- 本Implementation Plan（新規、事後作成）: 変更理由と検証方法を記録する。

## 11. Libraries / APIs

- `codex` CLI（`codex review`）: 非対話でのコードレビュー依頼に使う。既にこのマシンに
  インストール済みで、このリポジトリでの利用実績もある。新しい依存の追加ではない。
- `gh` CLI: 既存のPR作成規約と同様、PR作成・確認に使う。

## 12. Alternatives Considered

- メモリ（Claude Codeの記憶機能）だけに手順を残す案: セッションをまたいだ実行確度が
  保証されず、リポジトリにも残らないため不採用。
- AGENTS.mdの本文に手順をすべて書き込む案: 既に長いAGENTS.mdがさらに肥大化し、
  `run-task`のような他の自動実行手順との一貫性も失われるため不採用。

## 13. Risks / Things to Watch

- codex CLIの認証切れ・ネットワークエラーで`codex review`自体が失敗するケース
  （止まる条件に追加済み）。
- レビュー→修正のコミットをpushし忘れ、PRのURLが古いコミットを指したまま完了報告する
  リスク（手順に明示的なpushの指示を追加済み）。
- 仕組み化のコミットがレビューを経ずにPRへ残るリスク（仕組み化もレビューループに含めるよう
  修正済み）。

## 14. Verification

### Manual

- 本PR自体を実運用の初回ケースとして、`pr-review-cycle` skillの手順どおりに
  PR作成・セルフレビュー・codexレビュー・指摘修正・再レビューを実施した。

### Automated

Markdownのみの変更のため、自動テストは対象外。pre-commit / pre-push hookの通過のみ確認する。

## 15. Definition of Done

- 「PR作成して」でこのskillが確実に参照される（AGENTS.mdからの参照がある）。
- レビュー→修正ループが5回で止まる安全弁がある。
- codex実行自体の失敗も止まる条件に含まれている。
- 仕組み化の変更もレビューループを経てからPRに残る。
- 実装内容を人間が説明できる。

## 16. Completion Record

- 状態: 2026-09-30 完了。
- 実装差異: 当初はPlanなしで実装し、Codexレビューを2回受けて次の指摘を反映した。
  1周目: P1 修正コミットのpushし忘れ、P2 カスタム観点使用時の`--base`欠落、
  P2 仕組み化コミットが未レビュー、P2 本Planの欠落。
  2周目: P1 コミット前のpending changes未確認、P1 セルフレビュー時点の修正コミットの
  push漏れ、P2 upstream未設定時の`git log @{u}..HEAD`失敗。
  3周目: P2 `gh pr create`にレビューと同じ`--base`を渡していない、P2 `main`ブランチ上での
  実行を弾いていない、P2 完了確認が`git status`のcleanさを見ていない。
  4周目: P2 依頼と無関係な変更まで「先にコミット」してしまう、P2 レビュー修正後にRails等の
  pre-push対象外の検証を再実行していない、P2 ベース判定が`main`固定でreleaseブランチ等を
  想定していない。
  5周目: P2 stashした無関係な変更を復元する手順がない、P2 既にコミット済みの無関係な変更を
  検出できない、P2 ローカルのベースブランチが古いままレビューするとPRの対象とずれる。
  ここまでで自動ループの上限（5回）に達したため一旦停止し、ユーザーに方針を確認した。
  ユーザーの指示（自動でstashせず無関係な変更は事前確認する、コード修正前に必ずベースを
  最新化してからブランチを切る）に沿って手順1を書き換え、6周目のレビューへ進めた。
  6周目: P2 `git log <base>...HEAD`の三点リーダーがbase側の新規コミットまで拾ってしまう、
  P2 ローカルのbaseブランチ自体が先行しているケースを検出できない、P2 `git branch`が
  コミット済みの許可リストにないため自動実行が止まりうる。対応として、ローカルの
  `<base>`を経由せず常に`origin/<base>`を基準にする設計へ変更し（`git log`は`..`の
  片方向に修正）、コミット済み`.claude/settings.json`に`codex review`の許可を追加した。
  7周目: P2 base上に未pushのローカルコミットがあると、`origin/<base>`から新しい
  ブランチを作ることでそのコミットを取りこぼす、P2 最初のpush（PR作成時点）では
  Railsのrspec/rubocop/brakeman等、pre-push hook対象外の検証が一度も走らない。
  対応として、base上に未pushコミットがある場合はHEADからブランチを作るよう分岐を
  追加し、最初のコミット前にも変更領域に応じた検証を行うよう明記した。
  ここまでで自動ループの上限（5回）を人間の判断で2回延長している。指摘が徐々に
  狭いエッジケースになってきており、収束が見えにくいため、この時点でユーザーに
  続行方針を再確認する。
- 検証結果: pre-commit / pre-push hook通過。`codex review`でのレビューを7回実施し、
  いずれの指摘も同じPR内のコミットで反映した。
- 関連: PR #44（<https://github.com/FujieMasaki/fod-app/pull/44>）。
