# TASK-027: 紹介ページ（LP）のローカルプレビュー

| 項目 | 内容 |
| --- | --- |
| ID | TASK-027 |
| タスク名 | 紹介ページ（LP）のローカルプレビュー |
| 対象領域 | Frontend |
| 作業区分 | 実装 |
| 優先度 | MVP外 |
| 状態 | In progress |

## 目的と作業範囲

開発中のFocus on Dotが「どういうアプリを目指して作っているか」を共有する紹介ページ（LP）を、既存のdesign-systemとtokenで組み、
手元のブラウザで見た目を確かめられるようにする。MVPの範囲（[product.md](../product.md)）や実装の優先順位は変えない。

掲載原稿の正本を文書に置き、LPは`AppShell`のモバイル用フレームの外に置くため、別の入口（`apps/web/landing.html`）から描く。
本番のbuildには入れない。

対象外: 公開・配信・デプロイ、OGP・meta、アクセス解析、実際のスクリーンショットの撮影、登録・ウェイトリスト・フォーム
（個人データを集めない）。公開するときの置き場所は、公開を決めるときにarchitectureとあわせて判断する。

## 確認可能な完了条件

- [ ] 掲載原稿の正本`docs/landing-page.md`があり、将来の体験は「目指している体験」、いま開発している範囲は1か所にまとめて書き分けている。
- [ ] `http://localhost:3210/landing.html`でLPが開け、`pnpm build`の出力に`landing.html`が入らない。
- [ ] 幅390pxと1280pxで横スクロールが出ず、本文の1行が読む幅で止まる。
- [ ] スクリーンショットの位置が仮枠として分かり、未実装の画面を描いていない。
- [ ] `pnpm lint`・`pnpm type-check`・`pnpm test`が通る。

## 依存するタスクID

なし。

## 根拠となる仕様書と見出し

- [product-vision.md](../product-vision.md)
- [product.md](../product.md)
- [privacy.md](../privacy.md) §5
- [dot-history.md](../dot-history.md) §2「丸の表現」・§3・§4
- [design-system.md](../design-system.md)

## 必要な検証

- 手元のブラウザで、幅390pxと1280pxの見た目と、キーボードでのページ内リンクの移動・フォーカスの見え方を確かめる。

## 関連Implementation Plan

- `docs/implementation-plans/2026-10-28-landing-page-preview.md`（実装のPRで追加する）
