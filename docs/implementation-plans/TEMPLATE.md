# Implementation Plan

## 1. Goal

この変更で何を実現するか。ユーザーにとって何ができるようになるか。

## 2. Background

- 現在の課題
- 要件
- なぜこの変更が必要なのか

## 3. Current State

現在の関連実装を整理する。必要に応じて、次を記載する。

- Component
- Route
- State
- Hook
- API
- Storage
- Data structure

## 4. Proposed Approach

実装方法をステップ単位で説明する。コードを書く前に、実装構造を人間が理解できる粒度にする。

## 5. Why This Approach

- なぜこの方法を採用するか
- Focus on Dotの現在の構成との相性
- シンプルさ
- 将来の拡張性

## 6. Data Flow

データの流れを図示する。Stateがある場合はsource of truthも明記する。

```text
User
↓
Component
↓
Hook
↓
API / Browser API
↓
State / Storage
↓
UI
```

## 7. Files to Change

変更予定ファイルを記載する。各ファイルについて、次を示す。

- 新規 / 変更
- 役割

## 8. Libraries / APIs

今回利用する重要なライブラリ・APIについて、用途となぜ使うかを記載する。新しいdependencyを追加する場合は、既存ライブラリやWeb APIで代替できないかも検討する。

## 9. Alternatives Considered

他の実装案がある場合は、メリット・デメリット・採用しない理由を簡潔に記載する。意味のある代替案がなければ省略可能。

## 10. Risks / Things to Watch

必要に応じて次を確認する。

- ブラウザ互換性
- 非同期処理 / race condition
- State不整合
- エラー処理
- 型安全性
- データ欠損
- breaking change

## 11. Verification

### Manual

- 正常系
- 異常系
- 主要ユーザー操作

### Automated

必要に応じて、次を記載する。

- Unit test
- Integration test
- E2E

## 12. Definition of Done

- 要件を満たしている
- TypeScript errorがない
- lint / testが通る
- 主要操作を確認できる
- 不要なコードが残っていない
- 実装内容を人間が説明できる
