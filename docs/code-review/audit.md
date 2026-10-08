# 探索的な監査の観点

差分ではなく、mainにある実装の全体を観点ごとに探索し、まだ誰も気づいていない問題を候補として挙げるときの
観点・報告の形式・秘匿の扱いを定める。手順は[`exploratory-audit`](../../.claude/skills/exploratory-audit/SKILL.md)
skillが定める。

差分のレビューの入口ではない。差分のレビューはこれまでどおり[`frontend/`](./frontend/README.md)・
[`backend/`](./backend/README.md)・[`documentation.md`](./documentation.md)を使う（そのため
[`documentation.md`](./documentation.md) §1の「入口を増やしたら4か所へ接続する」の対象にしない）。
確認項目は各入口と`security.md`を正本とし、この文書には複製しない。

## 1. 観点

| 観点 | 主な対象 | 読む正本 | 秘匿 |
| --- | --- | --- | --- |
| `spec` | `apps/web/src/`、`apps/api/app/`、`contracts/` | [`product.md`](../product.md)、[`journaling.md`](../journaling.md)、[`dot-history.md`](../dot-history.md)、[`architecture.md`](../architecture.md)、[`contracts/openapi.yaml`](../../contracts/openapi.yaml)、[`contracts/README.md`](../../contracts/README.md) | しない |
| `performance` | `apps/api/app/`（controller・service・serializer・model）、`apps/api/db/schema.rb`、`apps/web/src/`の取得と再描画 | 性能の正本はまだない（§2を参照） | しない |
| `privacy` | 録音・文字起こし・Dot・利用者情報を保存・送信・削除・ログ出力する経路 | [`privacy.md`](../privacy.md) §2・§3・§5 | する |
| `security` | 認証・認可の境界（route・controller・認証状態で変わるWebの処理） | [backend `security.md`](./backend/security.md) §1・§5、[frontend `security.md`](./frontend/security.md) §3 | する |

観点に関わらず、frontend・backendの`security.md`のどれかの節に当たる指摘（秘密情報の露出、入力・表示・遷移、
CSRF、ログとエラーなどを含む）と、個人データの保存・送信・削除に関わる指摘は秘匿する。`security`観点の対象は
認証・認可の境界に絞っているが、秘匿の条件はそれより広い。観点の境界にある指摘（例: N+1の原因が所有権のscopeの抜けにある、仕様との食い違いが個人データの削除漏れに
当たる）は、**どの観点の監査で見つけても秘匿する指摘として扱う**。迷ったら秘匿する。認証・認可に触れる指摘でも、
実装が契約より厳しく拒否している（例: 契約は`403`、実装は`401`で拒否する）だけで、拒否すべきものが通る経路が
ないものは秘匿しない。

## 2. 観点ごとの確認の向き

差分のレビューと違い、「変えた箇所が正しいか」ではなく「正本の約束ごとに、それを守る実装とtestを辿れるか」を
確かめる。辿れないものが候補になる。

- `spec`: 正本の受け入れ条件・振る舞いを1つずつ取り上げ、実装とtestのどこが満たしているかを辿る。
  反対向きに、実装にあって正本にない振る舞いと、正本が作らないとしたものを実装していないかも見る。
  API契約は`contracts/openapi.yaml`とroute・serializer・status・errorを突き合わせる。
- `performance`: 性能について約束した正本はまだないため、この項目の向きを基準にし、`根拠`には正本の記述の
  代わりに実装の事実（1 requestで発行するqueryの数、取得件数の上限の有無など）を書く。件数に比例してqueryが増える経路（loop・serializerの中での関連の読み込みと、
  `includes`・`preload`の抜け）、上限のない取得、`where`・`order`に使う列のindexの抜け、Webでの不要な
  再取得（queryのkey・無効化の範囲）。
- `privacy`: `privacy.md` §3の確認表の各行と§5-1のデータ別の条件を、保存・送信・削除の実装で辿る。
  削除の経路（ゴミ箱・即時の完全削除・退会）ごとに、関連するデータ・端末の保存・ログが残らないかを見る。
- `security`: routeを列挙し、actionごとに認証と所有権の確認がどこで行われるかを辿る。残りは上の表の
  `security.md`の節に従う。

## 3. 報告の形式

報告は`<git-common-dir>/audits/<YYYY-MM-DD>-<観点>.md`に書く（`<git-common-dir>`は
`git rev-parse --path-format=absolute --git-common-dir`の出力。worktreeの間で共有され、commit・pushされない）。
秘匿しない観点も同じ場所に置き、報告の全体（不採用を含む）は公開の場に残さない。

冒頭に、監査の基準（コミットのSHA、`origin/main`との差の有無）、観点、対象範囲、読んだ正本を書く。
候補は重い順に次の形式で並べる。重大度は[`frontend/README.md`](./frontend/README.md) §2に従う。

```text
### AUD-<YYYYMMDD>-<観点>-<2桁の連番>: [タイトル]
観点: spec / performance / privacy / security
重大度: 🔴 / 🟠 / 🟡 / 🔵
秘匿: する / しない
場所: apps/api/path/file.rb:12（複数可）
根拠（事実）: 正本の記述と、実装・testで確認できること。
推測: 事実から推した部分と、その前提。なければ「なし」。
影響: 起こりうる利用者・データ・性能への影響。
タスク化の案: タスク名 / 作業区分 / 完了条件の案（1〜3行）
確信度: 高 / 中 / 低
採否: 未判断
理由:
```

`採否`と`理由`は人間が書く（採用 / 不採用 / 保留）。AIは書かない。

## 4. 秘匿の扱い

公開リポジトリのため、秘匿する指摘は**修正がmainに入るまで**、次の公開の場に場所（ファイル・行・endpoint）と
再現方法を書かない: `docs/tasks`・Plan・コミットメッセージ・PR本文・PRのコメントとレビューの記録・Issue・
再発防止として足す`docs/code-review/`などの指針とそのメンテナンス履歴。
チャットにも、件数・最大の重大度・報告ファイルのパスだけを書く（会話の記録は端末の外に残りうるため）。
公開の場の列挙はこの節だけに置き、ほかの文書からはこの節を参照する。

- 採用した秘匿する候補からタスクを起こすときは、タスク名を観点の分からない一般的なもの（例: 「監査で見つけた
  問題の修正」）にし、本文には報告のIDと次の1文だけを書く: 「修正がmainに入るまで、
  [`audit.md`](../code-review/audit.md) §4の公開の場に具体的な場所と再現方法を書かない。詳細は
  `<git-common-dir>/audits/`の報告`<ID>`を読む。」（実装するセッションはタスクファイルを読むため、この1文で
  §4へ辿れる）
- それでも、未修正の問題があることと、その時期は公開のタスクから分かる。報告のIDには観点が入る。これは
  公開リポジトリで修正をタスクとして管理するために受け入れている。
- 修正のPRの差分そのものは公開される。PR本文・コミットには何を直したかを抽象的に書き、再現手順はtestとして
  残す。
- 修正がmainに入ったら、修正したタスクのPlanの`Completion Record`に、観点・重大度・場所・修正内容を
  記録する。報告ファイルの該当候補は詳細を消し、`採否`を「修正済み（TASK-NNN）」にする。この記録は
  §5の3の完了条件として、そのタスクに必ず持たせる。

## 5. 採用した候補をタスクに起こす

人間が`採否`を「採用」にした候補だけを、[タスクの運用ルール](../tasks/README.md#運用ルール)どおりに起こす。

1. 未使用の次のIDでタスクファイルを作り、[索引](../tasks/README.md#索引)の該当する領域に足す。
2. タスクの目的に、監査から起こしたことと報告のIDを書く。完了条件は「タスク化の案」を基に、確認可能な形で
   書き直す。秘匿する候補は§4の形にする。
3. 秘匿する候補から起こすタスクには、次の完了条件を必ず入れる: 「修正がmainに入った後、§4の最後の項目の
   記録をPlanへ残し、報告の詳細を消している」。この記録はマージの後にしか書けないため、`run-task`がPRを作った
   時点ではタスクをDoneにせず、人間がマージ後に`/exploratory-audit`へ記録を依頼し、そのコミットが入ってから
   Doneにする。
4. 状態はTodo（依存先が未決ならBlocked）。優先度は人間が決めた値、決めていなければ人間に確かめる。
5. 報告ファイルの`理由`の後に、起こしたタスクのIDを書き足す。

## 6. 頻度と起動

人間が手動で起動する（`/exploratory-audit <観点>`）。目安は週1回と、機能のまとまりがmainに入った後。
監査はコード・`docs/`を変えず、worktree・ブランチ・DBを作らない。書くのは`<git-common-dir>/audits/`だけで、
`scripts/task-scheduler.mjs`と`scripts/task-status.mjs`はこの場所を読まない。そのため定期実行の
`/run-task`と同時に動いても作業は衝突しない。定期実行に入れるかは、手動で数回回した後に判断する
（2026-10-08の判断。[TASK-023 Plan](../implementation-plans/2026-10-08-task-023-exploratory-audit.md)）。

## 7. メンテナンス履歴

- 2026-10-08: 初版作成（TASK-023）。
