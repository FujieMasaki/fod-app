# Dot履歴のMVP範囲整理 Implementation Plan

## 1. Status

完了（2026-09-20）。

## 2. Goal

過去のDotをたどれる複数Dotの一覧と今日のDotを大きく見るDay表示をMVP対象に加え、Week / Monthの時間軸表現と週次・月次AI振り返りを検証候補として区別する。

## 3. Background

現行の`product.md`は過去のDotの振り返りをMVP対象としながら、複数Dotの一覧を対象外としている。`design-system.md`には検索・フィルタ付き一覧の画面原則があり、MVP範囲を読み違えやすい。利用者はDotを丸で表し、時間の積み重ねを見渡す体験を提示した。

## 4. Current State

実装は現在のDot 1件をbrowserのlocalStorageに保持する。複数Dotの保存、一覧、Week / Month表示は未実装である。今回コードは変更しない。

## 5. Scope and Non-goals

- 対象: 複数Dot一覧とDay表示のMVP採用、丸いDotモチーフ、過去のDotへの到達、Week / Monthの検証候補、既存文書の整合。
- 対象外: UI・APIの実装、検索・カテゴリ・期間フィルタのMVP採用、週次・月次AI生成の実装判断。
- 未決定: 同日の複数録音、記録のない日、Weekの開始曜日、切り替え操作、アニメーションの具体方式。

## 6. References and Documents to Update

- 参照: `AGENTS.md`、`docs/product.md`、`docs/journaling.md`、`docs/design-system.md`、`docs/architecture.md`。
- 更新: `docs/product.md`、`docs/journaling.md`、`docs/design-system.md`、`README.md`。
- 新規: `docs/dot-history.md`。

## 7. Proposed Approach

1. `product.md`で複数Dot一覧をMVPに含め、検索・フィルタとWeek / Monthを候補として分ける。
2. `dot-history.md`でMVPの最小体験、Dotモチーフ、時間軸の検証案、未決定事項を記録する。
3. `journaling.md`と`design-system.md`の矛盾する記述を新しい範囲に合わせる。
4. READMEから新しい機能仕様へ到達できるようにする。

## 8. Why This Approach

MVP範囲は`product.md`を正本とし、時間軸の独立した振る舞いと受け入れ条件は機能仕様へ分けることで、タスク分解時に必須事項と検証候補を識別できる。

## 9. Data Flow

文書のみの変更で、アプリケーションのデータフローは変わらない。将来のDot履歴は利用者ごとの保存を前提とするが、APIとstateの設計は今回決めない。

## 10. Files to Change

- `docs/product.md`: MVP範囲。
- `docs/dot-history.md`: Dot履歴の機能仕様。
- `docs/journaling.md`: 履歴の受け入れ条件と未決定事項。
- `docs/design-system.md`: 一覧の画面原則と適用段階。
- `README.md`: 文書索引。
- 本Plan: 完了記録。

## 11. Libraries / APIs

追加しない。

## 12. Alternatives Considered

時間軸表現の詳細を`product.md`へまとめる案は、MVPの範囲と画面の検証案が混在するため採用しない。

## 13. Risks / Things to Watch

- 「1日=1 Dot」という体験上の表現を、同日に複数回録音したときのデータ構造の決定と混同しない。
- Week / Month表示をMVPの必須条件と誤読しない。Day表示はMVPに含む。
- 過去のImplementation PlanのCurrent Stateを書き換えない。

## 14. Verification

- 文書間のMVP対象・候補・未決定の整合とリンクを確認する。
- `git diff --check`と差分全体を確認する。文書のみの変更のためアプリケーションtestは実行しない。

## 15. Definition of Done

複数Dot一覧がMVP対象であること、Week / Monthが検証候補であること、未決定事項が文書間で矛盾なく読み取れる。

## 16. Completion Record

- 状態: 完了（2026-09-20）。
- 実装差異: Dayで今日のDotを大きく見る体験をMVP条件として明記した。Week / Monthとズームの動きは検証候補のままとした。
- 検証結果: `git diff --check`、関連文書の差分・リンク・MVP区分を確認した。文書のみの変更のためアプリケーションtestは実行していない。
- 関連: `docs/product.md`、`docs/dot-history.md`、`docs/journaling.md`、`docs/design-system.md`。
