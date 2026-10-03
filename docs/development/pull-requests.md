# PRの分割と人間のレビュー

AIが作るPRを、人間が1回で読み切れる大きさに分ける規約と、人間がレビューする時機を定める。
PRのタイトル・本文の書き方は[AGENTS.md](../../AGENTS.md)の「Pull Requests」に従う。

## 大きさの上限

1つのPRで**レビュー対象のファイルは20個まで**にする。

数えないファイル（変更してよいが、上限の計算から外す）:

- lockfile: `pnpm-lock.yaml`、`apps/api/Gemfile.lock`
- 道具で生成するファイル: `apps/api/db/schema.rb`、`apps/web/src/types/api-contract.d.ts`
  （生成元のmigration・`contracts/openapi.yaml`は数える）
- タスクファイル（`docs/tasks/TASK-XXX-*.md`）の`状態`・`関連Implementation Plan`だけの更新
  （完了条件の`[x]`の更新は数える）

test・Implementation Plan・仕様文書は数える。人間がレビューするものだからである。

1つの関心事がどうしても20を超える場合（機械的な一括置換など）だけ、上限を超えてよい。その場合は
PR本文の「概要」に、超えた理由と、レビューで見なくてよいファイルの範囲を書く。

## 分け方

- 1つのPR = 1つの関心事。PRのタイトルだけで何を見ればよいか分かる単位にする。
- 依存の下から積む。目安は「Plan・仕様文書 → データモデル・migration → ドメインロジック（service等）
  → API（routes・controller・契約） → frontend」。
- testは対象のコードと同じPRに入れる。testだけ・実装だけのPRを作らない。
- **各PRは単独でCIが通る**状態にする。後続PRがないと壊れる・testが落ちる分け方をしない。
- 1つのファイルの変更を、関心事が同じなのに複数のPRへ散らさない。
- 合計で20以下に収まるなら分けない。分割は読みやすくするためのもので、数を増やすことが目的ではない。

分け方はImplementation Planの「10. Files to Change」に、PRごとのファイルと順序として書いてから
実装する。実装中に大きさが変わったら、Planを直してから分け直す。

Planとタスクファイルは、1番目のPRで作成・着手（In progress）にし、完了の記録（Completion Record、
完了条件の`[x]`、Done）は最後のPRで書く。この2つのファイルだけは、1番目と最後のPRにまたがってよい。

## 積み重ね（stacked PR）

後のPRが前のPRに依存する場合は、ブランチを積み重ねる。

```text
origin/main ← <type>/task-008-1-<slug> ← <type>/task-008-2-<slug> ← <type>/task-008-3-<slug>
   PR 1/3: base main     PR 2/3: base 1番目のブランチ     PR 3/3: base 2番目のブランチ
```

- ブランチ名は`<type>/task-<3桁>-<順番>-<slug>`（例: `feat/task-008-1-dot-model`）。タスク外の変更は
  `<type>/<slug>-<順番>`。`<type>`はPRごとに選んでよい。
- 各PRのbaseは1つ前のブランチにする（1番目だけ`main`）。こうするとPRのdiffは、そのPRで増えた分だけになる。
- 互いに依存しないPRは、どれも`main`をbaseにしてよい。
- PRのタイトルの末尾に`（1/3）`のように順番を付ける。本文の「概要」に、同じタスクのPRの一覧
  （番号・タイトル・base）とマージの順番を書く。
- PRごとの作業（修正・検証・push・PR作成・レビュー）は、**そのPRのブランチへ`git switch`してから**行う。
  pre-pushの検査、`gh pr create`のhead、Codexの最終チェックやレビューのdiff（`<base>...HEAD`）は、どれも
  今いるブランチを基準にするため、別のブランチにいると、そのPRを単独で確かめたことにならない。
- pushは`git push origin <ブランチ>:<ブランチ>`の形にし、push前に`git branch --show-current`がpush先と
  一致することを確かめる。hookのメッセージにある`HEAD:<ブランチ>`の例は、今いるブランチへpushする場合に限る。ブランチを行き来するため、`HEAD:<ブランチ>`だと
  後ろのブランチにいるまま前のブランチの名前へpushしても、fast-forwardとして通ってしまい、後ろのPRの変更が
  前のPRに黙って混ざる。
- 前のPRを直したら、その後ろのブランチへ順に`git merge`で取り込んでpushする。rebase・force pushは
  しない。取り込みでコンフリクトの解消や追加の修正が入ったPRと、前のPRの修正が後ろのPRで使う
  interface・振る舞いを変えたPRは、レビューをやり直す。それ以外の取り込んだだけのPRは、testとCIの
  確認で足りる（diffの文面は変わらないため）。人間のレビュー用ガイドには、LGTMのコミットと取り込んだ後の
  HEADを並べて書く。

### マージ（人間が行う）

- 積み重ねたPRは「Create a merge commit」でマージする。squash・rebaseでマージすると`main`に元の
  コミットが入らず、後ろのPRのdiffに前のPRの変更が再び現れ、コンフリクトも起きる。
- 1番目から順にマージする。
- マージしたら、次のPRのbaseを`main`へ付け替えてからマージする。GitHubの「マージ後にブランチを自動で
  削除する」設定が有効なら自動で付け替わる。付け替えずにマージすると、`main`ではなく前のブランチへ
  入ってしまう。

## 人間がレビューする時機

人間のレビューは**タスク（またはひとまとまりの依頼）ごとに1回**、そのタスクの**すべてのPRが機械の
レビュー（セルフレビュー → サブエージェント → Codex）でLGTMになってから**行う。

1. AIは、PRを1番目から順に[`pr-review-cycle`](../../.claude/skills/pr-review-cycle/SKILL.md)の
   レビューにかける。前のPRの修正を後ろへ取り込んでから、後ろのPRをレビューする。
2. すべてのPRがLGTMになったら、
   [`human-review-artifact`](../../.claude/skills/human-review-artifact/SKILL.md)でタスク全体のガイドを
   1つ作り、人間へ渡す。PRごとには作らない。
3. 人間はガイドに沿って、PRを1番目から順に見る。指摘はPRにコメントするか、チャットで伝える。
4. AIは指摘を該当するPRで直し、後ろのPRへ取り込み、直したPRを機械のレビューにかけ直してから、
   ガイドを更新して再び渡す。
5. 人間が承認したら、上の「マージ」の順に人間がマージする。

途中のPRがLGTMになっても、人間へ個別にレビューを頼まない。前のPRの設計が後のPRで変わることがあり、
途中で見ると見直しが二度手間になるため。ただし、レビュー中に人間の判断が必要な点（仕様・設計・
securityの判断）が出たら、すべてのPRを待たずにその場で止まって聞く。
