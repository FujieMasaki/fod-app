# Implementation Plan: ローカルAIコードレビュー指針

## 1. Status

完了（2026-09-20）。

## 2. Goal

別のローカルAIセッションでも、Focus on Dotの差分範囲を安全に確定し、frontend、backend、横断変更を
同じ基準でレビューできる文書入口と再利用プロンプトを用意する。

## 3. Background

- `docs/code-review/frontend/` と `docs/code-review/backend/` には領域別のレビュー指針とsecurity観点が
  あるが、差分の決め方、重大度、出力形式、改善方法は重複または分散している。
- ローカルAIレビューでは、未コミット、staged、branch比較を取り違えず、必要な仕様・実装まで読んだ
  上で判断する共通手順が必要である。
- 現在はVite SPAとRails API基盤が同居し、プロダクトAPI、認証、音声保存、AI providerは未決定である。
  将来の未実装を今回の差分の不具合として誤検知しない必要がある。

## 4. Current State

- frontendとbackendにはそれぞれレビュー入口とsecurity観点がある。
- frontendは録音、`fod.session.v1`のbrowser保存、Zodでのresponse検証、暫定mock/API接続点を持つ。
- backendはRails API基盤と`GET /up`のみで、認証・プロダクトAPI・外部AI連携は未実装である。
- CIは変更範囲に応じてWebまたはRailsの検査を選び、docsのみの変更では両アプリ検査を省略する。

## 5. Scope and Non-goals

### 対象

- 共通レビュー入口、再利用可能なローカルAIレビュー依頼プロンプト、既存領域別指針との役割整理。
- `AGENTS.md`、root README、Implementation Planの入口整合。

### 対象外

- プロダクトコード、依存ライブラリ、CI、GitHub Actions、外部投稿、Bot、独自CLI、plugin、skill。
- 実際のリポジトリ全体レビュー、レビューで発見したプロダクト不具合の修正。
- 認証、API契約、音声保存、AI provider、Job基盤の設計決定。

利用者の追加依頼により、この文書変更は専用branchへcommitし、PRを作成する。PR以外の外部投稿、
自動承認、自動mergeは対象外とする。

## 6. References and Documents to Update

- 参照: `AGENTS.md`、個人規約とRails規約、`README.md`、product / journaling / architecture、development、
  design-system、既存のfrontend / backendレビュー文書、CI、関連Plan。
- 新規: `docs/code-review/README.md`、`docs/code-review/review-prompt.md`、本Plan。
- 更新: `AGENTS.md`、`README.md`、`docs/code-review/frontend/README.md`、
  `docs/code-review/backend/README.md`。

## 7. Proposed Approach

1. `docs/code-review/README.md`を共通の正本とし、対象確定、必読資料、読み分け、重大度、出力、LGTM、
   改善手順を定義する。
2. `review-prompt.md`に未コミット、staged、branch比較を指定できる自己完結の依頼文と利用例を置く。
3. 領域別READMEは、共通ルールへのリンクと領域固有の確認観点へ整理する。
4. rootの入口を共通指針とプロンプトへ結び、文書だけの差分とリンクを検証する。
5. 検証後、`codex/`接頭辞のbranchへcommitし、PRを作成する。

## 8. Why This Approach

- 共通ルールを1か所に置くことで、frontendとbackendで重大度・LGTM条件・出力が食い違わない。
- 領域別文書は既存のsecurity観点を維持しつつ、現在の実装に即した確認に集中できる。
- ローカルAIには実際に読む順番を指示する。リンクを自動展開する前提の連結生成物やCIは追加しない。

## 9. Data Flow

```text
レビュー依頼（対象と任意の重点）
↓
Git status / diffで対象確定
↓
共通入口 → 該当する領域別指針・security → 仕様・実装規約・Plan
↓
差分と関連実装・test・設定を確認
↓
ローカルチャットへ構造化したレビュー結果を出力
```

プロダクトのデータフローは変更しない。

## 10. Files to Change

- 新規: `docs/code-review/README.md` — 共通のレビュー運用・出力・改善方法。
- 新規: `docs/code-review/review-prompt.md` — 別セッション向けの依頼プロンプトと例。
- 変更: `docs/code-review/frontend/README.md` — frontend固有観点への整理。
- 変更: `docs/code-review/backend/README.md` — backend固有観点と未導入層の扱いの明確化。
- 変更: `AGENTS.md`、`README.md` — 共通入口への導線。
- 新規: 本Plan — 方針と検証記録。

## 11. Libraries / APIs

新しいライブラリ、API、外部サービスは利用しない。Gitのread-onlyな状態・差分確認だけを前提とする。

## 12. Alternatives Considered

- frontend / backendの各READMEに共通規則を複製する: 将来の更新で矛盾しやすいため採用しない。
- リンクを展開した単一生成プロンプトと生成スクリプトを管理する: ローカルAIが必要資料を読む方式で足り、
  生成物のdrift管理を増やすため採用しない。

## 13. Risks / Things to Watch

- stagedとworking tree、未追跡、削除・リネーム、branchのmerge-baseを混同しない。
- `.env`、秘密鍵、dump、録音などを未追跡だからと無差別に開かない。
- 個人Rails規約の責務分離は確認する一方、projectのbackend規約で保留のService / Serializer / Jobを
  未導入というだけで必須化しない。
- docs / CI /依存変更もレビューするが、CIでアプリ検査が省略されることとAIレビューの対象外を同一視しない。

## 14. Verification

### Manual

- Webのみ、APIのみ、横断、docs / CIのみの各変更で、必要な資料と観点を辿れることを確認する。
- 未コミット、staged、branch比較、未追跡、削除・リネーム、差分なし、資料欠落・大規模差分の扱いを確認する。
- `AGENTS.md`とREADMEから共通入口・再利用プロンプトへ到達できることを確認する。

### Automated

- Markdownのローカルリンク確認。
- `git diff --check`。

アプリケーションtest / lintは文書のみの変更のため実行しない。

## 15. Definition of Done

- 共通の対象確定・必読順・出力・改善手順が1つの正本にある。
- frontend、backend、横断、docs / CIのレビュー対象を適切に読み分けられる。
- Lowの任意改善、LGTM、未確認・レビュー不完全、security疑義を区別できる。
- 通常のレビュー依頼では外部投稿・変更・push・PR操作を行わないことが明確である。
- 利用者が追加依頼したこの文書変更のみ、専用branchとPRに含める。
- 文書以外の変更がなく、差分とリンクが確認されている。

## 16. Completion Record

- 状態: 2026-09-20に完了。`codex/local-ai-code-review` branchでPR作成を進める。
- 実装差異: 共通運用を`docs/code-review/README.md`へ集約し、既存frontend / backend READMEから
  重大度・出力形式を削除して共通正本へのリンクに置き換えた。frontend / backendの必読資料と固有観点は
  分けて維持・補強した。利用者の追加依頼により、当初のローカル文書のみという範囲にbranch / PR作成を
  加えたが、プロダクトコード・依存・CI・外部Botは変更していない。
- 検証結果: `node --input-type=module -e '<Markdown link checker>'`で変更した7文書のローカルMarkdown
  linkを確認、`git diff --cached --check`、staged diffとファイル一覧を確認した。Webのみ、APIのみ、
  横断、docs / CIの読み分け、未コミット・staged・branch比較、未追跡・削除・リネーム・差分なし・
  資料欠落の手順を文書上で確認した。文書のみの変更のため個別のアプリケーションlint / testは追加実行
  していないが、push時のpre-push hookで`pnpm --filter @focus-on-dot/web type-check`、
  `pnpm test:scripts`、`pnpm --filter @focus-on-dot/web test`が成功した。Rails検査はこの文書差分では
  実行していない。
- 関連: [PR #24](https://github.com/FujieMasaki/fod-app/pull/24)。`.worktrees/`は既存の未追跡ファイルとして
  変更・stageしていない。
