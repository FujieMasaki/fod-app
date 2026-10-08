---
name: exploratory-audit
description: 観点（spec / performance / privacy / security）を指定して、mainにある実装の全体を探索的に監査し、まだ誰も気づいていない問題を、根拠・重大度・タスク化の案つきの候補として非公開の報告に書く。「監査して」「/exploratory-audit spec」のように依頼されたときと、人間が採否を書いた報告から採用した候補をタスクに起こすときに使う。
argument-hint: "spec|performance|privacy|security [対象のディレクトリ]"
---

# /exploratory-audit

差分ではなく実装の全体を観点ごとに探索し、問題の候補を人間へ渡す。採否は人間が決める。AIは候補を
自動でタスク化・PR化しない。観点・報告の形式・秘匿の扱いの正本は
[`docs/code-review/audit.md`](../../../docs/code-review/audit.md)で、この skill には複製しない。

## 絶対に守ること

- 監査（手順1〜5）では、コード・`docs/`・設定を変えない。コミット・push・外部への投稿をしない。worktree・
  ブランチ・DBを作らない。書いてよいのは`<git-common-dir>/audits/`だけ（`git fetch`による追跡refの更新を除く）。例外は、人間が依頼したときの後半の
  2節（「採用した候補をタスクに起こす」「秘匿していた候補の修正がmainに入った後」）で、どちらも文書の変更として
  ブランチを作り、`pr-review-cycle`に従ってPRにする。
- 秘密情報（`.env*`、`master.key`、`credentials/*.key`）を読まない。DBの中身・ログ（`apps/api/log/`等）・`tmp/`・`storage/`（Active Storageの保存先）を読まない。
  DBを使うコマンド（RSpec・`rails console`等）を実行しない。報告にはコードの場所と振る舞いだけを書き、
  個人データ・秘密情報の値を書かない。
- 秘匿する指摘（`audit.md` §1・§4）は、チャット・`docs/tasks`・Plan・コミット・PR・Issueに場所と再現方法を
  書かない。迷ったら秘匿する。
- 根拠を確かめていない候補を事実として書かない。確かめきれないものは確信度を下げ、前提を`推測`に書く。

## 手順

### 1. 観点と基準を決める

1. 引数から観点（`spec` / `performance` / `privacy` / `security`、複数可）と、任意の対象範囲
   （ディレクトリ）を読む。観点がなければ、4つから選んでもらうよう人間に尋ねて止まる。
2. （手順1〜5だけに掛かる）`git rev-parse --abbrev-ref HEAD`が`<type>/task-NNN`の形（`feat` / `fix` / `refactor` / `chore` / `docs` /
   `test`）なら止まり、mainに揃えたcheckoutで起動し直すよう伝える（タスクのブランチではStop hookがPRの作成と
   検査を求め、この skill の禁止事項とぶつかるため）。
3. `git fetch origin main`の後、`git rev-parse HEAD`・`git rev-parse origin/main`・`git status --short`で
   監査の基準を確かめる。HEADが`origin/main`と違う、または未コミットの変更があれば、そのことを報告の冒頭に書く
   （mainに揃えたcheckoutでの実行を勧める）。
4. `git rev-parse --path-format=absolute --git-common-dir`で報告の置き場所を決め、`audits/`がなければ作る。

### 2. 読む

1. [`audit.md`](../../../docs/code-review/audit.md)と、選んだ観点の「読む正本」を読む。
2. `audits/`にある同じ観点の過去の報告を読み、`採否`が不採用・保留の候補と、その理由を把握する。
   同じ根拠の候補は再び挙げない。新しい根拠があるときだけ、`根拠`に「再提起: <前のID>」と書いて挙げる。

### 3. 探索して確かめる

1. `audit.md` §2の向きで、正本の約束ごとに実装とtestを辿る。検索は`git grep`（追跡しているファイルだけを
   探すので、gitignore済みのログ・`tmp/`・`storage/`を読まない）を優先する。Grep・Glob toolと、Bashの
   `grep -r`・`rg`・`find`・`cat`は、`apps/api/app`・`apps/web/src`・`contracts`・`docs`などの対象に絞り、
   `apps/api`のルートや`log/`・`tmp/`・`storage/`を含む範囲には掛けない（`settings.json`のdenyが効くのは組み込みの
   ファイルtoolだけで、Bashの子プロセスには効かないため）。任意のコードを実行するコマンド（`node -e`・`ruby -e`等）は、ファイル・DB・ネットワークに
   触れないことを確かめられる場合だけにする（ライブラリの挙動の確認など）。
2. 候補ごとに、場所の行を実際に読み直してから書く。正本の記述も引用元の節を確かめる。
3. 観点が複数のときは、観点ごとに報告ファイルを分ける。

### 4. 報告を書く

1. `audits/<YYYY-MM-DD>-<観点>.md`に、`audit.md` §3の形式で書く。同じ日の同じ観点のファイルがあれば
   追記する。IDの連番は、その日の報告すべてで続ける（IDに観点を入れないため）。書く直前に`audits/<YYYY-MM-DD>-*.md`を
   読み直して次の番号を決める（同じ日に別の観点の監査を並行で回しても重ならないように）。
2. 候補がなければ、確認した範囲と「候補なし」を書く（次の監査で同じ範囲を見たことが分かるように）。

### 5. チャットで渡す

- 秘匿しない候補: ID・重大度・タイトル・場所の一覧と、報告ファイルのパス。
- 秘匿する候補: 件数・最大の重大度・報告ファイルのパスだけ。
- 最後に「報告の`採否`と`理由`を書いてから、採用した候補のタスク化を依頼してください」と伝えて止まる。

## 採用した候補をタスクに起こす

人間が報告の`採否`を書いたうえで依頼したときだけ行う。

1. `git switch -c docs/audit-tasks-<YYYYMMDD> origin/main`でブランチを作る（`task-NNN`を含めない。
   定期実行が着手済みと判定しないように）。
2. `採否`が「採用」の候補だけを、`audit.md` §5の手順で`docs/tasks`へ起こす（秘匿する候補は§4の形）。
3. コミット・push・PRは`pr-review-cycle`に従う。報告ファイルへ起こしたタスクのIDを書き足す。

## 秘匿していた候補の修正がmainに入った後

人間が依頼したときだけ行う。

1. `git switch -c docs/task-<3桁の番号>-audit-record origin/main`でブランチを作る（修正したタスクの番号）。
2. `audit.md` §4の最後の項目に従い、修正したタスクのPlanの`Completion Record`へ記録し、報告の該当候補にある
   `再発防止:`を指針へ足す（別のコミットにする）。完了条件を確かめてタスクの状態を更新する。
3. コミット・push・PRは`pr-review-cycle`に従う。報告ファイルの該当候補の詳細は、このPRがmainに入った後に
   消す（人間がマージを伝えたとき。`audit.md` §4の最後の項目）。
