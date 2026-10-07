# Implementation Plan: 人間のレビュー用ガイドにコードリーディングガイドを加える

## 1. Status

完了（PR #80。サブエージェント・Codexとも`b98565d`でLGTM。人間のレビュー待ち）

## 2. Goal

人間のレビュー用ガイドに、人間がコードを読みながら自分で理解するための「地図」を毎回入れる。人間が書いた理解を
貼ると、AIがそこで初めて答え合わせをする。

## 3. Background

- これまでのガイドは、確認項目・実例・OKの基準をまとめたもので、人間は答えを先に読む形になっていた。
- 人間が自分でコードを読み、理解を整理してからAIに答え合わせを頼む流れを作りたい、という依頼があった
  （2026-10-07）。TASK-012のガイドで試し、毎回入れることになった。

## 4. Current State

- `.claude/skills/human-review-artifact/SKILL.md`: ガイドは5節（見るところ・全体像・確認すること・決めたこと・
  ファイルの場所）。答え合わせの手順はない。
- 参考ページ: PR #45のガイド（5節の版）。

## 5. Scope and Non-goals

- 対象: `human-review-artifact`の節の構成、答え合わせの手順、description。
- 対象外: `pr-review-cycle`・`run-task`の手順（どちらもこのskillを呼ぶだけで、節の構成に触れていない）。
  過去のPlan（2026-10-01）の「5節」の記述（当時の記録のため）。

## 6. References and Documents to Update

- 参照: AGENTS.md、`docs/development/pull-requests.md`（人間がレビューする時機）、`docs/code-review/documentation.md`。
- 更新: `.claude/skills/human-review-artifact/SKILL.md`。ほかの現行文書は節の構成に触れていないため更新しない。

## 7. Proposed Approach

1. 「全体像」と「確認すること」の間に「コードリーディングガイド」を置き、6つの小見出し（ファイルの分類・優先して
   読むファイル・ASCIIのデータフロー・問い・深掘りポイント・自分の理解の入力欄）に固定する。
2. 書いてよい粒度を、層・ファイル単位のつながりまでとする。関数の中の処理、関数単位の呼び出し関係、設計の理由は
   書かない。
3. 「自分の理解」はlocalStorageに保存し、識別子・PRのURL・LGTMのコミットを含む依頼文ごとコピーできるようにする。
4. 手順5「答え合わせ」を加える。LGTMのコミットを根拠にし、コードの誤りが分かったら人間のレビューの指摘として扱う。

## 8. Why This Approach

- 節の位置: 全体像で大枠を見た後、確認項目の実例（答えに近い）を見る前に、自分で読む段階を置くため。
- 粒度の線引き: 地図が無いと読み始められず、関数単位まで書くと答えになるため、層・ファイル単位で切る。
- 依頼文にPRとコミットを入れる: 答え合わせは別の会話で頼まれることがあり、根拠にするコードを特定するため。
- 答え合わせの中の問題を修正の流れへ渡す: 人間のレビューは統合の前の1回だけなので、説明で終わると見落とすため。

## 9. Data Flow

アプリのデータフローの変更はない。作業の流れは次のとおり。

```text
AIがガイドに地図を載せる
↓
人間がコードを読み、「自分の理解」に書く（localStorage）
↓
「答え合わせ用にコピー」→ チャットに貼る
↓
AIがLGTMのコミットを根拠に答え合わせする（問題があれば修正の流れへ）
```

## 10. Files to Change

- `.claude/skills/human-review-artifact/SKILL.md`（変更）
- `docs/implementation-plans/2026-10-07-review-guide-code-reading.md`（新規）

1つのPR。

## 11. Libraries / APIs

追加なし。

## 12. Alternatives Considered

- 地図を別のページにする: ガイドと行き来が増え、URLの管理も2つになる。不採用。
- 答え合わせ用の別のskillを作る: 依頼文とガイドの形が同じskillに閉じている方が、変更時にずれにくい。不採用。

## 13. Risks / Things to Watch

- 「全体像」の図と「確認すること」の実例には答えに近い内容が残る。人間のレビューで許容するかを確かめる。
- 参考ページが読めない場合は、skillの小見出しとArtifactの規約だけで作る。

## 14. Verification

### Manual

- TASK-012のガイドに、この形の節を載せてpublishした（<https://claude.ai/artifact/YHbGyA8hLcWHCZbhXTR4f7>）。

### Automated

- `pnpm lint:markdown`

## 15. Definition of Done

- skillの手順だけで、6節のガイドと答え合わせを再現できる。
- lintが通る。
- 機械のレビューでLGTM。

## 16. Completion Record

- 状態: 2026-10-07 完了（`b98565d`でサブエージェント・CodexともLGTM。人間のレビュー待ち）
- 実装差異:
  - レビューの指摘で、答え合わせの根拠の取り方を具体化した（依頼文に「PRのURL ＋ 40文字のLGTMのコミット」の組を
    入れ、repo・形式を確かめてから`pull/<番号>/head`とSHAで取得する。取れない場合はその旨を伝える）。
  - 答え合わせで見つかった問題は、`pull-requests.md`の「人間がレビューする時機」の流れへ渡す。`main`へマージ済みなら
    新しいPRとして扱う。
  - 地図の粒度（層・ファイル単位まで）と、節2の図の粒度を明記した。
  - サブエージェントのレビューが3回・4回でLGTMにならず、2回とも人間の判断で続行した（4回目の後はCodexへ進めた）。
- 検証結果:
  - `pnpm lint:markdown`: 成功（各コミット）。CIの「Docs & scripts」「CI Gate」: 成功。
  - TASK-012のガイドにこの節を載せてpublishした。参考ページは途中の版で作ったもので、後から依頼文（PRのURL・
    40文字のSHA）だけを最終版に合わせた。
  - 手順5の答え合わせは、まだ実際には実施していない。
- 関連: PR #80
