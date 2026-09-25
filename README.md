# Focus on Dot

「自分の声を聴き、自分に戻る時間をつくる」をテーマにした、音声ジャーナリングアプリです。

現在、個人開発として設計・開発を進めています。

## About

日々考えていることや感じていることを音声で話し、振り返ることで、自分の状態や考えを整理できるサービスを目指しています。

文章を書くジャーナリングよりも気軽に、自分の言葉をそのまま残せる体験をつくることを目的としています。

現在はMVP開発段階で、まずは以下の基本的な体験を中心に開発しています。

- 音声で振り返りを残す
- 振り返った内容をDotとして蓄積する
- 過去のDotを見返す

## このプロジェクトで取り組んでいること

Focus on Dotでは、実装だけではなく、個人プロダクトとして以下を一貫して行っています。

- プロダクトコンセプトの整理
- MVPの要件整理
- ユーザーフロー・画面構成の検討
- 技術選定
- フロントエンド設計・実装
- テスト・CIなどの開発環境整備

まだ開発途中のため、仕様や設計についても検証しながら継続的に改善しています。

## Tech Stack

### Frontend

- TypeScript
- React
- Vite
- TanStack Router
- TanStack Query
- Zod

### Development

- pnpm
- Vitest
- ESLint
- Lefthook
- GitHub Actions

### Backend

- Ruby on Rails API-only
- PostgreSQL
- RSpec

## Architecture

クライアント側の体験を中心にした、Vite + React + TanStack Router構成のアプリケーションです。

ブラウザ上での音声録音や画面遷移など、クライアント側の体験がプロダクトの中心となるため、SPAをベースにしています。

ブラウザ側の状態はSession ProviderとTanStack Queryで管理しています。ルーティングは `apps/web/src/router.tsx` で定義しています。

```text
apps/
├── web/  # 現在稼働しているVite + Reactアプリ
└── api/  # Rails API基盤（プロダクトAPIは未実装）
```

Frontendと将来のBackendを同じrepositoryで管理します。実装済み・決定済み・未決定の区別は [`docs/architecture.md`](docs/architecture.md) を参照してください。

## API

`VITE_DOT_API_URL` が設定されている場合、UIは`${VITE_DOT_API_URL}/dot`へ本文なしのPOSTを行います。
これは体験確認用の暫定接続点であり、RailsのプロダクトAPI、音声送信、認証、保存の仕様ではありません。

環境変数を設定しない場合は、ローカルのモックレスポンスを使用します。Railsには現在`GET /up`だけがあり、
User、認証、Dot、音声、AI処理のプロダクトAPIは未実装です。

将来的には、以下をクライアントアプリから分離して管理できる構成を想定しています。

- 認証と利用者単位の保存
- 音声ファイルの送信・保持
- AI処理とデータの永続化

## Documentation

| 文書 | 役割 |
| --- | --- |
| [`docs/product.md`](docs/product.md) | MVPの目的、範囲、作らないこと、未決定事項 |
| [`docs/journaling.md`](docs/journaling.md) | 録音から振り返りまでの現行仕様とMVP受け入れ条件 |
| [`docs/dot-history.md`](docs/dot-history.md) | 複数Dotの履歴体験と時間軸の検証候補 |
| [`docs/architecture.md`](docs/architecture.md) | 現在の構成と継続する設計判断 |
| [`docs/development/`](docs/development/) | frontend / backend実装時の判断基準 |
| [`docs/code-review/`](docs/code-review/) | frontend / backendレビューの確認・報告方法 |
| [`docs/implementation-plans/`](docs/implementation-plans/) | 変更単位の判断と検証履歴 |

AI作業時の必読順と更新ルールは[`AGENTS.md`](AGENTS.md)を参照してください。

## Getting Started

Node.js 22 / pnpm 11.16.0を使用します。

依存関係をインストールします。

```bash
pnpm install --frozen-lockfile
```

開発サーバーを起動します。

```bash
pnpm dev
```

Viteで表示されたURL（通常は `http://localhost:5173`）をブラウザで開きます。

## CI

GitHub Actionsでは、Pull Request・`main` へのPush・手動実行時に以下をチェックします。

| Check | Command | 内容 |
| --- | --- | --- |
| ESLint | `pnpm check` | 静的解析 |
| TypeScript | `pnpm type-check` | 型チェック |
| Tests | `pnpm test` | 命名チェッカー自身のtestとVitest |
| Build | `pnpm build` | Production Build |

Node.js / pnpmのバージョンは `package.json` から取得し、pnpm storeをキャッシュした上で `--frozen-lockfile` を使用して依存関係をインストールしています。

Dependabotによるnpm / pnpmおよびGitHub Actionsの依存関係更新も設定しています。

## Local Git Hooks

Lefthookを利用してローカルでもチェックを行っています。

### Before commit

ステージされたJavaScript / TypeScriptファイルに対してESLintを実行し、`apps/web/src` の対象ファイルがある場合は命名チェックも実行します。

### Before push

以下を並列で実行します。

- TypeScript type check
- Vitest

Production BuildはローカルでのPushを遅くしないため、CI側で実行しています。

## Claude Codeでのタスク実行

実装系のタスク（`docs/tasks/`）は、Claude Codeに「TASK-008を進めて」と依頼するか、`/run-task TASK-008` と入力すると、着手可否の確認からPR作成まで止まらずに進みます。自然文でもSkillは起動しますが、確実に起動したいときは `/run-task` を使ってください。対象の条件は[`docs/tasks/README.md`](docs/tasks/README.md)を参照してください。

| Hook | 対象 | 内容 |
| --- | --- | --- |
| Stop | `claude/task-*` ブランチ | CI相当の検査（変更範囲はCIと同じ判定）、コミット・push・PRの有無を確かめ、満たすまで作業に差し戻す |
| PreToolUse | すべて | `--no-verify`、force push、mainへのpush、送信先を明示しないpush、`gh pr merge`、帰属トレーラーを拒否する |
| PostToolUse | `claude/task-*` ブランチ | 編集したファイルだけESLint / RuboCopを実行し、結果をClaudeに返す |

無人で進めるため、セッションは `acceptEdits`（またはauto）のpermission modeで開始してください。`bypassPermissions` は使いません。

## Status

現在MVPを開発中です。

今後、音声入力からDotの生成・保存・振り返りまでの一連の体験を実装しながら、実際に利用してもらい、フィードバックをもとに改善していく予定です。
