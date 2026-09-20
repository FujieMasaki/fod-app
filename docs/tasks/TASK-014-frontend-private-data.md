# TASK-014: 削除要求のFrontend導線と個人データの端末管理

| 項目 | 内容 |
| --- | --- |
| ID | TASK-014 |
| タスク名 | 削除要求のFrontend導線と個人データの端末管理 |
| 対象領域 | Frontend |
| 作業区分 | セキュリティ・プライバシー |
| 優先度 | P1 |
| 状態 | Blocked |

## 目的と作業範囲

利用者が決定した手段で削除を求め、その結果と保持状態を理解できるようにする。Session Provider / localStorage / 通信cache等の個人データを保持方針へ合わせる。認証の開始・終了そのものはTASK-007が担当する。

## 確認可能な完了条件

- [ ] TASK-002で決めた削除要求の手段へWebから到達でき、対象・結果・失敗時の次の操作を理解できる。操作の方式は事前に確定した仕様に従う。
- [ ] 削除結果をDay・一覧・詳細とstate/cacheへ反映し、失敗なのに削除済み、削除済みなのに保存中として見せない。
- [ ] 既存fod.session.v1の扱いを決定どおり実装し、mockや旧ローカルデータを本人のserver保存済み履歴へ無条件に混ぜない。
- [ ] 認証終了・失効・利用者切り替えで、前利用者のDotや録音時間を表示・復元しない。処理中の古いresponseで再表示されない。
- [ ] 音声Blobと文字起こしをbrowserへ永続化せず、採用した端末保持の正本・期間・消去方法をjournaling / architectureへ反映している。

## 依存するタスクID

- TASK-002
- TASK-005
- TASK-007
- TASK-011
- TASK-012
- TASK-013

依存関係の上流にある設計判断・API契約が未確定のためBlocked。確定後は依存先の提供状況を確認して着手する。

## 根拠となる仕様書と見出し

- [product.md](../product.md) — 「2. MVPで成立させる体験と完成条件」
- [product.md](../product.md) — 「4. MVP対象外と実装前に決めること」
- [journaling.md](../journaling.md) — 「1. 現在実装されているflow」
- [journaling.md](../journaling.md) — 「2. データと正本」
- [journaling.md](../journaling.md) — 「4. 実サービスのMVP受け入れ条件」

## 必要な検証

- 削除成功/失敗、選択中のDot削除、削除中の画面移動、再読込後の表示を確認。
- 利用者A→認証終了→利用者B、認証失効、旧fod.session.v1あり/不正値、遅延responseでの端末データと表示を検証。

## 関連Implementation Plan

未作成。着手時にAGENTS.mdの規約に従って作成し、ここへリンクを追記する。
