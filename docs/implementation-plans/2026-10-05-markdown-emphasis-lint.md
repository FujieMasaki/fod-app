# Implementation Plan: 強調の崩れを検出するlintと仕様文書のレビュー入口

## 1. Status

完了（2026-10-05）。実装差異と検証結果は §16。

**このPlanは事後に作成した。** PR #52（データ所在地の方針変更）のレビュー中に再発防止として着手し、
`AGENTS.md`の「新しいlibrary・設計判断・影響範囲の大きい変更では実装前にPlanを作成する」を外した。
同じ型の記録が[pr-review-cycle skill](2026-09-30-pr-review-cycle-skill.md) §1と
[product-vision](2026-09-30-product-vision.md) §1にもある（3回目）。**「レビューの再発防止を
仕組み化する変更」自体が規約を外していたので、今回は指摘を受けて事後に作成した。**

## 2. Goal

日本語の本文で`**`が強調にならずそのまま表示される崩れを、人のレビューではなく機械で止める。
あわせて、仕様・設計文書の変更に対するレビューの入口を用意し、同じ型の指摘が繰り返されないようにする。

## 3. Background

PR #52（データ所在地の方針変更）で、サブエージェントのレビューが**10巡しても🟠が出続けた**。
繰り返した型は4つある。

1. 検索結果の要約を一次資料として扱った
2. 方針を変えたのに、それに依存していた条件を見直さなかった
3. 正本と下流で条件の付き方がずれた
4. **日本語の本文で`**`が強調にならず、そのまま表示された**

(4)は人のレビューで見つけにくい。PRのmarkdown差分は既定でrawで表示されるため、**GitHub上の
表示を見るまで気づかない**。[`pr-review-cycle` skill](../../.claude/skills/pr-review-cycle/SKILL.md)の
手順8は「レビュアーが見落としやすい種類の問題は、レビュー観点への追記よりlint・型・testで
機械的に検出できる形を優先する」としているので、(4)をlintにし、(1)〜(3)を観点として文書に残す。

(1)〜(3)についてはコード向けのレビュー入口（`frontend/`・`backend/`）しかなく、
**文書だけの変更に対応する入口が無かった。**

## 4. Current State

- `scripts/check-naming.mjs`（`pnpm lint:naming`）が命名規約を機械的に検査する先例。
  `package.json`の`lint`に挟み、`lefthook.yml`のpre-commitとCIの`Check`ジョブで走る。
- `scripts/ci-changes.mjs`が変更パスを`web` / `api` / `docs` / `both`へ分類し、
  `.github/workflows/ci.yml`の各ジョブが`needs.changes.outputs.web != 'false'`等で絞る。
  **`docs/`は`docs`へ分類されるため、web・apiのジョブがすべて止まる。**
- `scripts/ci-gate.mjs`が必須チェックの結果を検証し、`CI Gate`ジョブが呼ぶ。
- `docs/code-review/`には`frontend/`・`backend/`・`final-check.md`がある。
- markdownのlintは無い（`eslint`はJS/TSのみ、`redocly lint`はOpenAPIのみ）。

## 5. Scope and Non-goals

**対象**

- `**`による強調が成立しない形の検出と、安全な範囲での自動修正
- 手で書いたすべてのmarkdown（`docs/`・`AGENTS.md`・`README.md`・`contracts/README.md`・`.claude/`）
- 変更の種類に関わらずCIで検査すること
- 仕様・設計文書のレビュー入口の新設と、読む主体への接続

**対象外**

- markdownの書式全般（行長・見出しの階層・リンク切れ・表の整形）。既存のlinter（markdownlint等）を
  入れる判断は別に行う。**今回は「GitHub上で表示が壊れる」1点に絞る**
- `*`1個の強調（`*斜体*`）。この文書群では使っていない
- 日本語の文章校正（表記ゆれ・読点の位置）
- `contracts/openapi.yaml`の`description`（Redocで描画されるが、YAMLの中なので対象にしない。
  同じ崩れが3箇所あるが、API契約の意味は変わらないため別に扱う）

**決定済みの事項（2026-10-05に人間が判断）**

- 既存文書に残っていた433件は、baselineにせず**すべて直す**。`--fix`が機械的で、
  `*`を除いた本文が変わらないことを検証できるため

## 6. References and Documents to Update

**参照**

- [`AGENTS.md`](../../AGENTS.md) — 「Code Review」「文書の役割と更新」「Implementation Plan」
- [`pr-review-cycle` SKILL.md](../../.claude/skills/pr-review-cycle/SKILL.md) — 手順8（再発防止の仕組み化）
- [`docs/code-review/frontend/README.md`](../code-review/frontend/README.md) — 重大度とレビュー出力の形式
- CommonMark 0.29/0.30 の emphasis（left-flanking / right-flanking delimiter run）。
  GitHubはcmark-gfmを使うため、**判定はGitHubの`/markdown` APIで実際の描画と突き合わせて確認する**

**同じ変更で更新する現行文書**

- `docs/code-review/documentation.md`（新設）
- `AGENTS.md`の「作業前に読む文書」表、`README.md`の文書一覧
- `.claude/agents/code-reviewer.md`の手順2、`docs/code-review/final-check.md`の手順2

## 7. Proposed Approach

1. **判定**: blockごとに`**`のdelimiterの対応を取り、各`**`が開き側・閉じ側に使えるかを
   前後の文字からflanking規則で判定する。blockは空行・見出し・listの先頭・表の行で区切り、
   行の継ぎ目には改行を入れる（softbreakは空白）。
2. **除外**: fenceのcode block、4空白インデントのcode block、コードスパンの中身。
   コードスパンは**同じ長さのplaceholderへ置き換え、backtickは残す**（位置を保ち、かつ
   隣接する`**`から見た隣の文字をbacktickのまま保つ）。
3. **自動修正**: 崩れている`**`と隣の句読点を入れ替える。入れ替えは長さを変えないので、
   重ならなければ同じ行へ同時に適用できる。書き込む前に「長さが一致」「`*`を除いた本文が一致」
   「`***`以上のrunを増やしていない」を検査する。
4. **実行点**: `package.json`の`lint`、`lefthook.yml`のpre-commit（glob `*.md`）、
   CIの専用ジョブ（**`changes`に依存させず常に実行**し、`ci-gate.mjs`の必須チェックに入れる）。
5. **レビュー入口**: `docs/code-review/documentation.md`を新設し、(1)〜(3)の観点を書く。
   読む主体（セルフレビュー・`code-reviewer`・Codex）へ4か所で接続する。

## 8. Why This Approach

- **flanking規則で判定する理由**: `**`の個数の偶奇では検出できない。`**強調。**続き`は`**`が
  偶数でも強調にならない。初版は偶奇で判定していたため、**実際に起きている崩れを1件も
  検出できていなかった**（§16の実装差異）。
- **自動修正を入れ替えに限る理由**: 文字を足さず並べ替えるだけなら、`*`を除いた本文が不変という
  **検証できる不変条件**が立つ。433件を一括で直す根拠がこれで得られる。文面の判断が要る形
  （対になる括弧、リンクやコードスパンの境界）は自動修正から外し、指摘だけ出して人に返す。
- **CIで常に走らせる理由**: `docs/`だけの変更ではweb・apiのジョブが止まるため、
  実行点がlocalのpre-commitだけになる。pre-commitは`--no-verify`・lefthook未インストールの環境・
  GitHubのweb編集・別のエージェントで容易に外れる。**判定方法を一度間違えた経緯があるので、
  「通っているはず」の根拠をlocalのhookだけに置かない。**
- **既存のmarkdown linterを入れない理由**: 目的は1点（GitHub上で表示が壊れる形）で、
  CJKの句読点に隣接する`**`という日本語特有の形である。汎用linterの設定を広く入れると、
  既存文書の体裁に対する大量の指摘を抱え、本来止めたい1点が埋もれる。

## 9. Data Flow

データフローのある変更ではない（利用者の操作・state・storageに関わらない開発者向けの検査）。
検査の流れは次のとおり。

```text
手で書いた .md
↓
walk（生成物・依存のディレクトリを除外）
↓
analyzeEmphasis（block分割 → flanking判定 → errors / swaps）
↓
--fix: applySwaps → keepsProse で検証 → 書き込み
↓
exit code（pre-commit / CI Gate）
```

## 10. Files to Change

| ファイル | 新規/変更 | 役割 |
| --- | --- | --- |
| `scripts/check-markdown.mjs` | 新規 | 判定と`--fix`。`pnpm lint:markdown`の実体 |
| `scripts/check-markdown.test.mjs` | 新規 | flanking判定・`--fix`の正常系と中止系・除外の検証 |
| `package.json` | 変更 | `lint:markdown`を追加し、`lint`へ挟む |
| `lefthook.yml` | 変更 | pre-commitへ`*.md`のglobで追加 |
| `.github/workflows/ci.yml` | 変更 | `Docs & scripts`ジョブを追加し、`CI Gate`の`needs`へ入れる |
| `scripts/ci-gate.mjs` | 変更 | markdownを必須チェックにする（targetに関わらず） |
| `scripts/ci-gate.test.mjs` | 変更 | 文書だけの変更でもmarkdownが必須であることのtest |
| `scripts/ci-changes.mjs` | 変更 | checker本体とtestを`webPaths`へ（checkerを変えたらCIで検査する） |
| `docs/code-review/documentation.md` | 新規 | 仕様・設計文書のレビュー入口 |
| `AGENTS.md` / `README.md` / `.claude/agents/code-reviewer.md` / `docs/code-review/final-check.md` | 変更 | 入口への接続 |

## 11. Libraries / APIs

**新しいdependencyは追加しない。** Node標準の`node:fs/promises`・`node:path`・`node:process`・
`node:url`と、`node:test`だけを使う。`check-naming.mjs`と同じ作り方である。

CommonMarkのパーサ（`commonmark`・`remark`等）を入れてASTで判定する選択肢もあるが、
**必要なのは「このdelimiterが強調として成立するか」1点**で、そのためにパーサ全体と
その更新追従を抱える必要がない。判定の正しさはGitHubの`/markdown` APIとの突き合わせで担保する。

## 12. Alternatives Considered

| 案 | 内容 | 採否 |
| --- | --- | --- |
| A（採用） | 専用のscriptでflanking規則を実装し、`--fix`を持つ | 目的に絞れ、dependencyが増えない。判定はGitHubの描画と突き合わせて確認できる |
| B | `markdownlint`等を導入する | 不採用。`MD037`等は近いが、**CJKの句読点に隣接する`**`を狙って検出する規則は無い**。設定を広く入れると既存文書の体裁への指摘が大量に出て本来の1点が埋もれる |
| C | CommonMarkパーサでASTを作り、強調が付いたかを見る | 不採用。判定は正確になるがdependencyと追従のコストが大きい。また`--fix`のための位置情報を自分で扱う必要は残る |
| D | レビュー観点への追記だけにする | 不採用。**人のレビューで見落とす型だから機械化する**という手順8の方針に反する。実際に10巡のレビューを通り抜けていた |
| E | 既存の433件はbaselineにし、変更行だけ検査する | 不採用。`--fix`が機械的で本文不変を検証できるため、一括で直すほうが状態が単純になる（2026-10-05に人間が判断） |

## 13. Risks / Things to Watch

- **判定がGitHubの実挙動とずれる**。CommonMarkの仕様とcmark-gfmの実装には差があり得る。
  →`/markdown` APIとの突き合わせで確認し、ずれたケースはtestへ落とす。
- **`--fix`が本文を壊す**。→長さ・`*`を除いた本文・`***`以上のrunの3点を書き込み前に検査する。
  満たさない場合は書き込まず人に返す。
- **誤検知で正しい記述を壊す**。特にcode blockとコードスパン。
  →fence・4空白インデント・コードスパンを除外し、実際のコーパスで0件になることを確認する。
- **既知の制限: 検出漏れ**（現状のコーパスでは該当0件）
  - setext見出し（`===`・`---`の下線）を見出しとして扱わず、段落として解析する
  - code blockの判定はfenceと4空白インデントだけで、list項目の中の深いインデントは
    段落の続きとして扱う（CommonMarkより緩い）
- **既知の制限: 誤検知**（現状のコーパスでは該当0件。踏んだときに原因を探し直さないため記録する）
  - HTMLブロック（`<div>`・`<details>`から空行まで）の中を本文として解析する。GitHubはrawで
    通すので、`**`を含むHTMLブロックを書くと指摘が出る（`--fix`の対象にもなる）
  - コードスパンに入れていない裸の`**`（globやURL）は「閉じていません」になる。
    `` `apps/web/src/**` ``のようにコードスパンへ入れる運用で避ける
  - 水平線の`***`は除外したが、`*`を4つ以上並べた水平線（`****`）は「アスタリスクが4個連続」として
    指摘が出る
- **`--fix`が加える半角空白**。閉じの直前が対象外の文字（`）`・backtick等）のときは空白を挟んで
  成立させるため、日本語の本文に半角空白が見える形になる。語の途中で切れる場合は、
  空白ではなく強調の範囲を直すほうが読みやすい（2026-10-05に`TASK-004:63`で1件そう直した）。

## 14. Verification

### Manual

- GitHubの`/markdown` API（`gh api --method POST /markdown -f mode=gfm -f text=...`）で、
  崩れる形と直った形の描画を突き合わせる。
- `--fix`の適用後に`git diff`を読み、変わった行がすべて`**`の位置だけであることを確認する。

### Automated

- `node --test scripts/check-markdown.test.mjs` — flanking判定、閉じ側・開き側の検出と修正結果、
  自動修正しない形（対になる括弧・リンク・コードスパン）、行末のsoftbreak、見出し、表のcell、
  code blockの除外、同じ行の複数箇所、`***`を作る入れ替えを当てないこと、
  **ファイルを書く`--fix`の正常系・中止系・除外ディレクトリ**。
- `node --test scripts/ci-gate.test.mjs` — 文書だけの変更（web・apiがどちらもfalse）でも
  markdownのfailure・skipでgateが落ちること。
- `pnpm lint:markdown` — コーパス全体で0件。
- `pnpm check` / `pnpm test:scripts`。

## 15. Definition of Done

- 手で書いたすべてのmarkdownで違反が0件である
- `--fix`が本文を変えないことを、不変条件の検査とdiffの両方で確認している
- 判定がGitHubの実際の描画と一致することを確認している
- 文書だけの変更でもCIが検査し、落ちることを確認している
- レビュー入口が、読む主体（セルフレビュー・`code-reviewer`・Codex）とREADMEへ接続されている
- lint / testが通る

## 16. Completion Record

- **状態**: 2026-10-05 完了。
- **実装差異**
  1. **初版の判定方法が間違っていた。** `**`の個数の偶奇で判定したため、`**強調。**続き`のように
     偶数で壊れる形を1件も検出できなかった。サブエージェントの指摘を受けてflanking規則へ作り直した。
     **差し替えたところ既存文書に433件の崩れが見つかった**（作り直した後のcheckerを`4e937b0`へ
     当てて計測。`origin/main`では357件）。検出方法そのものが間違っていると、通っていることが
     何の保証にもならない。
  2. **検査範囲を`docs/`から手で書いたmarkdown全体へ広げた。** `contracts/README.md`に10件
     残っていた（API契約レビューの入口で、観点の箇条書きの先頭が`**`のまま表示されていた）。
  3. **`--fix`から対になる括弧・鉤括弧を外した。** 初版は`（）「」`も入れ替えたため、
     閉じ括弧だけが強調の外へ出て範囲が割れた。既存13箇所は手で直した。
  4. **入れ替えが`****`を作る場合があった。** `A**、**C`はどちらを動かしてももう一方と隣接する。
     `*`を除いた本文も`*`の個数も変わらないため元のガードを通ってしまう。1件ずつ検査して
     当てない形にし、ガードへ`***`以上のrunの検査を足した。
  5. **コードスパンに隣接する`**`を見逃していた。** placeholderでbacktickまで`x`に化かしており、
     flankingの判定が変わっていた。backtickを残す形に直し、見つかった6箇所を手で直した。
  6. **4空白インデントのcode blockと2連backtickのコードスパンを誤検知し、`--fix`が当たっていた。**
     どちらも除外し、fenceは開いた記号（``` / `~~~`）で閉じる形にした。
  7. CIジョブ名を`Markdown`から`Docs & scripts`にした（`pnpm test:scripts`も走らせているため）。
- **検証結果**
  - `pnpm lint:markdown` — 0件（手で書いたmarkdown 73ファイル）。
  - `node --test scripts/*.test.mjs` — 全件pass。
  - GitHubの`/markdown` APIとの突き合わせ — 崩れる形（閉じ側・開き側・コードスパン隣接）と
    直った形の双方を確認。`**（a）**と**（b）**`のように`**`は出ないが範囲が意図と違う形は、
    指摘として出す方針にした。
  - `--fix`適用後のdiff — 406行が変わり、`*`を除いた本文が変わった行は0。
  - **未実施**: `lefthook`のpre-commitは実際のcommitで発火を確認したが、`--no-verify`や
    lefthook未インストールの環境での挙動は確認していない（CIで常に走らせる理由がこれである）。
    GitHubのbranch protectionで`CI Gate`がrequired status checkに入っているかはリポジトリ設定の
    問題で、このPlanの外。
- **関連**
  - PR #52（データ所在地の方針変更）。所在地の判断そのものは
    [2026-09-29-task-003-generation-design.md](2026-09-29-task-003-generation-design.md)。
  - レビュー入口: [`docs/code-review/documentation.md`](../code-review/documentation.md)。
