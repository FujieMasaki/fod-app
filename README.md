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

## Architecture

クライアント側の体験を中心にした、Vite + React + TanStack Router構成のアプリケーションです。

ブラウザ上での音声録音や画面遷移など、クライアント側の体験がプロダクトの中心となるため、SPAをベースにしています。

ブラウザ側の状態はSession ProviderとTanStack Queryで管理しています。ルーティングは `src/router.tsx` で定義しています。

## API

`VITE_DOT_API_URL` が設定されている場合、UIから独立したAPIの `dot` エンドポイントを呼び出します。

APIはまだ実装途中のため、環境変数を設定しない場合はローカルのモックレスポンスを使用します。

将来的には、以下をクライアントアプリから分離して管理できる構成を想定しています。

- APIキー
- 音声ファイル
- データの永続化

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
| Tests | `pnpm test` | Vitestによるテスト |
| Build | `pnpm build` | Production Build |

Node.js / pnpmのバージョンは `package.json` から取得し、pnpm storeをキャッシュした上で `--frozen-lockfile` を使用して依存関係をインストールしています。

Dependabotによるnpm / pnpmおよびGitHub Actionsの依存関係更新も設定しています。

## Local Git Hooks

Lefthookを利用してローカルでもチェックを行っています。

### Before commit

ステージされたJavaScript / TypeScriptファイルに対してESLintを実行します。

### Before push

以下を並列で実行します。

- TypeScript type check
- Vitest

Production BuildはローカルでのPushを遅くしないため、CI側で実行しています。

## Status

現在MVPを開発中です。

今後、音声入力からDotの生成・保存・振り返りまでの一連の体験を実装しながら、実際に利用してもらい、フィードバックをもとに改善していく予定です。
