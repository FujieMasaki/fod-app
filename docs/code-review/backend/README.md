# バックエンド AIコードレビュー観点

この文書は、`apps/api/`とRailsに影響する変更の固有観点である。対象確定、重大度、出力、LGTM、
改善方法は共通の[`../README.md`](../README.md)を正本とし、開始時に
[`security.md`](./security.md)を必ず読む。実装方法の正本は
[`../../development/backend.md`](../../development/backend.md)である。

## 1. backend固有の確認

- 仕様と受け入れ条件に一致し、対象外を勝手に実装していないか。
- Controller、Model、実際に追加したService / Jobの責務と依存方向が
  [backend実装規約](../../development/backend.md)に沿うか。個人Rails規約の責務分離も確認するが、
  1つのactionで読み切れる処理にService / Serializer / Jobを未導入というだけで指摘しない。
- requestごとに認証・認可を行い、他人のDotや関連resourceへアクセスできないか。
- parameterの許可範囲、validation、DB制約、transaction、異常系、再試行・重複実行の扱いが妥当か。
- request / response / errorの契約がWebと一致し、不要な属性や内部エラーを返さず、段階的デプロイ時の
  互換性を考慮しているか。
- 録音、文字起こし、生成結果、個人データの保存・送信・削除・ログ出力が仕様どおりか。
- request spec、model spec、Service / Job specのうち、変更したリスクを検証するtestがあるか。

`docs/development/backend.md`で保留しているService、Serializer、Job、OpenAPI、認証方式は、採用済みの
前提としてレビューしない。複数model更新、外部I/O、複雑な業務手順、responseの境界などが増え、現在の
配置では責務・transaction・認可が読み取れないという根拠がある場合にだけ、分離を修正案または要確認にする。

## 2. 変更種別ごとの追加確認

| 変更 | 追加で確認すること |
| --- | --- |
| route / Controller | 認証前提、resourceの所有権、strong parameters、status code、error response |
| Model / migration | validationとDB制約、UUID foreign key、data migration、rollback、既存dataへの影響 |
| AI / storage / 外部API | 送信内容の最小化、timeout、failure、再試行、冪等性、ログ・削除 |
| Job | enqueueのtransaction境界、重複実行、retry、dead letter相当の観測方法 |
| WebとAPIの同時変更 | request / response schema、互換性、同一PRでの更新、デプロイ時差 |
| auth / CORS / CSRF | 採用した認証方式、Cookieかtokenか、配信origin、ブラウザからの利用経路 |
