# Architecture

この文書は、Focus on Dotの現在の実装と、将来に向けて決定済み・未決定の事項を区別して
記録する。将来方針は、実装が追加されるまで実装済みとして扱わない。

## 実装済み

- 現在稼働しているFrontendは `apps/web/` のVite + React + TypeScript SPAである。
- TanStack Routerが `apps/web/src/router.tsx` で `/`、`/record`、`/processing`、`/dot`、
  `/reflection` のクライアントルートを管理する。
- `apps/web/src/providers.tsx` がTanStack QueryとSession Providerを提供する。
- Session ProviderはReact stateを画面間で共有し、録音時間と現在のDot sessionを
  `fod.session.v1` というkeyでブラウザの `localStorage` に保存・復元する。
- Dot生成はTanStack Queryのmutationから呼び出す。`VITE_DOT_API_URL` が設定されている場合は
  `dot` endpointへPOSTし、設定されていない場合はローカルmockをZodで検証して返す。
- 録音処理はブラウザのMediaDevices / MediaRecorder APIを利用する。
- Frontendのbuild、test、型検査設定とweb固有dependencyは `apps/web/` が管理する。
- `apps/api/` はRuby on RailsのAPI backendである。現在実装済みなのはRails基盤、
  PostgreSQL接続、RSpec、品質・security検査、CIまでである。
- `apps/api/` の公開APIは将来 `/api/v1` namespaceに追加する。
- repository全体のコマンド、ESLint、Lefthook、命名チェック、CI、開発文書はrootが管理する。

## 決定済み

- Frontendは `apps/web/` に配置する。
- Backendは `apps/api/` にRuby on Railsで配置する。
- FrontendとBackendは同じrepositoryで管理する。
- アプリケーション機能としてのAI処理はBackend側に置く。
- 開発支援AIに関する指示・文書・workflowはroot、`docs/`、`.github/` 側で管理する。
- User、認証、Dot、音声、AI処理は将来の変更で実装する。
- 最初のプロダクトAPIをWebから利用する変更で、API契約の管理を始める。その時点ではOpenAPIを
  推奨候補とするが、型生成・生成物の管理・契約検証toolは別の判断とする。
- API、Web、契約は同じPRで更新する。同一PRでもWebとAPIのデプロイ時差があり得るため、
  request / responseの互換性と段階的な配布を考慮する。

## 未決定

- プロダクト機能を追加する際のRails内部architectureとdirectory構成
- 認証方式
- background job基盤
- API契約でOpenAPIを採用するか、採用時の型生成・生成物管理・検証方法
- AI providerとその実装方法

これらは、関連仕様と個別のImplementation Planで選択肢・影響を確認した上で、後続の変更で決定・実装する。
