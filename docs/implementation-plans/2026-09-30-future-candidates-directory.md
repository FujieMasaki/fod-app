# Future Candidates Directory Implementation Plan

## 1. Status

完了（2026-09-30）。

## 2. Goal

`docs/future-candidates.md`を、今後増え続ける将来機能候補を1件ずつ独立したファイルとして
蓄積できるディレクトリ構成に変える。

## 3. Background

- ユーザーから、future-candidates.mdは今後も継続的にアイデアを追加していく前提の文書であり、
  蓄積を前提にディレクトリ化と1候補1ファイル構成にしたいという要望があった。
- 現状は3件（人物タグ・写真/動画の関連付け・年間ダイジェスト生成）を1つのtableに収めた単一ファイル
  であり、Codexの2回のレビューでLGTMを得ている。
- 単一ファイルのまま候補が増え続けると、1ファイルが肥大化し、個々のアイデアの詳細（比較・背景・
  関連リンクなど）を書き足しにくくなる。

## 4. Current State

- `docs/future-candidates.md`: MVP範囲外の将来機能候補（人物タグ・写真/動画の関連付け・年間
  ダイジェスト生成）をtable形式で持つ単一ファイル。
- `docs/code-review/frontend/`・`docs/code-review/backend/`が、README.md + トピック別ファイルという
  ディレクトリ構成の先例としてある。
- AGENTS.md、`docs/product-vision.md`、ルートの`README.md`が`docs/future-candidates.md`を参照している。

## 5. Scope and Non-goals

### 対象

- `docs/future-candidates.md`を`docs/future-candidates/README.md`へ移し、ディレクトリの位置づけと
  候補一覧の索引を持たせる。
- 既存3候補を`docs/future-candidates/`配下の個別ファイルへ分割する（`person-tags.md`、
  `photo-video.md`、`annual-digest.md`）。
- 参照元（AGENTS.md、`docs/product-vision.md`、ルートの`README.md`）のリンクを新しいパスへ更新する。

### 今回の対象外

- 新しい候補の追加（今回は既存3件の移行のみ）。
- 各候補ファイルの内容を大幅に拡充すること。移行時点では既存の一言説明を維持する。
- `docs/implementation-plans/2026-09-30-product-vision.md`の書き換え。同Planは当時の記録として
  そのまま残す。

### 未決定で、今回確定しない事項

- 候補ファイルの命名規則の厳密なルール、候補が実装検討段階に進んだときの削除・移動のタイミング。

## 6. References and Documents to Update

- 参照: `docs/code-review/frontend/README.md`（ディレクトリ構成の先例）。
- 更新: AGENTS.md、`docs/product-vision.md`、ルートの`README.md`。
- 新規: `docs/future-candidates/README.md`、`docs/future-candidates/person-tags.md`、
  `docs/future-candidates/photo-video.md`、`docs/future-candidates/annual-digest.md`。
- 削除: `docs/future-candidates.md`。

## 7. Proposed Approach

1. `docs/future-candidates/README.md`を新設し、旧`future-candidates.md`の冒頭説明と
   「この文書の位置づけ」を移し、候補一覧を各ファイルへのリンク付き索引にする。
2. 既存3候補を、それぞれ`docs/future-candidates/person-tags.md`、`photo-video.md`、
   `annual-digest.md`へ分割する。各ファイルは概要・関連を持つ。
3. `docs/future-candidates.md`を削除する。
4. AGENTS.md、`docs/product-vision.md`、ルートの`README.md`のリンクを
   `docs/future-candidates/README.md`へ更新する。

## 8. Why This Approach

- README.md + トピック別ファイルという形は、`docs/code-review/`や将来の`docs/development/`拡張でも
  使われている構成であり、新しいパターンを持ち込まない。
- 候補ごとに独立したファイルにすることで、将来アイデアが増えても1ファイルが肥大化せず、個々の候補の
  背景・比較を書き足しやすくなる。
- 索引をREADME.mdに集約することで、AGENTS.mdの必読文書からは引き続き1つのURLで一覧へ到達できる。

## 9. Data Flow

文書のみの変更であり、プロダクトのデータフロー・API・Storageは変更しない。

## 10. Files to Change

- 新規: `docs/future-candidates/README.md` — ディレクトリの位置づけと候補の索引。
- 新規: `docs/future-candidates/person-tags.md`、`photo-video.md`、`annual-digest.md` — 候補ごとの
  独立ファイル。
- 削除: `docs/future-candidates.md`。
- 変更: AGENTS.md、`docs/product-vision.md`、ルートの`README.md` — リンク先を
  `docs/future-candidates/README.md`へ更新。

## 11. Libraries / APIs

なし。

## 12. Alternatives Considered

- 単一ファイルのまま候補を増やし続ける案: 現状はシンプルだが、今後継続的に追加する前提だと
  1ファイルが肥大化し、個々の候補の詳細を書きにくくなるため採用しない。
- 候補ごとに機能仕様（`docs/<feature>.md`）を直接作る案: まだ実装方針が決まっていない段階で
  `product.md`の検証候補・将来候補に相当する重みを持たせてしまうため採用しない。future-candidatesは
  あくまで未検討のアイデア置き場として維持する。

## 13. Risks / Things to Watch

- ファイルが増えすぎて索引（README.md）の更新が漏れるリスク。候補を追加・削除する際は必ず
  README.mdの索引も同じ変更で更新する。
- 実装検討段階に進んだ候補をfuture-candidates/配下に残したままにしないよう、昇格時の削除を
  徹底する必要がある。

## 14. Verification

### Manual

- 全リンク（AGENTS.md、product-vision.md、ルートのREADME.md）が
  `docs/future-candidates/README.md`または各候補ファイルを正しく指しているか確認する。
- `git diff --check`で意図しない変更がないか確認する。

### Automated

- 文書のみの変更のため、アプリケーションtest / lintは対象外。pre-commit / pre-push hookは通過させる。

## 15. Definition of Done

- `docs/future-candidates.md`が削除され、`docs/future-candidates/README.md` + 候補ごとのファイルに
  置き換わっている。
- AGENTS.md、`docs/product-vision.md`、ルートの`README.md`のリンクが新しいパスを指している。
- 全diffを確認し、人間が説明できる。

## 16. Completion Record

- 状態: 2026-09-30に完了。
- 実装差異: なし。Planどおりに実装した。
- 検証結果: AGENTS.md・docs/product-vision.md・README.mdのリンクを目視確認、全diff確認、
  pre-commit / pre-push hook（lint・type-check・test）通過を確認した。
- 関連: PR #43（https://github.com/FujieMasaki/fod-app/pull/43）。
