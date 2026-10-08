# TASK-023: 探索的な監査のskillと、見つけた問題をタスクに起こす流れ

## 1. Status

実装済み（2026-10-08）。未決定事項Q1〜Q3は人間が判断した（下の「判断の結果」）。

## 2. Goal

観点を指定して探索的な監査をAIに投げ、まだ誰も気づいていない問題を、人間が採否を判断できる形で
受け取れるようにする。採用した候補だけを`docs/tasks`へ起こし、securityと個人データの保存・送信・削除に
関わる指摘は、修正まで公開の場に具体的に残さない。

## 3. Background

- 現在のループ（`run-task`・`pr-review-cycle`）は、登録済みのタスクを実装して差分をレビューする。
  差分の外にある既存コードの問題を探す段がない。
- このリポジトリ（`FujieMasaki/fod-app`）は公開されている。GitHubのprivate vulnerability reportingは
  無効（`gh api repos/{owner}/{repo}/private-vulnerability-reporting`が`{"enabled":false}`、2026-10-08に確認）。
- タスクは、置き場所・起動方法・ツールのように複数の有力案がある選択を、Planで選択肢と推奨を
  整理したうえで人間の判断に回すよう求めている。

## 4. Current State

- skillは`pr-review-cycle`・`run-task`・`human-review-artifact`、agentは`code-reviewer`（Read / Grep / Globだけの
  独立レビュアー）。どれも差分を対象にしている。
- レビューの観点は`docs/code-review/`（frontend / backendのREADMEと`security.md`、`documentation.md`、
  `final-check.md`）にある。重大度は🔴 / 🟠 / 🟡 / 🔵。
- `scripts/task-scheduler.mjs`はlaunchdから毎朝4時に起動し、着手できるタスクごとに
  `.claude/worktrees/task-NNN`をorigin/mainへdetachして作り、`claude -p "/run-task TASK-NNN"`を最大3並列で
  動かす。着手済みの判定は、`task-NNN`の名前を持つworktree・ブランチ、open PR、
  `<git-common-dir>/scheduled-sessions/`の記録による。ログは`~/Library/Logs/focus-on-dot/`。
- `.gitignore`は`.claude/worktrees/`を除外している。リポジトリに含めない置き場所の前例として、
  `<git-common-dir>/scheduled-sessions/`がある。

## 5. Scope and Non-goals

### 対象

- 監査のskill（`.claude/skills/exploratory-audit/SKILL.md`）。観点・入力・出力の形式・止まる条件を書く。
- 観点ごとの確認項目（`docs/code-review/audit.md`）。少なくとも次の4観点。
  - `privacy`: [privacy.md](../privacy.md)と実装の突き合わせ（音声・Dotの保存・送信・削除の漏れ）
  - `performance`: N+1クエリなどの性能
  - `security`: 認証・認可の境界
  - `spec`: 仕様と実装の不一致
- 秘匿する指摘の置き場所と、修正後に記録する手順（Q1で決める）。
- 採用した候補を`docs/tasks`へ起こす手順（[タスクの運用ルール](../tasks/README.md#運用ルール)に従う）。
- 実行の頻度と起動方法（Q2で決める）。
- 1つ以上の観点での実際の監査と、意図的な食い違いを指摘できるかの検証。

### 対象外

- 監査で見つけた問題の修正（採用した候補は別タスクとして起こす）。
- 監査結果の自動のタスク化・PR化（人間が採否を判断する）。
- lint・型・testの追加（監査で見つけた候補として別タスクにする）。

### 判断の結果（2026-10-08）

人間が次のとおり判断した。いずれも推奨どおり。

- Q1: A（`<git-common-dir>/audits/`）。あわせて、リポジトリを非公開にしてQ1の前提をなくす案も検討した。
  非公開にするとmainのruleset（GitHub Freeではprivateに適用されない）・Actionsの無料枠・push protectionを
  失いうること、個人開発のポートフォリオとして公開を続けたいことから、公開のままAにした。
- Q2: A（手動だけ）。手動で数回回した後に、定期実行に入れるかを判断する。
- Q3: B（報告の全体をQ1と同じ非公開の場所に置く）。

### レビューで止まった点（2026-10-08。判断済み）

Codexの後のサブエージェント段階で、3回レビューしてもLGTMにならなかった（`pr-review-cycle`の止まる条件）。
残った🟡と、許可に関わる判断は次の2つ。

- R1: 報告のID（`AUD-<YYYYMMDD>-<観点>-<連番>`）に観点が入るため、秘匿する候補のslugを`audit-fix`に固定しても、
  タスクファイルとPlanに写すIDから`security` / `privacy`の問題が未修正であることが分かる。
  A: IDから観点を外す（`AUD-<YYYYMMDD>-<連番>`、観点は報告の欄だけに書く）。B: 受け入れ、その判断をここに記録する。
  推奨はA（変更が小さく、slugを固定した意味が保たれる）。**人間の判断: A。**
- R2: 監査がGrep toolでgitignore済みの開発ログ（`apps/api/log/`）まで読みうる。skillでは`git grep`を優先し範囲を
  絞るとしたが、指示だけの防御になる。A: `.claude/settings.json`のdenyに`Read(./apps/api/log/**)`・
  `Read(./apps/api/tmp/**)`を足す（許可を絞る向き。denyがGrep・Globに効くかは足した後に確かめる）。
  B: skillの指示だけにする。推奨はA（個人データを読まない約束を指示だけに頼らないため）。**人間の判断: A。**
  実装では、同じ向きでActive Storageの保存先`apps/api/storage/**`もdenyに足した（今は空だが、録音を置く実装が入ると
  同じ経路になるため）。denyが効くのは組み込みのファイルtool（Read、Grep・Globはベストエフォート）だけで、Bashの
  子プロセス（`grep -r`・`rg`・`cat`）には効かない。Bashの経路はskillの指示で防ぐ。

### レビューで止まった点（2回目、2026-10-08。判断済み）

R1・R2の判断の後のサブエージェント段階でも、3回レビューしてLGTMにならなかった。🟡の数は2→2→1と減っているが、
どれも一度も通していない秘匿の流れ（タスクを起こすPR・修正のPR）の端の経路で、直すたびに隣の経路が見つかる。
3回目の🟡は、秘匿する候補のタスクファイルを足すPR（`docs/audit-tasks-*`）が秘匿の目印（slugが`audit-fix`）の
対象から外れ、レビュアーが抽象的なタスク本文を指摘しうる、というもの。

- R3: 進め方。A: 3回目の🟡と🔵を直し、秘匿の流れのうちまだ通していない経路（タスクを起こすPR・修正のPR・修正後の
  記録）は、初めて通すときに見直すと「確認すること」とPlanに書いて範囲を区切ったうえで、サブエージェント段階を
  やり直してCodexへ進む。B: 直したうえで、サブエージェント段階をやり直さずCodexへ進む。C: 今のまま止め、秘匿の
  流れを別のタスクに切り出す。推奨はA。**人間の判断: A。**

#### 範囲の区切り（R3の判断）

秘匿の流れのうち、監査とチャットへの出し方（手順1〜5）はこのPRで作り、`spec`観点で実際に通した。次の経路は
文書として決めたが、一度も実際に通していない。初めて通すときに、動きを見て`audit.md` §4・skillを見直す
（そのときのPRで直す）。レビューでは、この経路の想定の上の端の場合は「既知の未検証」として扱い、このPRの
指摘にしない。ただし、公開の場に場所・再現方法が出る経路が文書の上で明らかなものは、このPRで直す。

- `privacy` / `security`観点の監査で、秘匿する候補が実際に出たときの報告とチャット
- 秘匿する候補からタスクを起こすPR（`docs/audit-tasks-*`）
- 修正のPR（`fix/task-NNN-audit-fix`）と、そのレビュー
- 修正がmainに入った後の記録のPR（`docs/task-NNN-audit-record`）

### 未決定事項（判断前の整理。判断の結果は上）

AIは次の既定値を採用し、質問しない。

- skillは新規に作る（`exploratory-audit`）。`code-reviewer`は差分の独立レビューが役割で、全体を探索する
  監査と入力・出力が違うため拡張しない。
- 観点の確認項目は`docs/code-review/audit.md`に置き、既存のレビュー入口と`security.md`を参照する
  （確認項目を書き写さない）。
- 最初に実際に回す観点は`spec`（仕様と実装の不一致）にする。秘匿の要らない観点で、結果をPlanに
  そのまま記録できるため。Q1が決まれば`privacy`か`security`も回す。

#### Q1: securityと個人データの保存・送信・削除に関わる指摘を、修正まで置く場所

- 何を決めるか: 公開の場に書けない指摘の詳細（場所・再現方法）を、修正まで置く場所。
- 決めないと何が止まるか: skillの出力手順と、`privacy` / `security`観点の監査（定期実行を含む）。
- A: このマシンの`<git-common-dir>/audits/`（`.git`の中。worktree間で共有され、commit・pushされない）。
  外部の設定が要らず、定期実行とskillからそのまま書ける。代わりにこのマシンにしか残らず、
  backupや他の端末からの参照は人間の手当てになる。
- B: GitHubのdraftのrepository security advisory。maintainerだけが見られ、修正用の一時的なprivate forkと
  結び付けられる。代わりに外部サービスへの書き込みで、`gh api`の許可ルールを足す必要があり（許可を広げる方向）、
  AIが自動で書く運用にするかを別に決める必要がある。
- C: 監査専用のprivateリポジトリを新しく作る。履歴が残り、端末をまたげる。代わりにリポジトリの作成・権限の
  管理が要り、2つ目のリポジトリへのpushを許可する必要がある。
- 推奨: A。既存の`scheduled-sessions/`と同じ置き場所の作りで、許可を広げずに済み、公開の場へ出る経路が
  ないため。修正後の記録は、修正PRのマージ後に、修正PRのPlanへ観点・重大度・修正内容を書き、
  `audits/`の該当ファイルを消す手順にする（タスクファイルには修正まで抽象的な名前だけを書く）。

#### Q2: 実行の頻度と起動方法

- 何を決めるか: 監査を手動で起動するか、定期実行に入れるか。
- 決めないと何が止まるか: skillの起動方法の記述と、`task-scheduler`との衝突の確認。
- A: 手動だけ（`/exploratory-audit <観点>`）。頻度の目安は週1回と、機能のまとまりがmainに入った後。
  `task-scheduler`には触れず、監査はファイルを変えずworktreeも作らないため衝突しない。代わりに回すのを忘れうる。
- B: `task-scheduler`に組み込み、週1回、着手できるタスクの空き枠で1観点を回す。worktreeは`audit-YYYYMMDD`
  （`task-NNN`の名前を持たないので着手済みの判定に入らない）にする。代わりに検査・自動実行の判定を変える
  ファイル（`scripts/task-scheduler.mjs`とtest）を変え、タスクの並列数の枠を使う。
- C: launchdに別のジョブを足す（例: 日曜2時）。タスクの枠を使わない。代わりに人間のマシンの定期起動を
  増やす（タスクの記述で人間の判断とされている）。
- 推奨: A。まず手動で数回回し、指摘の質と量を見てからB・Cを判断するほうが、検査の定義を変える範囲を
  小さくできるため。定期実行にする場合も、Q1が決まるまで`privacy` / `security`は回さない。

#### Q3: 秘匿しない観点（`spec` / `performance`）の監査結果を残す場所

- 何を決めるか: 不採用を含む監査結果の全体を、どこに残すか。
- 決めないと何が止まるか: 同じ誤検知を次の監査で再び挙げないための仕組みと、skillの出力手順。
- A: チャットにだけ出し、採用した候補は`docs/tasks`へ、不採用の理由は残さない。最も簡単だが、同じ誤検知が繰り返す。
- B: Q1と同じ置き場所に、観点ごとの報告ファイルとして残す（採否と理由を追記）。次の監査はそれを読んで
  不採用済みの候補を除く。公開されず、置き場所が1つで済む。
- C: `docs/audits/<日付>-<観点>.md`としてリポジトリに残す。履歴とレビューを経るが、監査のたびにPRが要る。
- 推奨: B。秘匿の要否で置き場所を分けると、観点の境界にある指摘（例: N+1の原因が認可の抜けにある）を
  誤って公開しうるため、報告は一律に非公開に置き、採用した候補だけを公開のタスクに起こす。

## 6. References and Documents to Update

- 参照: [TASK-023](../tasks/TASK-023-exploratory-audit-loop.md)、[privacy.md](../privacy.md)、
  [code-review](../code-review/)、[タスクの運用ルール](../tasks/README.md#運用ルール)、
  [TASK-021](../tasks/TASK-021-failure-classification.md)（検査・許可・reviewerの定義の扱い）、
  [pr-review-cycle](../../.claude/skills/pr-review-cycle/SKILL.md)、`scripts/task-scheduler.mjs`
- 更新（判断後。実装で増えた文書は「16. Completion Record」の実装差異を参照）: [AGENTS.md](../../AGENTS.md)（監査の入口を1行）、[docs/tasks/README.md](../tasks/README.md)
  （監査から起こしたタスクの扱い。Q2でBなら定期実行の記述も）、このPlan、タスクファイル

## 7. Proposed Approach

Q1〜Q3の判断後に、次の順で進める。

1. `docs/code-review/audit.md`に、観点ごとの対象範囲・読む正本・確認項目・秘匿の要否を書く。
2. `.claude/skills/exploratory-audit/SKILL.md`を作る。
   - 入力: 観点（1つ以上）と、任意の対象範囲（ディレクトリ）。
   - 手順: 正本の仕様と`audit.md`を読む → 実装を探索する → 候補ごとに根拠を確かめる → 報告を書く。
     コードは変えない。秘匿する観点は、チャット・コミット・PRに場所と再現方法を書かず、Q1の置き場所にだけ書く。
   - 出力: 候補ごとに、ID・観点・重大度・根拠（ファイル・行）・事実と推測の区別・影響・タスク化の案
     （タスク名・作業区分・完了条件の案）・確信度・採否の欄（人間が書く）。
   - 採用後: 運用ルールどおり未使用の次のIDでタスクファイルを作り、READMEの索引に足す手順。
     秘匿する候補は、タスクファイルに抽象的な名前と、Q1の置き場所の報告IDだけを書く。
3. AGENTS.mdとタスクREADMEから辿れるようにする。
4. 検証用のブランチ（pushしない）で仕様と実装を意図的に食い違わせ、`spec`観点で指摘できるかを確かめる。
5. mainの状態に`spec`観点で監査を回し、結果と採否の案をPlanに記録する。

## 8. Why This Approach

- 観点の中身を`docs/code-review/`に置くと、差分のレビューと監査で同じ正本を参照でき、指針の改善が両方に効く。
- 監査は読むだけでファイルを変えないため、手動で起動する限り`task-scheduler`のworktree・ブランチ・DBと
  重ならない。

## 9. Data Flow

```text
人間: /exploratory-audit <観点>
↓
skill: 正本（仕様・audit.md）と実装を読む（変更しない）
↓
報告: 候補ごとの根拠・重大度・タスク化の案（Q1/Q3の置き場所）
↓
人間: 採否を判断
↓
採用: docs/tasks へタスクを起こす（秘匿する候補は抽象的な名前だけ）
↓
修正PRのマージ後: 秘匿していた候補の記録を修正PRのPlanへ残す
```

## 10. Files to Change

1つのPR（見積もり12ファイル）。

- 新規: `.claude/skills/exploratory-audit/SKILL.md`（監査の手順・入出力）
- 新規: `docs/code-review/audit.md`（観点ごとの確認項目）
- 新規: このPlan
- 変更: `docs/tasks/TASK-023-exploratory-audit-loop.md`（状態・Planへのリンク・完了条件）
- 変更: `docs/tasks/README.md`（監査から起こしたタスクの扱い）
- 変更: `AGENTS.md`（監査の入口）
- 変更: `README.md`（文書一覧と、監査の起動方法）
- 変更: `.claude/settings.json`（denyに開発ログ・`tmp/`・`storage/`のReadを足す。R2）
- 変更: `.claude/skills/human-review-artifact/SKILL.md`（秘匿する候補の修正PRで、ページに再現手順を引用しないポインタ）
- 変更: `.claude/skills/pr-review-cycle/SKILL.md`（秘匿する候補の修正PRでは、再発防止の追記を後のPRへ回すポインタ）
- 変更: `.claude/agents/code-reviewer.md`・`docs/code-review/final-check.md`（秘匿する候補の修正PRで、指摘に再現手順・攻撃の経路を書かない）

Q2でBなら`scripts/task-scheduler.mjs`とそのtestが加わる。

## 11. Libraries / APIs

新しいdependencyはない。

## 12. Alternatives Considered

- `code-reviewer`を拡張して監査も担わせる: 入力が差分か全体か、出力がLGTMの判定か採否の候補かが違い、
  1つの定義に混ぜるとどちらの役割も曖昧になるため採用しない。

## 13. Risks / Things to Watch

- 監査の報告に個人データ・秘密情報が混ざる: 監査は`.env*`・credentialを読まず（既存のdeny）、DBの中身・
  ログを読まない。報告にはコードの場所と振る舞いだけを書く。
- 検査・許可・reviewerの定義を変える: skillとレビュー指針（`docs/code-review/`）、AGENTS.mdはAIへの指示に
  当たる。PRの「確認すること」に、変えたファイルと、既存の検査・レビューの手順が緩んでいないことの確認を挙げる。
- 並行タスクとのコンフリクト: TASK-020・TASK-022も定期実行で並行しうる。AGENTS.mdとタスクREADMEで重なる可能性がある。

## 14. Verification

### Manual

- 検証用のブランチで仕様と食い違わせた箇所を、`spec`観点の監査が根拠つきで指摘する。
- 秘匿する観点の監査で、チャット・コミット・PRに具体的な場所と再現方法が出ない。

### Automated

- `pnpm check`（markdown lintを含む）

## 15. Definition of Done

- タスクの完了条件をすべて満たし、検証の結果をCompletion Recordに記録している。

## 16. Completion Record

- 状態: 2026-10-08 実装済み。監査の結果の採否は人間の判断待ち（タスクはIn progressのまま）。
- 実装差異:
  - 変えるファイルに`README.md`（文書一覧と起動方法）と、レビューの指摘で`code-reviewer.md`・`final-check.md`・`pr-review-cycle`を足した
    （reviewerの定義を変えるが、報告に書かない範囲を足す向きで、検査は緩めていない）。
  - `audit.md`は`docs/code-review/`に置いたが、差分のレビューの入口ではないため、
    [`documentation.md`](../code-review/documentation.md) §1の「入口を増やしたら4か所へ接続する」の対象にせず、
    `code-reviewer`・`final-check.md`の手順2（読むレビュー入口）には接続していない（`AGENTS.md`の表と`README.md`からは
    辿れる）。両ファイルには、秘匿する候補の修正PRで`audit.md` §4の「修正のセッション」に従うというポインタだけを足した。
  - 秘匿する候補から起こしたタスクを実装するセッションへ書き方の制限を伝える方法は、`run-task`を変えず、
    タスクファイルに1文を書く形にした（`audit.md` §4）。実装するセッションは必ずタスクファイルを読むため。
- 検証結果:
  - `pnpm check`（markdown lintを含む）: 成功（終了コード0。レビューの修正のたびに再実行し、最後の修正の後にも実行した）。
  - 意図的な食い違いの検出: `origin/main`（`be905cb`）から作ったローカルのブランチで、`Dot.by_day`の並びを
    昇順に、`DayList::DEFAULT_LIMIT`を30から50に変え、中立なメッセージでコミットした（pushせず、検証後に
    worktreeとブランチを削除）。食い違えた場所を伝えず、履歴（`git log`・`git diff`）を見ないよう指定した
    サブエージェントに、`spec`観点・履歴の範囲で監査させた。2件とも正しい場所で指摘された（並び: 🟠・確信度 高、
    既定値: 🟡・確信度 高）。秘匿する候補は0件。
  - mainへの`spec`観点の監査: 基準`be905cb4eae4235f768d7d1f389034bd5607372a`（HEADと`origin/main`が一致、
    未コミットの変更なし）。対象は`apps/web/src/`・`apps/api/app/`・`contracts/`の全体。報告は
    `<git-common-dir>/audits/2026-10-08-spec.md`。秘匿しない候補2件、秘匿する候補0件。
    - AUD-20261008-01（🔵、確信度 高）: 契約はDotの操作に`403 email_unconfirmed`を定めるが、
      APIはメール未確認の利用者をsessionの復元時に外して`401 unauthenticated`を返し、このcodeを返さない
      （`contracts/openapi.yaml`のForbidden、`apps/api/app/controllers/concerns/authentication.rb`の
      `authenticate_user!`）。TASK-006 Planに差は記録されているが、契約と`contracts/README.md`が直っておらず、
      Webに通らない分岐が残る。AIの案: 採用（契約・READMEを実装に合わせる小さな文書タスク）。
      根拠の箇所は統合した側でも読み直して確かめた。秘匿しない判断（`audit.md` §1の例外）の根拠: 実装は
      Wardenが外した利用者を`401`にする。メール未確認の利用者そのもののspecはないが、同じ経路（Wardenの
      `active_for_authentication?`で外れる）をロック中の利用者で確かめるspec（`apps/api/spec/requests/authentication_spec.rb`）がある。採用する場合は、メール未確認の利用者
      そのものの`401`を確かめるspecを足すことをタスク化の案に含める。
    - AUD-20261008-02（🔵、確信度 低）: `/reflection`と`/dot`がserverの今日のDotの有無に関わらず空の状態を
      示す（`apps/web/src/router.tsx`）。`dot-history.md`の「実際のデータ状態と矛盾せず示す」に当たるかは
      mockの画面を対象とみなすか次第で、Webからserverに Dotを作れない現状では利用者が当たらない。
      AIの案: 保留（TASK-011の範囲と重なるため、着手時に確かめる）。
  - 報告の全体は非公開に置く（`audit.md` §3）が、ここに秘匿しない2件を場所つきで書き写したのは、TASK-023の完了条件
    「結果と採否をPlanに記録」のための例外である。以後の監査の結果は、採用してタスクに起こしたものだけが公開に出る。
  - 採否: 人間が報告の`採否`と`理由`を書く（未記入）。記入後、採用した候補を`audit.md` §5の手順でタスクに起こす。
    そのタスクを起こすPR（`docs/audit-tasks-*`）で、この記録に採否を写し、TASK-023の最後の完了条件にチェックを付けて
    Doneにする。採用がなければ、採否を写すだけの文書のPRで同じことをする。
  - IDの形式は、R1の判断で`AUD-<YYYYMMDD>-<観点>-<連番>`から`AUD-<YYYYMMDD>-<連番>`に変えた。非公開の報告の
    2件も同じIDに直した。
- 要確認: `settings.json`のdeny（R2）がGrep・Glob toolにも効くかは確かめていない。設定はセッションの開始時に
  読み込まれ、このセッションには反映されないため。次のセッションで、gitignore済みのダミーのファイルを
  `apps/api/tmp/`に置いてGrep toolで探し、結果に出ないことを確かめる（PRの「確認すること」）。
- 要確認: 公開してよい時機を「修正がmainに入った後」としたのは、プロダクトAPIを公開する環境がまだないため。
  deployの仕組みを入れるタスクで、本番に反映された後に変えるかを見直す。
- 要確認: 秘匿する候補から起こしたタスクを定期実行（`--permission-mode auto`、作業場所は`.claude/worktrees/task-NNN`）
  が拾ったとき、作業場所の外にある`<git-common-dir>/audits/`を読めるかは確かめていない。読めなければ`run-task`の
  止まる条件で止まるだけで、情報が漏れる方向ではない。初めてそのようなタスクを起こしたときに確かめる。
- 未実施: `privacy` / `security`観点の監査と、§14 Manualの「秘匿する観点の監査で、チャット・コミット・PRに
  具体的な場所と再現方法が出ない」の確認。秘匿の流れ（チャットへの出し方、タスクへの起こし方、修正後の記録）は
  まだ一度も通していない。初めて`privacy` / `security`観点を回すときに人間が確かめる（PRの「確認すること」）。
- レビューで直したこと（code-reviewer、1回目）: 公開の場の列挙を`audit.md` §4の1か所にし、タスクファイルの1文は
  §4を参照する形にした。秘匿する候補から起こすタスクに、マージ後の記録を完了条件として必ず持たせ、それまで
  Doneにしないとした。`performance`には性能の正本がまだないことを書いた。タスクのブランチでは起動しないようにした。
  任意のコードを実行するコマンドの使い方を絞った。
  （2回目）skillの禁止事項の例外を後半の2節に広げ、それぞれのブランチの作り方と`pr-review-cycle`に従うことを
  書いた。秘匿の条件を「`security.md`のどれかの節に当たる指摘」に広げた（`security`観点の対象は認証・認可の
  境界のまま）。`spec`の正本に`contracts/README.md`を足し、skillに`argument-hint`を足した。
- レビューで直したこと（Codex、1回目）: 秘匿の指示がタスクファイルにしかなく、独立レビュアー・Codexへ確実に
  伝わらなかった。タスクファイルの1文をPlanの`1. Status`にも写すとし（Planは修正のPRの差分に入る）、
  `code-reviewer`と`final-check.md`に、秘匿の記載があれば指摘に再現手順・攻撃の経路を書かないことを足した。
  `audit.md` §4に修正のセッションで書いてよい範囲（ファイル名は可、原因は抽象的に、再現手順はtestだけ）を書いた。
  （Codexの後のサブエージェント1回目）秘匿の公開の場にPRのタイトル・ブランチ名・ファイル名を足し、秘匿する候補の
  slugを`audit-fix`に固定した。修正のPRで足さずに先送りする再発防止を、報告の`再発防止:`に書き足し、記録のPRで
  指針へ足すとし、その完了条件を足した。秘匿するタスクの書き方を示し、定期実行で修正のPRの公開の時機を選べない
  ことを受け入れる前提に足した。
  （Codexの後のサブエージェント2回目）監査でGrep toolがgitignore済みのログまで読みうるため、`git grep`を優先し、
  Grep・Globの範囲を絞るとした（`settings.json`のdenyに`apps/api/log/`・`tmp/`を足すかは許可の変更のため人間に
  回した）。`AGENTS.md`のバグ対応の「原因」と`pr-review-cycle`の手順8に、§4への参照があるPRは同節に従うという
  ポインタを足し、reviewerの2ファイルに「原因が抽象的なことを指摘しない」を足した。
  （人間の判断の後）R1でIDから観点を外し、R2で`settings.json`のdenyに`apps/api/log/`・`apps/api/tmp/`を足した。
  reviewerが指摘しない範囲の規則を`audit.md` §4へ移し、reviewerの2ファイルはポインタだけにした。人間のレビュー用
  ガイドにも再現手順を引用しないとした。skillの禁止事項に`git fetch`の例外を書いた。
  （判断の後のサブエージェント1回目）denyの効く範囲を正確に書き、Bashの検索の範囲をskillで絞り、`storage/`をdenyと
  禁止事項に足した。秘匿する候補の修正PRは分けないとした（間のサブのPRには秘匿の合図が届かないため）。
  `human-review-artifact`に§4へのポインタを足し、秘匿を扱うセッションを共有しないこと、IDの連番を書く直前に
  決めることを書いた。
  （判断の後のサブエージェント2回目）秘匿の扱いを始める目印を「タスクのslugが`audit-fix`」に揃え（§4を参照する
  だけのPRが当たらないように）、5か所の書き方を同じにした。レビューの判断の記録にも§4を適用し、修正中に見つけた
  別の問題は報告に書き足すとした。denyのパターンをworktreeにも効く`./**/apps/api/...`にした。
  （R3の判断の後）秘匿の目印を「差分にslugが`audit-fix`のタスクかPlanがある」に広げ、タスクを起こすPRも含めた。
  レビュアーはタスク本文が抽象的なことを指摘しないとした。skillの禁止事項を§4への参照にし、タスクに写す1文に
  「PRは分けない」を足した。まだ通していない経路の範囲を区切った（上の「範囲の区切り」）。
  あわせてサブエージェント3回目の🔵（チャットを制限する理由、報告の詳細を消す時機、タスクREADMEの「採用」、
  秘匿しない例外を確信度とtestに結び付ける）を直した。秘匿する候補のタスク名を一般的なものにし、なお残る
  公開（未修正の問題がある事実・時期・IDの観点）を受け入れる前提として`audit.md` §4に書いた。
- 関連: [TASK-023](../tasks/TASK-023-exploratory-audit-loop.md)
