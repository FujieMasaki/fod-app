# フロントエンド AIコードレビュー観点

この文書は、`apps/web/`とWebに影響する変更の固有観点である。対象確定、重大度、出力、LGTM、
改善方法は共通の[`../README.md`](../README.md)を正本とし、開始時に
[`security.md`](./security.md)を必ず読む。実装の責務・状態管理は
[`../../development/frontend.md`](../../development/frontend.md)、プロダクトの振る舞いは関連仕様を正本とする。

## 1. 変更種別ごとの確認

| 変更内容 | 最低限確認する観点 |
| --- | --- |
| すべての変更 | `security.md` |
| `apps/web/src/features/recording/**`, `apps/web/src/libs/audio/**` | 権限要求、録音データの保存・送信・破棄 |
| `apps/web/src/features/session/**` | `localStorage` の保存対象、スキーマ検証、リセット |
| API、fetch、外部SDKの追加 | 認証・認可、レスポンスの最小化、エラー、URL検証 |
| `.env*`、設定、依存、CI変更 | 秘密情報、`VITE_`公開値、supply chain、権限、実行条件 |
| UIでのHTML・URL表示 | XSS、危険なスキーム、open redirect |

## 2. frontend固有の確認

- featureの公開境界と、Component、Hook、`libs/`の責務・依存方向が実装規約に沿うか。feature間で
  内部実装へ直接依存していないかを、公開APIと呼び出し元まで確認する。
- 一時state、Session Provider、TanStack Query、`localStorage`のどれが正本か、同じサーバー正本を
  無条件に二重保存していないか、復元失敗時に安全な表示へ戻るかを確認する。
- 録音変更では、マイク権限が利用者操作に結び付き、開始・停止・unmount・非同期完了の競合で
  stream / AudioContextが残らないかを確認する。Blob、文字起こし、生成結果を扱うなら、受け渡し、
  保存・送信、削除主体を仕様と照合する。
- mutation、キャンセル、再試行、二重実行、schema不正、ネットワーク失敗で、表示と実際のデータ状態が
  一致するかを確認する。正式契約のない暫定`createDot`経路をRails APIの保証として扱わない。
- UI変更では、キーボード操作、ラベル、フォーカス、エラー状態、長い文言・狭い画面での可読性、既存Design
  Tokenへの整合を確認する。将来候補の画面機能をMVP必須として指摘しない。

## 3. メンテナンス履歴

- 2026-09-17: 初版作成。Vite SPA の構成、録音、`localStorage` を考慮したセキュリティ
  レビューを必須化。
- 2026-09-17: 将来のバックエンド指針と独立して管理できるよう、`frontend/` 配下へ移動。
