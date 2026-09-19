# Documentation Governance Implementation Plan

## 1. Status

完了（2026-09-19）。

## 2. Goal

AIと人間が、Focus on Dotの実装・レビュー前に同じ責務、仕様、対象外、未決定事項を確認できる
最小限の文書運用を整える。アプリケーションコード、依存ライブラリ、CI、lint設定は変更しない。

## 3. Background

- Rails APIの基盤は追加済みだが、プロダクトAPIは未実装である。一方、既存READMEと
  frontend security指針にはこの現状とずれる表現がある。
- frontendにはレビュー指針があるが、backendの実装規約・レビュー入口がない。
- 現在の録音からDot表示までのUIにはモックによる体験確認と将来の送信・保存仕様が混在し得るため、
  現行の振る舞い、MVP対象、未決定を分けて記録する必要がある。
- 文書の役割が重複すると、AIが古い説明や画面設計を仕様と誤認する。MVPの個人開発に必要な粒度へ
  集約する。

## 4. Current State

- `apps/web/` はVite + React + TypeScriptのSPAで、router、feature単位のUI / Hook / 通信、
  Session Provider、TanStack Queryを持つ。
- 現行の録音はブラウザのMediaRecorderでBlobを生成し得るが、`useRecorder` は停止時に
  durationだけを呼び出し元へ返す。Blobは後続の処理・保存・送信へ渡されない。
- `createDot` は`VITE_DOT_API_URL`未設定時にローカルmockを返す。設定時も`POST dot`は本文なしで、
  RailsのプロダクトAPIは未実装である。生成結果と録音時間は`fod.session.v1`で1件だけ
  localStorageに保存する。
- `apps/api/` にはRails、PostgreSQL、RSpec、品質・security検査、`GET /up` があり、User、認証、
  Dot、音声、AI処理のAPIはない。
- `docs/design-system.md` はUI表現の正本、`docs/architecture.md` は構成と継続する設計判断の正本、
  `docs/code-review/frontend/` はfrontendレビューの入口である。

## 5. Scope and Non-goals

### 対象

- frontend / backendの実装規約、backendレビュー指針、プロダクト・ジャーナリング仕様を追加する。
- `AGENTS.md`、README、architecture、frontendレビュー指針、Implementation Plan templateを
  文書運用と現在の実装へ整合させる。

### 今回の対象外

- アプリケーションコード、Gem / npm dependency、CI、lint、API、OpenAPI、型生成、契約検証ライブラリ。
- 認証方式、AI provider、background job基盤、音声の永続化方式、検索・カテゴリ・期間フィルタの
  MVP採用判断。未決定として選択肢と再検討条件だけを記録する。

## 6. References and Documents to Update

- 参照: `README.md`、`docs/architecture.md`、`docs/design-system.md`、既存frontend review指針、
  `apps/web/src/`、`apps/api/`、個人規約。
- 更新: `AGENTS.md`、README、architecture、frontend review指針、Implementation Plan template、
  `apps/api/README.md`。
- 新規: `docs/development/frontend.md`、`docs/development/backend.md`、
  `docs/code-review/backend/README.md`、`docs/code-review/backend/security.md`、
  `docs/product.md`、`docs/journaling.md`。

添付指定の`company-work`資料は作業環境で発見できなかったため参照できない。内容を推測して移植せず、
資料が後から共有された場合に必要な差分だけを再検討する。

## 7. Proposed Approach

1. `development/`に「どう作るか」の正本を置き、必須・推奨・保留・例外を明示する。
2. `code-review/`には「何を根拠に確認・報告するか」だけを置き、実装規約はリンク参照にする。
3. `product.md`でMVPの範囲と作らないことを、`journaling.md`で現在の体験と将来仕様の差を記録する。
4. `AGENTS.md`を各作業種別の入口にし、READMEを人間向けの概要・起動方法・文書索引に保つ。
5. architectureへ最初のWeb利用プロダクトAPI時に始める契約管理方針を記録する。OpenAPIや生成物は
   この変更では導入しない。
6. 文書間リンク、実装との記述、全diffを確認する。

## 8. Why This Approach

- 現在のfeature単位frontendとRails標準構成を前提にするため、未使用の通信層、Service層、Gemを
  文書上でも先行して要求しない。
- 仕様、構成判断、実装規約、レビュー手順、変更履歴を分けることで、同じルールを複製せずに
  更新箇所を明確にできる。
- 2つの機能仕様文書に留めることで、画面やComponent単位の機械的な文書分割を避ける。

## 9. Data Flow

文書運用のflowは次のとおり。

```text
変更要求
↓
product / 機能仕様・architectureで範囲と現状を確認
↓
development規約で実装判断
↓
Implementation Planに変更単位の判断と検証を記録
↓
code-review指針で差分を検証・報告
↓
関連する現行文書を同じ変更で更新
```

今回、プロダクトデータ、API、Storageのflowは変更しない。

## 10. Files to Change

- 新規: `docs/development/*.md` — frontend / backendの実装判断。
- 新規: `docs/code-review/backend/*.md` — backendのレビュー運用とsecurity観点。
- 新規: `docs/product.md`、`docs/journaling.md` — MVP範囲とジャーナリング仕様。
- 変更: `AGENTS.md`、README、architecture、既存frontend review指針、Plan template、API README —
  作業入口、現状、リンク、運用の整合。
- 変更: 本Plan — 完了後の実施結果と検証を追記。

## 11. Libraries / APIs

新しいlibrary・APIは追加しない。本文では既存のReact、TanStack Query、Zod、MediaRecorder、Railsを
現状説明のために参照するだけである。

## 12. Alternatives Considered

- frontend / backend規約をarchitectureへ集約する案: 構成判断と日々の実装判断が混ざり、更新負荷が
  高くなるため採用しない。
- Component / Hook / API / Model別の文書を先に分割する案: 現在の規模には過剰なため採用しない。
- OpenAPIや契約検証を先に導入する案: 最初のプロダクトAPIと認証・配信構成が未決定なため採用しない。

## 13. Risks / Things to Watch

- design-systemにある検索・カテゴリ・期間フィルタを、実装済みまたはMVP確定と読み替えない。
- ErrorStateの「音声は保存されています」という表示は、現行実装と一致しない。今回コードは変えず、
  仕様で差異として明示する。
- 過去のPlanのCurrent Stateは当時の記録であり、現在の状態に書き換えない。
- `company-work`が未確認のため、同資料固有の判断は取り込まない。

## 14. Verification

### Manual

- 文書の役割、リンク、必読順を確認する。
- `apps/web/src`と`apps/api`を再照合し、実装済み・提案・未決定が混ざっていないことを確認する。
- `git diff --check`と全diffで、文書と`AGENTS.md`以外に変更がないことを確認する。

### Automated

- 文書のみの変更のため、アプリケーションtest / lintは実行しない。リンク切れと差分確認を
  commandで行う。

## 15. Definition of Done

- AIが実装前・UI変更前・レビュー前に読む文書を`AGENTS.md`から辿れる。
- frontendとbackendに同じ分類の実装規約とレビュー観点があり、本文は重複しない。
- 現在の実装、MVP対象、将来候補、未決定、対象外が区別される。
- ドキュメント以外の実装・設定は変更されず、全diffとリンクが確認される。

## 16. Completion Record

- 状態: 2026-09-19に完了。
- 実装差異: Planどおりに、frontend / backend実装規約、backend review、product / journaling仕様、
  文書入口とtemplateを追加・更新した。アプリケーションコード、dependency、CI、lintは変更していない。
- 検証結果: `git diff --check`、全Markdownのローカルリンク解決（18文書）、`apps/web/src`と`apps/api`の
  現行実装の再照合、変更ファイル一覧を確認した。文書のみの変更のためアプリケーションtest / lintは
  実行していない。
- 関連: 初回のWeb利用プロダクトAPIでは、[`../architecture.md`](../architecture.md)、
  [`../product.md`](../product.md)、[`../journaling.md`](../journaling.md)を基に、契約・認証・音声・
  生成処理の未決定事項を別Implementation Planで判断する。PR / issueは未作成。
