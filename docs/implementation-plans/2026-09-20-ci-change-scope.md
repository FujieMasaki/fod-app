# Implementation Plan: PR の変更範囲に応じた CI

## 1. Goal

PR に関係するフロントエンドまたはバックエンドの検査だけを実行し、必要な検査が未実行・失敗のままマージ可能になることを防ぐ。

## 2. Background

- 現在はすべての PR で Node の 4 ジョブと Rails の 1 ジョブが動く。
- フロントエンドとバックエンドが `apps/web/` と `apps/api/` に分かれている。
- 判定不能な変更や判定処理の失敗時には両方を実行する方針で合意した。

## 3. Current State

- `.github/workflows/ci.yml` の `pull_request`、`push: main`、`workflow_dispatch` がすべて同じ 5 ジョブを起動する。
- Root の Node 設定と `scripts/check-naming.mjs` は Web 側の検査に使う。
- Rails ジョブは `apps/api/` で実行し、PostgreSQL service を起動する。

## 4. Proposed Approach

1. 必ず起動する `changes` ジョブで PR の差分ファイル名を取得し、`web` と `api` の要否を出力する。`main` への push と手動実行は両方 true にする。
2. Web・API の既存ジョブは判定結果に従い起動する。`changes` ジョブが失敗した場合も両方起動する。
3. ファイル分類は Web 固有、API 固有、文書のみ、共通・未知の順に扱う。未知のパスは両方を要求する。リネームは旧パスと新パスを検査する。
4. 必ず起動する `CI Gate` ジョブが、必要な各ジョブの結果を検証する。判定出力が不正な場合は失敗させる。
5. GitHub のブランチ保護では `CI Gate` を必須チェックとして使う。既存の個別必須チェックがあれば移行する。

## 5. Why This Approach

- Workflow 全体のパスフィルターは必須チェックを Pending にするため使わない。
- Job のスキップ自体は成功扱いになるため、単一の Gate が実行要否と実行結果を突き合わせる。
- Git の差分と標準の Node を使い、追加の Action / npm dependency を導入しない。

## 6. Data Flow

```text
PR / main push / manual run
↓
changes job: Git diff → パス分類 → web/api の要否
↓
必要な Build / Check / TypeScript / Tests / Rails
↓
CI Gate: 要否とジョブ結果を検証
↓
PR の必須チェック
```

## 7. Files to Change

- `.github/workflows/ci.yml`（変更）: 判定、条件付きジョブ、Gate。
- `scripts/ci-changes.mjs`（新規）: パス分類。
- `scripts/ci-changes.test.mjs`（新規）: フロント・API・混在・文書・未知・リネームの分類を確認。
- `scripts/ci-gate.mjs` / `scripts/ci-gate.test.mjs`（新規）: 必須チェックの結果確認とフォールバックの検証。
- `package.json`（変更）: 既存の `pnpm test` で新しい分類テストも実行する。
- 本 Plan（新規）: 設計理由と検証方法。

## 8. Libraries / APIs

- Git `diff --name-only -z --no-renames`: PR 差分のファイル名を安全に取得し、リネーム前後の両方を含める。
- Node 標準 API: NUL 区切りのファイル名を処理し、GitHub Actions の output に書く。
- GitHub Actions `needs` / `if`: ジョブの起動制御と実行結果の確認。

## 9. Alternatives Considered

- `on.pull_request.paths`: 必須チェックが Pending になり得る。
- 個別ジョブを required にするだけ: スキップが成功扱いなので誤判定を検知できない。
- 外部のパスフィルター Action: 現在の単純な 2 アプリ構成には依存追加が不要。

## 10. Risks / Things to Watch

- 変更分類の対象外パスを誤って「文書のみ」にしない。未知のパスは両方を実行する。
- 判定ジョブが失敗しても、後続の `needs` で検査ジョブが自動スキップされない条件を使う。
- `CI Gate` を GitHub 側の必須チェックに設定する必要がある。

## 11. Verification

### Manual

- Web のみ、API のみ、混在、文書のみ、未知のパスで期待するジョブが動くことを PR 上で確認。
- 判定処理の失敗時に両方が動き、必要なジョブの失敗を Gate が失敗として扱うことを確認。

### Automated

- 分類関数の Node test。
- Workflow の構文検証と既存のフロントエンド検査。

## 12. Definition of Done

- 合意した分類・失敗時のフォールバックを実装する。
- 差分を確認し、不要な変更がない。
- PR を作成し、GitHub 上の CI 結果を確認する。
