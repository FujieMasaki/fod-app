# API

このディレクトリには、Focus on DotのRuby on Rails API backend基盤があります。

現時点で実装済みなのはRails application、PostgreSQL接続、RSpec、品質・security検査、
CIまでです。User、認証、Dot、音声、AI処理などのプロダクトAPIはまだ実装していません。
公開APIは、将来 `/api/v1` namespaceに追加することを規約とします。

repository全体の構成と、実装済み・決定済み・未決定の区別は
[`docs/architecture.md`](../../docs/architecture.md) を参照してください。

実装時の責務・境界は[`docs/development/backend.md`](../../docs/development/backend.md)、レビュー時の
確認方法は[`docs/code-review/backend/README.md`](../../docs/code-review/backend/README.md)を参照してください。
最初のプロダクトAPIをWebから利用する変更で契約管理を始めます。OpenAPIはその時点の推奨候補ですが、
今回の基盤には導入していません。

## Requirements

- Ruby 3.4.10
- Rails 8.1.3.1
- PostgreSQL 17（CIで利用するmajor version。開発環境でも17を推奨）

## Setup

`apps/api` に移動してdependencyをinstallし、databaseを準備します。

```sh
bundle install
bin/rails db:prepare
```

serverは次のcommandで起動します。

```sh
bin/rails server
```

起動確認用のhealth endpointは `GET /up` です。

## Verification

```sh
bundle exec rspec
bundle exec rubocop
bundle exec brakeman --no-pager
bundle exec bundler-audit check --update
```

## UUID conventions

将来生成するActive Record modelのprimary keyは、`config/application.rb` のgenerator設定により
UUIDになります。UUID primary keyを参照するforeign keyも、migrationで `type: :uuid` を
明示するなど、UUID型になっていることを必ず確認してください。

Active Storageのmigrationはまだ導入していません。将来 `active_storage:install` を行う際は、
`record_id` などの参照列を含め、生成されたprimary key / foreign keyがapplicationのUUID方針と
一致することをmigration適用前に確認してください。
