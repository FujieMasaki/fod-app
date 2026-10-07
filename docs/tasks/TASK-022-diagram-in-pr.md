# TASK-022: 主要な図をPR本文に残す

| 項目 | 内容 |
| --- | --- |
| ID | TASK-022 |
| タスク名 | 主要な図をPR本文に残す |
| 対象領域 | 開発基盤 |
| 作業区分 | 実装 |
| 優先度 | 開発基盤 |
| 状態 | Todo |

## 目的と作業範囲

人間のレビュー用ガイドはArtifactとして別に作っており、PRの履歴からは図と説明を辿れない。データフローや状態遷移が変わるPRでは、主要な図をMermaidでPR本文に残し、後から履歴を追えるようにする。

図を載せる条件（データフロー・state・APIの変更など）を決め、`diagram` skillの出力をPR本文へ載せる手順を`pr-review-cycle`と`run-task`に入れる。Artifactのガイドは置き換えず、PR本文には図だけを載せる。PRテンプレートの4節の構成は変えない。`diagram` skillは個人の環境にありリポジトリにはないため、使えない環境（定期実行など）ではMermaidを直接書く。PR本文は公開されるので、図に個人データ・秘密情報・実データの例を載せない。

## 確認可能な完了条件

- [ ] 図を載せる条件と、載せる節（「取り組んだこと」など）が[pull-requests.md](../development/pull-requests.md)に書かれている。
- [ ] `pr-review-cycle`と`run-task`に、条件に当たるPRで図を作ってPR本文に載せる手順が書かれている。
- [ ] `diagram` skillがない環境での代わり（Mermaidを直接書く）が手順に書かれている。
- [ ] 図に個人データ・秘密情報・実データの例を載せないことが手順に書かれている。
- [ ] 検査・許可・reviewerの定義、またはAIへの指示を変えた場合、そのファイルと検査が緩んでいないことの確認をPRの「確認すること」に挙げている（定義と例は[TASK-021](TASK-021-failure-classification.md)。TASK-021の手順が`pr-review-cycle`に入っていればそれに従う）。
- [ ] GitHub上でMermaidが描画されることを、実際のPRで確認している。

## 依存するタスクID

なし。

## 根拠となる仕様書と見出し

- [pull-requests.md](../development/pull-requests.md)
- [pr-review-cycle](../../.claude/skills/pr-review-cycle/SKILL.md)
- [AGENTS.md](../../AGENTS.md) — 「Pull Requests」
- 参考: [mizchi「AIコーディングのループと形式手法」](https://zenn.dev/mizchi/articles/ai-coding-loop-formal) — 「理解する」

## 必要な検証

- 条件に当たるPRと当たらないPRで、手順どおりに図の有無が分かれること。

## 関連Implementation Plan

未作成。着手時にAGENTS.mdの規約に従って作成し、ここへリンクを追記する。
