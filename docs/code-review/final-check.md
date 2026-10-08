# 最終チェック（Codex）

`pr-review-cycle`の最後の段階で、Codexが行うレビューの役割と手順を定める。前段では
Claude Codeのセルフレビューとサブエージェント（[`code-reviewer`](../../.claude/agents/code-reviewer.md)）が
論点を広く拾っている。この段階は、**少数の指摘を実際に確かめて当てる**ことに集中する。

レビュー観点の正本は各領域のREADMEと`security.md`であり、この文書には複製しない。

## 1. 前提

- 他の段階のレビュー結果は受け取らない。差分と仕様から独立して判断する。
- 読み取り専用のsandboxで実行される。`$CODEX_HOME/config.toml`（MCPサーバ・pluginの設定を含む）と
  execpolicyのrulesは読み込まず、web検索・browser等の機能は無効にしている（`scripts/codex-final-check.mjs`が
  引数で固定している）。`AGENTS.md`等の指示ファイルは読み込まれる。
  ファイルの変更、コミット、外部への投稿はしない。
- 秘密情報（`.env*`、`apps/api/config/master.key`、`apps/api/config/credentials/*.key`等）を読まない・
  出力しない。秘密情報が混入していないかは、差分（`git diff`）の内容で判断する。

## 2. 手順

1. 指示されたbase（例: `origin/main`）に対し、`git diff <base>...HEAD`でレビュー対象の差分を取得する。
   冒頭で、確認した差分の範囲（baseの先端・merge-base・HEADのコミット）を報告する。
2. 変更された領域の`security.md`と、同じディレクトリの`README.md`（報告形式の出典）を必ず読む
   （`apps/web/`は[`frontend/`](./frontend/README.md)、`apps/api/`は[`backend/`](./backend/README.md)、
   `contracts/`・両方にまたがる変更・どちらにも当てはまらない変更は両方）。
   **仕様・設計文書・レビュー指針・タスク・Planの変更では[`documentation.md`](./documentation.md)を読む**
   （`docs/`配下と、`AGENTS.md`・`CLAUDE.md`・`README.md`・`contracts/README.md`等のルートの文書、
   `.claude/agents/*.md`・`.claude/skills/*/SKILL.md`。コードと両方にまたがる変更では、コード側の入口と両方）。
3. 差分と、判断に必要な関連実装・test・仕様を読む。
4. 次の観点を優先して確認する。
   - security（認証・認可、入力の検証、open redirect、CSRF、秘密情報・個人データの扱い）
   - 正しさ: 処理系・ライブラリの実際の挙動（正規表現、型変換、日時、文字コード等）と、仕様・実装の食い違い
   - 状態遷移・異常系・再試行で、手順に従うと詰む・壊れる経路
   - Webとapiの契約の食い違い、検証で落ちるべきものが通る抜け道
5. 指摘は、可能な限り**再現して確かめる**。ファイルを書き込まないコマンド（`ruby -e`、`node -e`、
   既存の実装の読み取り等）で再現する。再現できない場合は、具体的な入力と壊れる経路を示す。
   どちらもできない場合は「要確認」とする。

命名・書き方の好み・一般論の改善提案は挙げない。

## 3. 報告

各指摘は、領域のREADMEの「レビュー出力」の形式（重大度・場所・根拠・影響・修正案・区分・確信度）に、
次の1行を加えて書く。両方のREADMEを読んだ場合は、frontendの形式を使う。

```text
確かめ方: 再現した（実行したコマンドと結果） / 経路を追った（入力と壊れる経路） / 未確認
```

秘匿する監査の候補を扱うPR（差分にslugが`audit-fix`のタスクかPlanがある）では、[`audit.md`](./audit.md) §4の
「修正のセッション」の項目に従って報告する（指摘に再現手順・攻撃の経路を書かず、`確かめ方`には実行したコマンドを
書かずに「再現した」とだけ書く）。

Critical・High・Mediumの指摘がなければ`LGTM`と明記する。securityの問題や疑いがある間は`LGTM`にしない。
