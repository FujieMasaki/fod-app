# Three-Stage Review Implementation Plan

## 1. Status

完了（2026-10-01）。

## 2. Goal

`pr-review-cycle`のレビューを「セルフレビュー → Claude Codeのサブエージェント → Codex」の3段にし、
広く論点を拾うレビューと、少数の指摘を実際に確かめる最終チェックを役割として分ける。

## 3. Background

- PR #45で同じ差分をClaude（Opus）とCodex（gpt-6.1-sol / high）に独立してレビューさせたところ、
  重なった指摘は1〜2件だけだった。Claudeは再認証の穴（security）、Plan・README・privacy.mdとの
  不整合など広い論点を拾い、Codexは改行入り`return_to`がRubyの正規表現を通ること、uploadの
  再送手順が詰むことなど、少数の指摘を再現して確かめた。どちらか1つでは🟡以上を2〜3件取りこぼす。
- 現行の手順はセルフレビューの後に`codex review --base`を回すだけで、`--base`と独自の指示を
  同時に指定できないため、Codexへレビュー観点（security.md等）を渡せていない。
- セルフレビューは実装したコンテキストで行うため、経緯を知っている反面、自分の判断に引っ張られる。
  経緯を持たない独立したレビューを、Codexの前に挟む。

## 4. Current State

- `.claude/skills/pr-review-cycle/SKILL.md`: PR作成 → セルフレビュー → `codex review --base
  origin/<base>` → 修正 → 再セルフレビュー → 再codexレビュー、を最大5回繰り返す。
- `docs/code-review/frontend/`・`backend/`: 領域ごとのレビュー入口とsecurity観点。Codex用の指示はない。
- `.claude/agents/`: リポジトリにはない。レビュー用サブエージェントは個人環境（`~/.claude/agents/`）に
  観点別のものがあるだけで、このリポジトリのレビュー指針を読む前提になっていない。
- `.claude/settings.json`: `Bash(codex review *)`を許可している。

## 5. Scope and Non-goals

- 今回の対象: レビュー段階の追加と順序、サブエージェントとCodexへの指示の置き場所、修正後の
  再レビューの範囲、許可設定。
- 今回の対象外: レビュー観点そのもの（frontend / backendのREADME・security.md）の見直し。
  PR作成前の実装手順（`run-task`）。個人環境のサブエージェント定義。
- 決定済み（2026-10-01、人間の判断）:
  - Q1 Codexの呼び出し: `codex exec -s read-only`で、diffの範囲と指示の両方を固定する。
    サブエージェントのレビューで、許可ルール`Bash(codex exec -s read-only *)`が前方一致のため
    sandboxを外すオプションを足しても通る、と指摘された。人間の判断で、決まった引数でcodexを呼ぶ
    `scripts/codex-final-check.mjs`を作り、許可ルールをそのスクリプトだけにする方式とした
    （拒否リスト方式のguard拡張、毎回の確認は不採用）。
  - Q2 修正後の再レビュー: 当初は「設計・仕様に関わる修正のときだけサブエージェントもやり直す」と
    決めたが、同日に人間の判断で次へ変更した。Codexとの修正の往復をできるだけ減らすため。
    - サブエージェントのLGTMが出るまでCodexへ進まない。
    - Codexの指摘を修正したら、修正の大小にかかわらずセルフレビュー → サブエージェントを経て、
      LGTMになってからCodexへ戻す。
  - 人間が対応不要と判断したsecurityの指摘（4回目のサブエージェントのレビューで、同じ指摘で毎回止まると
    指摘された）: 判断と理由をPlan（なければPR本文）に記録し、同じ内容の再指摘は解消済みとして止まらない。
    対象・前提・影響のどれかが違えば改めて止まる。
  - 最終チェックの対象: 自分が作成したブランチだけにする（個人開発のため、他人のブランチは考慮しない）。
    スクリプトは`.codex`・`AGENTS.override.md`・`.agents`がrepo rootにあれば起動しない。
  - 本PRでの例外: サブエージェントのレビューを上限の3回に1回足しても LGTMにならず、Medium以上の指摘が
    3→1→1→1件と手順の細かい抜けに移ってきたため、人間の判断で4回目の指摘を直した後はサブエージェントの
    LGTMなしにCodexの最終チェックへ進めた。

## 6. References and Documents to Update

- 参照: `AGENTS.md`（Pull Requests / Code Review）、`docs/code-review/*/README.md`・`security.md`、
  `docs/implementation-plans/2026-09-30-pr-review-cycle-skill.md`。
- 更新: `.claude/skills/pr-review-cycle/SKILL.md`、`.claude/settings.json`、`AGENTS.md`の
  Pull Requests節、`README.md`の文書一覧。
- 新規: `.claude/agents/code-reviewer.md`、`docs/code-review/final-check.md`。

## 7. Proposed Approach

1. `.claude/agents/code-reviewer.md`を追加する。経緯を持たない独立レビュアーとして、
   変更領域に応じた`docs/code-review/<area>/README.md`と`security.md`、関連仕様・Planを読み、
   READMEの形式で報告する。toolsはRead / Grep / Globに限り、コードを変更させない。diffは
   メイン側がファイルに保存して渡す。
2. `docs/code-review/final-check.md`を追加する。Codex向けに、security観点は必須、指摘は再現か
   具体的な壊れ方で確かめる、確かめられないものは要確認、という最終チェックの役割を定める。
   レビュー観点の本文は複製せず、各領域のsecurity.mdを読ませる。
3. `pr-review-cycle`を次の順にする。セルフレビュー → サブエージェントのレビュー → 指摘の修正 →
   `scripts/codex-final-check.mjs`経由の最終チェック → 指摘の修正 → 再セルフレビュー → 再サブエージェント →
   再Codex。サブエージェントのLGTM（Critical・High・Mediumなし）が出るまでCodexへ進まない。
   サブエージェントにもCodexにも、他段階のレビュー結果は渡さない。Codexとのループは実行回数で数え、
   上限5回は変えない。サブエージェントとの往復は別に数え、1回の段階で3回レビューしてもLGTMに
   ならなければ止まる。誤検知と判断した指摘は理由を記録すれば解消済みとできるが、securityの指摘は
   人間の判断を仰ぐ。
4. `scripts/codex-final-check.mjs`を追加する。baseだけを受け取り、形式を検査し、余分な引数を拒否して、
   `codex exec --sandbox read-only`の引数をすべて自分で組み立てる。`--sandbox`はモデルが実行するshell
   コマンドしか閉じ込めないため、execpolicyのrules（Codexの最終チェックの指摘）とユーザー設定のMCP
   サーバ・plugin（サブエージェントのレビューの指摘）を読み込まず、browser・computer use等の機能を無効に
   し、承認を`never`に固定する。ユーザー設定を読まないので、modelと推論の強さもスクリプトで固定する。20分で打ち切り、timeoutは専用の終了コード
   （3）で返す。`.claude/settings.json`の
   `codex review`の許可を、このスクリプトの許可に置き換える。
5. `AGENTS.md`と`README.md`の記述を3段のレビューに合わせる。

## 8. Why This Approach

- Claudeの広さとCodexの確かめる強さは、PR #45で実際に別の指摘として現れた。役割を分けると
  両方の強みが残り、同じ観点の繰り返しにならない。
- サブエージェントの定義をリポジトリに置くと、別セッション・別環境でも同じレビュアーで回せる。
  観点の本文は`docs/code-review/`の1箇所に保ち、エージェント定義と`final-check.md`は
  「どこを読むか・何をするか」だけを書く。
- 他段階の結果を渡さないのは、前段の判断に引っ張られて独立性が失われるのを防ぐため。
- Codexを読み取り専用にするのは、最終チェックがファイルを変更しないことを保証するため。
- Codexの前に必ずサブエージェントのLGTMを通すのは、Codexとの修正の往復を減らすため。広いレビューで
  拾える問題と、Codexの指摘への修正が生んだ新しい問題を、Codexへ戻す前に解消しておく。
- サブエージェントとの往復に3回の上限を設けるのは、誤検知や指摘の揺れでCodexへ進めなくなるのを
  防ぐため（3回は既定値として置いた。運用で見直す）。

## 9. Data Flow

UIやAPIのデータフローはない。Claude Codeのワークフロー定義の変更である。

```text
「PR作成して」
↓
PR作成 → セルフレビュー（実装したコンテキスト）
↓
git diff origin/<base>...HEAD をファイルに保存 → code-reviewer サブエージェント（独立）
↓
指摘があれば修正・push → セルフレビュー → 再サブエージェント（LGTMまで、最大3回）
↓
node scripts/codex-final-check.mjs → codex exec --sandbox read-only（final-check.md、独立）
↓
指摘があれば修正 → 再セルフレビュー → 再サブエージェント（LGTMまで）→ 再Codex
↓
仕組み化 → 完了報告
```

## 10. Files to Change

- `.claude/agents/code-reviewer.md`（新規）: 広いレビューを担うサブエージェント。
- `docs/code-review/final-check.md`（新規）: Codexの最終チェックの役割と手順。
- `.claude/skills/pr-review-cycle/SKILL.md`（変更）: 3段のレビュー、再レビューの範囲、止まる条件。
- `scripts/codex-final-check.mjs`・`.test.mjs`（新規）: 読み取り専用のCodexを決まった引数で呼ぶ。
- `.claude/settings.json`（変更）: `codex-final-check.mjs`の許可。
- `AGENTS.md`（変更）: Pull Requests節のレビューの説明。
- `README.md`（変更）: 文書一覧の`docs/code-review/`の説明。
- 本Plan（新規）。

## 11. Libraries / APIs

- `codex exec`（codex-cli 0.159.3で確認）: 非対話でCodexを実行する。`-s read-only`で
  モデルが実行するコマンドを読み取り専用のsandboxに限る。`codex review`と違い、指示の文字列と
  diffの範囲を同時に固定できる。
- Claude Codeのサブエージェント（`.claude/agents/*.md`）: 独立したコンテキストでレビューさせる。

## 12. Alternatives Considered

- `codex review "<指示>"`: review専用の出力形式を使えるが、diffの範囲がCLIの既定判定に任されるため、
  最終チェックとして不確実。不採用（Q1）。
- `codex review --base`のまま、観点はAGENTS.md経由で伝える: 変更は最小だが、review時に
  AGENTS.mdが読まれているか確かめられない。不採用（Q1）。
- 設計・仕様に関わる修正のときだけサブエージェントをやり直す: 1周が速いが、判断を誤ると広い
  レビューが抜け、Codexとの往復が増える。当初採用したが、同日に人間の判断で不採用とした（Q2）。
- サブエージェントに個人環境の`engineering-principles-reviewer`を使う: このリポジトリの
  レビュー指針と報告形式を前提にしておらず、他環境で再現できない。不採用。

## 13. Risks / Things to Watch

- 読み取り専用のsandboxでは、ファイルを書き込むtest（rspecのDB、vitestのcache等）をCodexが
  実行できない。書き込みを伴わない再現（`ruby -e`、`node -e`、既存の読み取り）に限られ、
  再現できない指摘は要確認として返る。Codexの「確かめる」強さが下がらないか、運用で観察する。
- 毎回サブエージェントを通すため、1周の所要時間とコストが増える。Codexとの往復が実際に減るかを、
  完了報告の段階ごとの指摘件数で観察する。
- サブエージェントの誤検知を「対応不要」として解消済みにする判断が甘くなると、LGTMの意味が薄れる。
  対応不要とした理由は必ず記録し、securityの指摘は人間が判断する。
- 自分以外が作成したブランチでは、スクリプトもCodexへの指示（`final-check.md`、`AGENTS.md`、
  `AGENTS.override.md`、`.agents`等）も書き換えられ、Codexに秘密情報を読ませて出力させうる。読み込み先を
  列挙して塞ぐ方法は抜けが出続けるため、最終チェックは自分が作成したブランチだけを対象にした（個人開発の
  ため、人間の判断で他人のブランチは考慮しない）。他人のPRをレビューする運用を始めるときは見直す。
- スクリプトでmodel（`gpt-6.1-sol`）と推論の強さ（`high`）を固定したため、Codexの設定を変えても
  最終チェックには反映されない。modelを変えるときはスクリプトを直す。
- 「記録済みの人間の判断と同じ内容か」はClaudeが判断する。広く解釈すると、別のsecurityの指摘を
  見過ごす。少しでも違えば止まる、と手順に書いている。
- サブエージェントは確かめきれない論点も挙げるため、推測にとどまるsecurityの要確認が出るたびに
  人間の判断待ちになりうる。安全側の振る舞いとして許容し、止まる頻度を運用で観察する。
- Codexは`.claude/settings.json`のdenyの対象外で、read-onlyのsandboxでもディスク全体を読める。
  秘密情報を読まないことは`final-check.md`の指示で求めるが、機械的には防げていない。

## 14. Verification

### Manual

- 本PR自体を、更新後の`pr-review-cycle`の手順どおりにレビューして回す。
- `scripts/codex-final-check.mjs`経由のCodexが、指示どおりのdiff範囲を読み、ファイルを変更しないことを確認する。

### Automated

- `node --test scripts/codex-final-check.test.mjs`: 余分な引数・不正なbaseの拒否と、常にread-onlyで
  呼ぶ引数の組み立てを確認する。
- pre-commit / pre-push hook（`pnpm test`にscriptsのtestを含む）の通過を確認する。

## 15. Definition of Done

- 3段の順序と、各段に他段階の結果を渡さないことが手順に書かれている。
- Codexへ範囲と指示の両方を渡せる、読み取り専用の呼び出しになっている。
- サブエージェントのLGTMなしにCodexへ進まないこと、Codexの指摘の修正後もサブエージェントを経ることが
  手順に書かれている。
- サブエージェントとの往復に上限がある。
- レビュー観点の本文が複製されていない。
- 実装内容を人間が説明できる。

## 16. Completion Record

- 状態: 2026-10-01 完了。Codexの最終チェックでLGTM（`4a5728a`）。
- 実装差異:
  - Q1の見直し: `codex exec -s read-only`の直接実行は、許可ルールが前方一致のためsandboxを外すオプションを
    足せると指摘され、決まった引数で呼ぶ`scripts/codex-final-check.mjs`に置き換えた（人間の判断）。
  - スクリプトの固定引数は、レビューの指摘ごとに次を加えた: execpolicyのrulesを読まない（Codexの指摘、
    `git fetch`がallowで再現）、ユーザー設定（MCPサーバ`node_repl`・`cua_repl`、plugin）を読まない、
    browser・computer use・apps・hooks・plugins・web検索を無効にする、承認を`never`に固定する、20分で
    打ち切る、`.codex`・`AGENTS.override.md`・`.agents`があれば起動しない。
  - Q2の見直し: 当初の「設計・仕様の修正のときだけサブエージェント」を、同日に「サブエージェントのLGTMが
    出るまでCodexへ進まない」へ変更した（人間の判断）。
  - 最終チェックは自分が作成したブランチだけを対象にした（個人開発のため他人のブランチは考慮しない、人間の判断）。
  - 人間が判断したsecurityの指摘は、Planに記録すれば同じ内容の再指摘で止まらないことにした（人間の判断）。
- 検証結果:
  - 本PR自体を更新後の手順で回した。サブエージェント: 1段階目4回（3回の上限に人間の判断で1回追加、
    最後はLGTMなしでCodexへ）、Codexの指摘後の段階で4回（上限後に人間の判断で1回追加し、4回目でLGTM）。
    Codex: 2回（1回目🟠1件、2回目LGTM。間に利用上限で結果の出ない実行が1回あり、回数に数えていない）。
  - `codex-final-check.mjs`経由でCodexを実際に3回起動した。報告されたdiffの範囲はスクリプトが出したSHAと
    一致し、Codexの実行後も作業ツリーは変わらなかった（`git status`が空）。`--ignore-user-config`でも認証と
    固定したmodelで起動できた。利用上限のときは終了コード1とログ末尾で止まった。
  - `node --test scripts/codex-final-check.test.mjs`: 6件成功。pre-commit / pre-push hook（`pnpm test`）通過。
  - 対応しなかった指摘（すべてLow、任意改善）: サブエージェントがリポジトリ外のdiffを読むときに許可確認で
    止まりうる、代わりのagentの読み取り専用は指示だけで担保している、`git fetch`で直るbaseの不在も終了コード
    2で止まる、無効にしていないCodexのfeatureが残る・成功時もログを消さない。
  - 再発防止: サブエージェント・Codexの指摘はsandboxの抜け道に集中した。抜け道を塞ぐ引数はすべて
    `codex-final-check.test.mjs`で固定し、機械的に検出できるようにした。
- 関連: PR #46（<https://github.com/FujieMasaki/fod-app/pull/46>）、PR #45（3段にする判断の根拠）。
