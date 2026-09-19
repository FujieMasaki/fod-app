# Rails API Foundation Implementation Plan

## 1. Goal

`apps/api` にRuby 3.4.10 / Rails 8.1.3.1 / PostgreSQLのAPI-only基盤を追加し、
ヘルスチェック、RSpec、品質・セキュリティ検査、GitHub Actionsで継続的に検証できる
状態にする。User、認証、Dot、音声、AIなどのプロダクト機能は今回の対象外とする。

## 2. Background

- 現在の `apps/api` は将来のRails配置場所を説明するREADMEだけで、実行可能なBackendがない。
- monorepoのFrontend CIを維持したまま、Backend開発を始めるための最小基盤が必要である。
- 将来のActive RecordモデルはPostgreSQL UUID主キーを使うため、最初のmigrationより前に
  generator設定を固定する必要がある。
- Rails標準生成物は要件より広いため、不要なframework・ツールを生成時から除外する。

## 3. Current State

- `apps/web` はVite + React + TypeScriptのSPAで、Frontendのbuild、lint、型検査、testがある。
- rootの `.github/workflows/ci.yml` はFrontend向けの4 jobを実行している。
- `apps/api/README.md` はRailsを将来導入する場所だと説明しているだけである。
- `docs/architecture.md` はBackend、認証、job、Rails CIを未実装・未決定としている。
- root `.gitignore` にはNode / Frontend向け設定だけがあり、Railsのruntime生成物は未設定である。
- 参照指定された `personal-conventions.md` はrepository内および親directoryに存在しないため、
  root `AGENTS.md` と依頼文を作業規約として扱う。

## 4. Proposed Approach

1. Ruby 3.4.10上のRails 8.1.3.1で `rails new --help` を確認し、指定フラグの存在を検証する。
2. 指定された生成コマンドを使い、既存READMEの衝突だけはThorの `--skip` で保護して
   `apps/api` にAPI-only Rails applicationを生成する。`--force` は使わない。
3. Gemfileを指定されたruntime / development / test依存だけに整理し、bundle installする。
4. `config/application.rb` にUUID、RSpec、FactoryBotのgenerator設定を同じblockで追加する。
5. RSpecを正規のgeneratorで初期化し、FactoryBot syntax methodsをRSpecへ組み込み、
   `/up` の成功を検証する最小request specを追加する。
6. RuboCopのplugin形式設定を追加し、Rails / RSpec向けCopを有効化する。
7. root CIへPostgreSQL 17 serviceを使うRails jobを追加する。
8. root `.gitignore`、`apps/api/README.md`、`docs/architecture.md` を現状に合わせて更新する。
9. Rails・Frontend双方を検証し、全diffと不要生成物・secret混入を確認する。

## 5. Why This Approach

- Rails generatorを指定バージョン・明示的skip flagsで使うことで、Rails 8.1.3.1の標準構成を
  土台にしつつ、依頼範囲外の機能を最初から持ち込まない。
- 既存READMEを生成時にスキップし、その後に必要事項を統合することで、既存の説明と履歴を
  保ったまま実行可能なBackendの説明へ更新できる。
- UUIDをmodel作成前にgeneratorへ設定することで、確認用modelやmigrationを作らずに、
  将来の主キー型を一貫させられる。
- root CIへ独立したRails jobを追加するため、既存Frontend jobのtrigger、command、working
  directoryを変更せずにBackend検証を追加できる。

## 6. Data Flow

今回プロダクトデータのflowは追加しない。動作確認のflowは次のとおり。

```text
HTTP GET /up
↓
Rails routing
↓
Rails health endpoint
↓
HTTP 200 response
↓
RSpec request spec
```

DBはRailsのenvironment別設定をsource of truthとし、CIではPostgreSQL 17 serviceへ接続して
`db:prepare` のみを実行する。プロダクトtableやseed dataは追加しない。

## 7. Files to Change

- 新規: `apps/api/.ruby-version` — Backendで利用するRuby 3.4.10を固定する。
- 新規: `apps/api` 配下のRails標準基盤 — API application、framework設定、bin scripts、
  PostgreSQL設定、Mailer基盤、storage設定を提供する。
- 変更: `apps/api/Gemfile` / 新規: `apps/api/Gemfile.lock` — 指定dependencyとversionを固定する。
- 変更: `apps/api/config/application.rb` — UUID / RSpec / FactoryBot generator方針を設定する。
- 新規: `apps/api/.rspec`、`apps/api/spec/*` — RSpec初期設定、FactoryBot連携、`/up` request spec。
- 新規: `apps/api/.rubocop.yml` — Rails / RSpec plugin形式のlint設定。
- 変更: `.github/workflows/ci.yml` — PostgreSQL 17を使うRails検証jobを追加する。
- 変更: `.gitignore` — `apps/api` のlog、tmp、storage、secret、local env、test一時物を除外する。
- 変更: `apps/api/README.md` — 既存内容を残しつつ、導入済み基盤と利用方法を記載する。
- 変更: `docs/architecture.md` — Frontend / Backendの現在の実装範囲を更新する。
- 新規: 本Plan — 実装判断、対象範囲、検証方法を記録する。

## 8. Libraries / APIs

- Rails 8.1.3.1: API-only application、Active Record / Job / Storage、Action Controller / Mailer。
- `pg`: PostgreSQL adapter。
- `puma`: Rails HTTP server。
- `bootsnap`: application boot高速化。
- `tzinfo-data`: Windows / JRuby platform向けtimezone data。
- `rspec-rails`: Rails向けtest framework。
- `factory_bot_rails`: 将来のtest data factory基盤。今回はfactory自体を作らない。
- `rubocop`、`rubocop-rails`、`rubocop-rspec`、`rubocop-rspec_rails`: Ruby / Rails / RSpec lint。
- `brakeman`: Rails静的security検査。
- `bundler-audit`: lockfile dependency vulnerability検査。

`rack-cors`、authentication、serializer、background job backend、cloud storage、AI関連Gemは、
具体的な仕様がないため追加しない。

## 9. Alternatives Considered

- 手作業でRails構成を再現する案: 生成時の標準構成との差分が不透明になるため採用しない。
- `rails new --force` 後にREADMEを復元する案: 既存ファイルを一度上書きするため採用しない。
- Rails標準のMinitest / RuboCop Omakase / 生成CIを残す案: 指定toolchainと重複するため採用しない。
- `rack-cors` を先行設定する案: origin、Cookie、CSRF設計が未決定なため後続PRへ送る。

## 10. Risks / Things to Watch

- Rails generatorが不要なAction Mailbox / Text / Cable、Solid、Docker、Kamal等を残していないか
  生成後とdiff確認時に検査する。
- Action Mailerをskipせず、framework、`ApplicationMailer`、標準layoutだけを保持する。
- Active Storageはframeworkと標準 `storage.yml` のみにし、migrationやprovider設定を追加しない。
- UUID primary keyだけではforeign key型は自動保証されないため、将来migrationでは `type: :uuid`
  等を明示して確認する。Active Storage install時も `record_id` 等の型を確認する。
- `bundler-audit --update` はnetworkへ依存するため、実行不能時は理由を明示する。
- local PostgreSQLの状態によって `db:prepare` が失敗する場合は、CI相当のPostgreSQL 17環境でも
  検証し、環境要因とapplication要因を分離する。

## 11. Verification

### Manual

- `rails routes` で `/up` が存在し、プロダクトAPI routeが追加されていないことを確認する。
- 生成物、Gemfile、framework load、Mailer、storage設定を目視確認する。
- 全diffでFrontendの不要変更、secret、不要Gem、不要directoryがないことを確認する。

### Automated

- `bundle exec rubocop`
- `bundle exec brakeman --no-pager`
- `bundle exec bundler-audit check --update`
- `bin/rails db:prepare`
- `bundle exec rspec`
- `pnpm build`
- `pnpm check`
- `pnpm type-check`
- `pnpm test`

## 12. Definition of Done

- Ruby 3.4.10 / Rails 8.1.3.1 / PostgreSQLのAPI-only基盤が `apps/api` で起動可能である。
- 指定frameworkとMailer / Storage基盤が残り、対象外の機能・Gem・migrationが存在しない。
- UUID、RSpec、FactoryBot generator設定がmodel作成前に有効である。
- `/up` request spec、RuboCop、Brakeman、bundler-audit、`db:prepare` が成功する。
- PostgreSQL 17を使うRails CIが追加され、既存Frontend CI構成を壊していない。
- READMEとarchitecture文書が現在の実装範囲と将来の注意事項を正確に説明する。
- 全diffを確認し、依頼に無関係な変更やsecretがない。
