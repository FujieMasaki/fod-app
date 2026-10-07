# Product Vision Documentation Implementation Plan

## 1. Status

完了（2026-09-30）。**このPlanは実装前ではなく、実装コミット後にCodexレビューの指摘を受けて
事後的に作成した**。本来は実装前に作成すべきところ、今回のような小さな文書変更ではPlan作成を
省略できると判断して着手し、レビューで規約違反と指摘された。次回以降、複数ファイルにまたがる
文書変更でもPlanを実装前に作成する。

## 2. Goal

FoDを作る理由・長期的な方向性・競合しない領域と競争する領域を、MVP要件と混ざらない形で文書化する。
AIも人間も、新機能やUX検討の際にこの前提を参照できるようにする。

## 3. Background

- 開発者自身が録音アプリ→ChatGPT→NotebookLMという運用を実体験として続ける中で、FoDの価値は
  「AIが要約すること」ではなく「記録が積み重なり、後から俯瞰することで自分の変化に気づけること」に
  あると整理された。
- この「なぜ作るか」という前提はdocs/product.mdを含むどの既存文書にも書かれておらず、product.mdへ
  そのまま書き足すと、MVP要件と将来構想が混ざるおそれがあった。
- 別のAI（Codex）からも、product-vision.mdをMVP正本と分離して新設する提案を受けた。

## 4. Current State

- docs/product.md: MVPの目的・範囲・作らないこと・保留事項の正本。既に「検証候補」「将来候補」区分を
  持つが、「なぜ作るか」「何と競合しないか」という前提は書かれていない。
- docs/dot-history.md §4: 「Dot → Line → Pattern」という将来構想が既に記載されている。
- ルートにCLAUDE.mdは存在せず、AGENTS.mdのみが存在する。
- docs/future-candidates.mdは存在しない。

## 5. Scope and Non-goals

### 対象

- docs/product-vision.mdを新設し、Why・競合しない領域と競争する領域・データ思想（一文）・Future・
  MVPとの関係をまとめる。
- docs/future-candidates.mdを新設し、人物タグ・写真/動画の関連付け・年間ダイジェスト生成など、
  MVP範囲外の将来機能候補を蓄積する場所とする。
- AGENTS.mdへ、新機能・UX・プロダクト仕様の検討時に読む文書としてproduct-vision.mdと
  future-candidates.mdを追加し、文書の役割説明を追記する。
- docs/product.mdの参照文書リストにproduct-vision.mdへのリンクを追加する（MVPの範囲・受け入れ条件は
  変更しない）。
- ルートにCLAUDE.md（`@AGENTS.md`）を新設する。

### 今回の対象外

- docs/dot-classification.md、docs/reflection.mdなど、カテゴリー・振り返り機能の個別仕様。実装方針が
  決まってから作成する。
- product.mdの「将来候補」区分への項目追加。今回はfuture-candidates.mdへ切り出す。product.mdの
  本文構成・MVPの範囲・受け入れ条件は変更しない（参照文書リストへのリンク追加を除く）。
- アプリケーションコード、API、データフロー。

### 未決定で、今回確定しない事項

- future-candidates.mdの項目をいつ・どの基準でproduct.mdの検証候補・将来候補、または機能仕様へ
  昇格させるか。

## 6. References and Documents to Update

- 参照: docs/product.md、docs/dot-history.md、AGENTS.md、
  docs/implementation-plans/2026-09-19-documentation-governance.md。
- 更新: AGENTS.md、docs/product.md。
- 新規: docs/product-vision.md、docs/future-candidates.md、CLAUDE.md。

## 7. Proposed Approach

1. docs/product-vision.mdを新設し、開発者自身の実体験に基づく運用メモ（iPhone録音→ChatGPT→
   NotebookLM）から得た価値仮説を、Why / Core Value / 競合しない領域と競争する領域 / データ思想
   （一文）/ Future / MVPとの関係の6セクションに圧縮する。
2. docs/future-candidates.mdを新設し、人物タグ・写真動画の関連付け・年間ダイジェスト生成を初期項目
   として記録する。今後も同様の将来候補を追加していく前提で運用する。
3. AGENTS.mdの必読文書表と文書の役割説明へ、両文書の位置づけと「MVP要件へ昇格させない」旨を
   追記する。
4. docs/product.mdの参照文書リストにproduct-vision.mdへのリンクを1行追加する。
5. ルートにCLAUDE.md（`@AGENTS.md`）を新設する。

## 8. Why This Approach

- メモの全文（8セクションのエッセイ）をそのまま転記しなかった理由: product-vision.mdはAGENTS.mdの
  必読文書に載り、新機能検討のたびに読み込まれる前提になる。長いエッセイ調のままだと、将来候補が
  MVP要件と誤読されるリスクが、そもそもの目的（Vision ≠ 仕様の明確化）と逆行する。
- 将来機能候補を独立したdocs/future-candidates.mdへ切り出した理由: 当初案ではproduct-vision.md内で
  「product.mdの将来候補と対応する」と書いたが、product.mdの将来候補には人物タグ等が明記されて
  おらず、正本にない構想を採用済みのように見せてしまっていた（レビュー指摘）。将来候補は今後も
  増えていくため、product.mdやproduct-vision.mdへ都度書き足すのではなく、専用の蓄積場所を設ける
  方がMVP正本を汚さず、継続的に追加しやすい。
- CLAUDE.md新設の理由: Codex CLIとClaude Codeの両方から同じAGENTS.mdを入口にするため。ただし、
  CLAUDE.mdが存在しない状態でもAGENTS.mdが読み込まれた形跡がセッション内で確認できており、厳密な
  必要性は未検証のまま追加している。

## 9. Data Flow

文書のみの変更であり、プロダクトのデータフロー・API・Storageは変更しない。

## 10. Files to Change

- 新規: docs/product-vision.md — プロダクトの存在理由・方向性・競合領域。
- 新規: docs/future-candidates.md — MVP範囲外の将来機能候補の蓄積場所。
- 新規: CLAUDE.md — AGENTS.mdへの入口。
- 変更: AGENTS.md — 必読文書表・文書の役割説明に両文書を追加。
- 変更: docs/product.md — 参照文書リストにproduct-vision.mdへのリンクを追加。

## 11. Libraries / APIs

なし。

## 12. Alternatives Considered

- メモの全文をproduct-vision.mdへそのまま転記する案（Codexの当初提案）: 網羅的だが、必読文書化すると
  毎回のコンテキストコストが増え、将来候補がMVP要件と誤読されるリスクが上がるため採用しない。
- 将来機能候補をproduct-vision.md内に留め、product.mdの将来候補と直接対応させる案: レビューで
  指摘された通り、正本にない構想を採用済みの将来候補に見せてしまうため採用しない。
- CLAUDE.mdを作らず、AGENTS.mdのみに統一する案: セッション内でAGENTS.mdの自動読み込みが確認できた
  ため一時検討したが、Codex CLI側の読み込み経路を明示的に保証する材料がなく、追加コストが低いため
  今回は追加する案を採用した。

## 13. Risks / Things to Watch

- future-candidates.mdの項目が増え続け、昇格判断が行われないまま放置されるリスク。実装検討時に
  product.mdへ反映する運用を徹底する必要がある。
- CLAUDE.mdとAGENTS.mdの二重管理により、将来どちらかが更新漏れになるリスク。

## 14. Verification

### Manual

- product-vision.md、future-candidates.md、AGENTS.md、product.mdの全diffを確認し、MVPの範囲・
  受け入れ条件が変わっていないことを確認した。
- Codex CLI（`codex review`）でカスタムレビューを依頼し、指摘を受けて将来候補の正本との不整合を
  修正した。

### Automated

- 文書のみの変更のため、アプリケーションtest / lintは対象外。pre-commit / pre-push hook（lint・
  type-check・test）は通過済み。

## 15. Definition of Done

- Vision・将来候補・MVP正本の役割が文書間で矛盾しない。
- AGENTS.mdから新規文書を辿れる。
- ドキュメント以外の実装・設定は変更していない。
- 全diffを確認し、人間が説明できる。

## 16. Completion Record

- 状態: 2026-09-30に完了。
- 実装差異: 当初PR（#43）ではfuture-candidates.mdを作らず、product-vision.md内で将来候補を
  product.mdの将来候補と対応させていたが、Codexレビューの指摘を受けてfuture-candidates.mdへ
  切り出し、対応関係の記述を修正した。
- 検証結果: 全diff確認、pre-commit / pre-push hook通過、Codexによるレビューを実施し指摘を反映した。
- 関連: PR #43（https://github.com/FujieMasaki/fod-app/pull/43）。
