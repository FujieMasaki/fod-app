# Implementation Plan

## 1. Goal

PR作成を依頼されたとき、日本語のタイトルと説明を用い、事前の再確認で止まらずPRを作成する。PR本文には共通の見出しと、人間が確認する項目を含める。

## 2. Background

- PR作成のたびに、言語、事前確認、本文構成について同じ指摘が発生している。
- バグ対応では、修正内容に加えて原因を説明する必要がある。
- 「確認すること」はレビュー担当者が実際に確認できるTODOリストにする。

## 3. Current State

- `AGENTS.md` にPR作成の規約はない。
- `.github/` にPRテンプレートはない。
- 指示に記載された `personal-conventions.md` はこの作業ディレクトリに存在しない。

## 4. Proposed Approach

1. `AGENTS.md` にPR作成時の言語、作成順序、本文記入ルールを追加する。
2. `.github/pull_request_template.md` に共通の4見出しを用意する。
3. バグ対応時だけ「原因」を加える方法を、規約とテンプレートのコメントで示す。

## 5. Why This Approach

`AGENTS.md` はこのリポジトリでAIの作業規約を管理する既存の場所である。GitHub標準のPRテンプレートを併用すると、手動でPRを作成する場合にも同じ構成が表示される。バグ以外のPRに空の「原因」を残さないよう、テンプレートには追加指示だけを置く。

## 6. Data Flow

アプリケーションのデータフローに変更はない。PR作成依頼から、規約とテンプレートに従ったPR作成、作成済みURLの共有へ進む。

## 7. Files to Change

- `AGENTS.md`（変更）: AI向けPR作成規約。
- `.github/pull_request_template.md`（新規）: GitHubに表示するPR本文のひな形。
- このImplementation Plan（新規）: 変更理由と確認方法。

## 8. Libraries / APIs

新しい依存関係はない。GitHubのPRテンプレート機能を利用する。

## 9. Alternatives Considered

`AGENTS.md` だけに記す案では、手動作成時に本文のひな形が表示されない。テンプレートだけの案では、AIがPR作成前に確認を求める行動を防げない。

## 10. Risks / Things to Watch

- テンプレートのプレースホルダーを、完成したPR本文に残さない。
- 「原因」はバグ対応以外で追加しない。
- 「確認すること」に、単なる実装作業や自動テストの実施記録を並べない。

## 11. Verification

- `git diff` で見出し、条件付きの「原因」、作成順序の指示を確認する。
- Markdownの内容のみの変更のため、自動テストは実施しない。

## 12. Definition of Done

- 日本語のタイトルと本文を求める規約がある。
- PR作成依頼では、事前確認で止まらずPRを作成することが明記されている。
- 共通の4見出し、レビュー担当者向けTODO、バグ対応時の「原因」が定義されている。
