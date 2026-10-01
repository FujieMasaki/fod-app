# Human Review Artifact Skill Implementation Plan

## 1. Status

実施中（2026-10-01）。

## 2. Goal

機械のレビュー（サブエージェントとCodex）でLGTMが出たPRを人間がレビューするとき、毎回同じ構成の
ガイドページ（Artifact）を作れるようにする。人間は、機械が確かめ終えたことを読み飛ばし、判断が
必要な項目だけを、実例と「OKの基準」を見ながら確かめられる。

## 3. Background

- PR #45（TASK-005のAPI契約）とPR #46（3段レビュー）で、LGTM後に人間のレビュー用のガイドページを
  作ったところ、PR本文の確認項目だけより判断しやすく、ユーザーから毎回作ってほしいと言われた。
- いまはこの運用が個人のmemoryにしか記録されておらず、構成・作る条件・URLの保ち方が毎回の
  判断になっている。`pr-review-cycle`からも呼ばれない。
- 参考にするページ: <https://claude.ai/artifact/KUcAvcCSNudXRp9BBZoo3v>（PR #45）。

## 4. Current State

- `.claude/skills/pr-review-cycle/SKILL.md`: 手順8（再発防止の仕組み化）の後、手順9で完了報告をする。
  人間のレビュー用の成果物を作る段階はない。
- 全プロジェクト共通の`/review-guide`（`~/dev/dotfiles/claude/commands/review-guide.md`）は、レビュアーが
  他人のPRを一問一答でレビューするためのコマンド。`/self-review`は、PRの変更内容を作成者が理解する
  ための解説。どちらも、PRの作成者側がレビュアーへ渡すページは作らない。

## 5. Scope and Non-goals

- 今回の対象: `human-review-artifact` skillの追加と、`pr-review-cycle`からの呼び出し。
- 今回の対象外: アプリのコード。全プロジェクト共通のコマンド（`/review-guide`・`/self-review`）の変更。
  ページの見た目のテンプレートをリポジトリに置くこと（Artifactの規約とPR #45のページを参考にする）。
- AGENTS.mdへの参照は足さない。この skill は`pr-review-cycle`から呼ばれ、単独でも skill の
  descriptionで起動するため。

## 6. References and Documents to Update

- 参照: `.claude/skills/pr-review-cycle/SKILL.md`、`.claude/skills/run-task/SKILL.md`（skillの書き方）、
  `/review-guide`・`/self-review`、PR #45・#46のガイドページ。
- 更新: `.claude/skills/pr-review-cycle/SKILL.md`。
- 新規: `.claude/skills/human-review-artifact/SKILL.md`。

## 7. Proposed Approach

1. `.claude/skills/human-review-artifact/SKILL.md`を追加する。作る条件と作らない条件（判断の目安つき）、
   ページの5節（見るところ・見なくていいところ／全体像／確認すること／このPRで決めたこと／ファイルの場所）、
   上部に出すレビュー状態、同じPRへの修正時は同じファイルを再publishしてURLを保つこと、非公開であることの
   案内、Artifactの規約に従うこと、を定める。
2. `pr-review-cycle`の手順8（仕組み化）と完了報告の間に、この skill を呼ぶ手順を足す。完了報告に
   ページのURL（作らなかった場合はその理由）を含める。

## 8. Why This Approach

- 構成と条件を skill に書くと、セッションやmemoryの有無に関係なく同じページが作れる。
- `pr-review-cycle`の最後に組み込むと、LGTM後に作り忘れない。一方で単独の skill にしておけば、
  「レビュー用のページを作って」と頼まれたときにも使える。
- 見た目は skill に固定せず、Artifactの規約とPR #45のページに合わせる。HTMLの雛形をリポジトリに
  置くと、規約の更新に追随する手間が増えるため。

## 9. Data Flow

UIやAPIのデータフローはない。Claude Codeのワークフロー定義の変更である。

```text
pr-review-cycle の LGTM・仕組み化
↓
human-review-artifact（作る条件を判断）
↓
PR本文・diff・Plan・CI結果を読む → HTMLを書く → Artifactをpublish
↓
完了報告にURLを含める
```

## 10. Files to Change

- `.claude/skills/human-review-artifact/SKILL.md`（新規）: ガイドページを作る手順と条件。
- `.claude/skills/pr-review-cycle/SKILL.md`（変更）: LGTM後にこの skill を呼ぶ手順。
- 本Plan（新規）。

## 11. Libraries / APIs

- Artifact tool（Claude Code）: HTMLページを非公開のArtifactとしてpublishする。同じファイルを再publishすると
  同じURLに更新され、閲覧者のlocalStorage（チェック状態）も残る。

## 12. Alternatives Considered

- 既存の`/review-guide`を拡張する: 他人のPRを一問一答でレビューするコマンドで、役割が違う。
  全プロジェクト共通のため、このリポジトリのPRに合わせた構成を入れにくい。不採用。
- `pr-review-cycle`の中に手順として直接書く: 単独で頼まれたときに使えず、`pr-review-cycle`も長くなる。不採用。

## 13. Risks / Things to Watch

- 作らない条件の判断を誤ると、必要なPRでページが作られない。迷ったら作る、と書く。
- ページの内容（レビュー状態・CIの結果）がPRの実際とずれると、人間の判断を誤らせる。publish前に
  PR・CIの状態を取り直し、修正が入ったら同じURLで更新する。

## 14. Verification

### Manual

- 本PR自体に、追加した skill の手順でガイドページを作り、5節と上部の状態が揃うことを確かめる。

### Automated

Markdownのみの変更のため、自動テストは対象外。pre-commit / pre-push hookの通過を確認する。

## 15. Definition of Done

- 作る条件・作らない条件と判断の目安が skill に書かれている。
- 5節の構成と、上部のレビュー状態、URLを保つ更新方法が書かれている。
- `pr-review-cycle`からLGTM後に呼ばれ、完了報告にURLが含まれる。
- 既存の`/review-guide`・`/self-review`と役割が重ならない。

## 16. Completion Record

- 状態:
- 実装差異:
- 検証結果:
- 関連:
