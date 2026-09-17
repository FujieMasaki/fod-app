# Implementation Plan

## 1. Goal

コードレビュー時にセキュリティ確認を必須化し、レビュー結果の品質と再現性を
高める。

## 2. Background

- 現在の `AGENTS.md` には、実装後に diff を確認する規約はあるが、レビュー時の
  セキュリティ観点・重大度・出力形式が明文化されていない。
- Focus on Dot は Vite を使うクライアントSPAであり、Next.js 固有の Server Component
  規約を流用すると、実装と合わないチェックが増える。
- 録音、ブラウザの `localStorage`、将来追加される API 通信では、秘密情報や個人性の
  あるデータを扱う可能性がある。

## 3. Current State

- `src/features/session/session-context.tsx` はセッション情報を `localStorage` に保存する。
- `src/libs/audio/recorder.ts` と `src/features/recording/` はマイク入力を扱う。
- 現時点でサーバー実装・認証実装・環境変数利用はない。

## 4. Proposed Approach

1. `docs/code-review/frontend/README.md` に運用、重大度、対象範囲、レビュー出力の規約を定義する。
2. `docs/code-review/frontend/security.md` に、現在の Vite SPA と将来の API 追加にも適用できる
   セキュリティチェックリストを定義する。
3. `AGENTS.md` から README を必須の起点として参照し、セキュリティ確認と指摘形式を
   明文化する。

## 5. Why This Approach

レビュー時に必要な詳細を専用ドキュメントへ分離し、`AGENTS.md` には必須ルールだけを
置く。これにより日々の作業規約を読みやすく保ちながら、見落とし・誤検知の学びを
レビュー指針へ蓄積できる。

## 6. Data Flow

```text
Code review request
↓
Changed-file diff and related code
↓
docs/code-review/frontend/README.md + security.md
↓
Findings with severity, location, and remediation
↓
Chat review response
```

今回、アプリケーションのデータフローは変更しない。

## 7. Files to Change

- 変更: `AGENTS.md` — レビュー時に従う必須ルールを追加する。
- 新規: `docs/code-review/frontend/README.md` — フロントエンドのレビュー運用と重大度を定義する。
- 新規: `docs/code-review/frontend/security.md` — フロントエンドのセキュリティチェックリストを定義する。

## 8. Libraries / APIs

新しいライブラリや外部APIは追加しない。

## 9. Alternatives Considered

- Next.js 向けの既存指針をそのまま採用する: Vite SPA に存在しない RSC / Server Action
  の確認が中心となり、実用性を損なうため採用しない。
- `AGENTS.md` だけに全チェックリストを書く: 更新しにくく、通常の作業規約が肥大化する
  ため採用しない。

## 10. Risks / Things to Watch

- 将来のバックエンド実装では、`docs/code-review/backend/` に専用の指針を追加し、
  認証・認可・レスポンス項目を実装構成に合わせて具体化する。
- チェックリストを一般論で終わらせず、見落としや誤検知があれば更新する。

## 11. Verification

### Manual

- `AGENTS.md` からレビュー指針の起点へ到達できることを確認する。
- セキュリティ観点に環境変数、保存データ、録音、API、外部入力が含まれることを確認する。

### Automated

- ドキュメントのみの変更のため、テスト実行は不要。

## 12. Definition of Done

- セキュリティ観点がレビュー時の必須項目として明文化されている。
- 重大度・該当箇所・修正案を含む出力形式が定義されている。
- 現在の Vite SPA 構成と矛盾しない。
