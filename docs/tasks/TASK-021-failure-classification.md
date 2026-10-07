# TASK-021: AIの失敗を3分類し、直す場所を決める

| 項目 | 内容 |
| --- | --- |
| ID | TASK-021 |
| タスク名 | AIの失敗を3分類し、直す場所を決める |
| 対象領域 | 開発基盤 |
| 作業区分 | 設計判断 |
| 優先度 | 開発基盤 |
| 状態 | Todo |

## 目的と作業範囲

`pr-review-cycle`の手順8「再発防止の仕組み化」は、どこを直すかを都度判断している。指摘・ループの非収束・人間のレビューでの差し戻しを、次の3つに分類してから対処する。

| 分類 | 意味 | 直す場所の例 |
| --- | --- | --- |
| コンテキスト不足 | 知るべき仕様・規約・判断基準が渡っていない | docs、AGENTS.md、skill、`personal-conventions.md`（下記の制限あり） |
| 権限不足 | 必要な操作・確認ができない、または止めるべき操作が通る | `.claude/settings.json`、`claude-guard`、hook、CI（下記の制限あり） |
| 性能不足 | 情報も権限もあるのにモデルが正しくできない | 機械のチェックへ移す、タスクを小さくする、人間が担当する |

権限不足のうち、許可を広げる・guardやhookを緩める方向の対処は人間が判断する。AIは止まる条件として扱い、提案をPlanに書くだけにする（自動のループが自分の許可を広げられないようにするため）。止めるべき操作が通る場合に制限を強める方向の対処は、AIが行ってよい。

検査・許可・reviewerの定義、つまりlint・test・型の設定と閾値、hook、CI、レビュー指針、自動実行の判定、AIへの指示を変えるファイルを変えたPRでは、変えたファイルと、検査が緩んでいないことの確認をPRの「確認すること」に必ず挙げる。これらの変更はworktreeの中ですぐ効き、同じセッションのその後の検査とレビューにも使われるため、最後に止められるのはマージ前の人間のレビューだけである。

主なファイルの例（網羅ではない）: `.claude/settings.json`、`.claude/agents/`、`.claude/skills/`、`scripts/claude-*.mjs`、`scripts/claude-hook.sh`、`scripts/codex-final-check.mjs`、`scripts/ci-gate.mjs`、`scripts/ci-changes.mjs`、`scripts/check-*.mjs`、`scripts/task-status.mjs`、`scripts/task-scheduler.mjs`、`scripts/task-scheduler.sh`、`scripts/install-task-scheduler.sh`、`.github/pull_request_template.md`、`eslint.config.mjs`、`apps/api/.rubocop.yml`、`lefthook.yml`、`package.json`のscripts、`.github/workflows/`、`docs/code-review/`、`AGENTS.md`。

`personal-conventions.md`はリポジトリの外（個人の環境）にあり、PRのレビューを経ない。リポジトリの外のファイルについて、AIはPlanに変更の提案を書くだけにし、反映は人間が行う。

分類と対処を記録し、同じ分類が繰り返す箇所を後から見つけられるようにする。記録の形式と置き場所は、既存の再発防止の記録と重複しない形で着手時に決める。修正前のsecurityの指摘は、具体的な場所と再現方法を記録に含めない。

## 確認可能な完了条件

- [ ] `pr-review-cycle`の手順8と「止まる条件」に、3分類と分類ごとの直す場所が書かれている。
- [ ] 権限を広げる方向の対処は人間の判断を経る（AIは止まって提案だけを書く）手順になっており、制限を強める方向と分けて書かれている。
- [ ] 検査・許可・reviewerの定義を変えたPRで、変えたファイルを「確認すること」に挙げる手順が`pr-review-cycle`に書かれている（TASK-019で先に入っていれば、それに合っているか確かめる）。
- [ ] リポジトリの外のファイルはAIが変えず、Planに提案を書くだけの手順になっている。
- [ ] `run-task`で止まった場合と、人間のレビューで指摘が来た場合にも同じ分類を使う手順になっている。
- [ ] 分類と対処の記録の形式・置き場所が決まり、過去の再発防止の事例を少なくとも3件分類して記録している。
- [ ] 記録が個人データ・秘密情報を含まない形になっている。

## 依存するタスクID

なし。

## 根拠となる仕様書と見出し

- [pr-review-cycle](../../.claude/skills/pr-review-cycle/SKILL.md) — 「8. 再発防止の仕組み化」「止まる条件」「人間のレビューで指摘が来たとき」
- [run-task](../../.claude/skills/run-task/SKILL.md)
- 参考: [mizchi「AIコーディングのループと形式手法」](https://zenn.dev/mizchi/articles/ai-coding-loop-formal) — 「考える順番」

## 必要な検証

- 過去のPRの指摘を3件以上、手順どおりに分類して直す場所を決められること（机上で確認し、Planに記録する）。

## 関連Implementation Plan

未作成。着手時にAGENTS.mdの規約に従って作成し、ここへリンクを追記する。
