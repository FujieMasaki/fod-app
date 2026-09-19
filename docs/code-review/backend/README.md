# バックエンド AIコードレビュー指針

この文書は、`apps/api/`を含む変更をレビューするときの入口である。実装方法の正本は
[`../../development/backend.md`](../../development/backend.md) とし、ここでは何を確認し、
どう報告するかを定める。開始時に必ず[`security.md`](./security.md)を読む。

## 1. レビュー手順

1. 関連するproduct / 機能仕様、architecture、Implementation Planを読み、受け入れ条件と対象外を
   把握する。
2. 全差分を読み、判断に必要なroute、Controller、Model、migration、test、Webの呼び出し側、設定を
   確認する。
3. security、責務・依存、状態遷移、API契約・互換性、test不足の順に確認する。
4. 事実、前提に依存する推測、修正が必要な問題、任意の改善を分けて報告する。

ローカルで依頼されたレビューはチャットに出力する。明示的な依頼なしに外部サービスへ投稿、承認、
変更しない。

## 2. 確認項目

- 仕様と受け入れ条件に一致し、対象外を勝手に実装していないか。
- Controller、Model、追加したService / Jobの責務と依存方向が
  [backend実装規約](../../development/backend.md)に沿うか。
- requestごとに認証・認可を行い、他人のDotや関連resourceへアクセスできないか。
- parameterの許可範囲、validation、DB制約、transaction、異常系、再試行・重複実行の扱いが妥当か。
- request / response / errorの契約がWebと一致し、不要な属性や内部エラーを返さず、段階的デプロイ時の
  互換性を考慮しているか。
- 録音、文字起こし、生成結果、個人データの保存・送信・削除・ログ出力が仕様どおりか。
- request spec、model spec、Service / Job specのうち、変更したリスクを検証するtestがあるか。

## 3. 重大度と報告

| 重大度 | 定義 | 対応 |
| --- | --- | --- |
| 🔴 Critical | 情報漏洩、認可突破、他人のDot操作、音声の意図しない外部送信に直結する | マージ前に必ず対応 |
| 🟠 High | 永続データの破損、重複生成、重大なAPI互換性破壊、悪用されやすい入力不備 | 原則マージ前に対応 |
| 🟡 Medium | 異常系・test・運用上の防御が不足し、限定した条件で不具合になる | 対応を推奨 |
| 🔵 Low | 可読性などの任意改善 | 任意 |

各指摘は次の形式を使う。根拠が不足するときは「要確認」として前提を明記する。Critical、High、
Mediumがなければ`LGTM`と明記する。

```text
🟠 [タイトル]
場所: apps/api/path/file.rb:12
根拠: 仕様または実装上確認できる事実。
影響: 起こり得る利用者・データ・互換性への影響。
修正案: 実装可能な対応。
区分: 修正が必要 / 任意改善 / 要確認（前提: ...）
確信度: 高 / 中 / 低
```

## 4. 変更種別ごとの追加確認

| 変更 | 追加で確認すること |
| --- | --- |
| route / Controller | 認証前提、resourceの所有権、strong parameters、status code、error response |
| Model / migration | validationとDB制約、UUID foreign key、data migration、rollback、既存dataへの影響 |
| AI / storage / 外部API | 送信内容の最小化、timeout、failure、再試行、冪等性、ログ・削除 |
| Job | enqueueのtransaction境界、重複実行、retry、dead letter相当の観測方法 |
| WebとAPIの同時変更 | request / response schema、互換性、同一PRでの更新、デプロイ時差 |
| auth / CORS / CSRF | 採用した認証方式、Cookieかtokenか、配信origin、ブラウザからの利用経路 |
