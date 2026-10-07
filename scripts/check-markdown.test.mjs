import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  analyzeEmphasis,
  applySwaps,
  checkMarkdown,
  findEmphasisErrors,
  flanking,
  keepsProse,
  maskHtmlComments,
  skippingStates,
  stripInlineCode,
} from "./check-markdown.mjs";

// `--fix`相当。本文が変わらないことと、直し終えて違反が残らないことも併せて確認する。
function fix(source) {
  let fixed = source;
  for (let pass = 0; pass < 10; pass += 1) {
    const { swaps } = analyzeEmphasis(fixed, "a.md");
    if (swaps.length === 0) break;
    const result = applySwaps(fixed, swaps);
    if (result.applied === 0) break;
    fixed = result.text;
    assert.ok(keepsProse(source, fixed), `入れ替え以外で本文が変わっている: ${JSON.stringify(fixed)}`);
  }
  assert.deepEqual(findEmphasisErrors(fixed, "a.md"), [], "直したのに違反が残っている");
  return fixed;
}

async function withTempDir(body) {
  const directory = await mkdtemp(path.join(tmpdir(), "check-markdown-"));
  try {
    return await body(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("flankingはCommonMarkの規則どおりに判定する", () => {
  // `。**続` は直前が句読点で直後が非空白なので閉じ側に使えない。
  assert.deepEqual(flanking("。", "続"), { canOpen: true, canClose: false });
  // `は**「` は直後が句読点で直前が非空白・非句読点なので開き側に使えない。
  assert.deepEqual(flanking("は", "「"), { canOpen: false, canClose: true });
  assert.deepEqual(flanking(" ", " "), { canOpen: false, canClose: false });
  // blockの端はundefinedで渡す（空白扱い）。
  assert.deepEqual(flanking(undefined, "強"), { canOpen: true, canClose: false });
  assert.deepEqual(flanking("調", undefined), { canOpen: false, canClose: true });
});

test("`\\p{P}`に入らないASCII punctuationも句読点として扱う", () => {
  // CommonMarkのpunctuationはASCII punctuationを含む。`|`は`\p{P}`に入らない。
  for (const character of ["|", "=", "+", "<", ">", "~", "^", "$"]) {
    assert.deepEqual(flanking(character, "あ"), { canOpen: true, canClose: false }, character);
  }
});

test("句点の直後の閉じ`**`を検出して直す（`**`の数が偶数でも壊れる）", () => {
  const source = "- **強調である。**続きの文\n";
  const errors = findEmphasisErrors(source, "a.md");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\.md:1: 句読点の直後の `\*\*` は閉じ側に使えません/);
  assert.equal(fix(source), "- **強調である**。続きの文\n");
});

test("句読点の直前の開き`**`を検出して直す", () => {
  const source = "そして**、続きがある**。\n";
  const errors = findEmphasisErrors(source, "a.md");
  assert.match(errors[0], /a\.md:1: 句読点の直前の `\*\*` は開き側に使えません/);
  assert.equal(fix(source), "そして、**続きがある**。\n");
});

test("対になる括弧・鉤括弧とリンクの境界は自動修正の対象にしない", () => {
  // 片方だけを強調の外へ出すと範囲が割れるため、指摘だけ出して人に返す。
  for (const source of [
    "ではなく**「0であること」**とする。\n",
    "正本は**[architecture.md](a.md)の要求に従う**。\n",
    "- **（原子的関連付けの実装）**録音attemptを…\n",
  ]) {
    const { errors, swaps } = analyzeEmphasis(source, "a.md");
    assert.ok(errors.length >= 1, source);
    for (const error of errors) assert.doesNotMatch(error, /--fix/, source);
    assert.deepEqual(swaps, [], source);
  }
});

test("正しく書けている強調は検出しない", () => {
  assert.deepEqual(findEmphasisErrors("- **強調である**。続きの文\n", "a.md"), []);
  // 閉じの直後が空白なら句点を含んだままでも閉じられる。
  assert.deepEqual(findEmphasisErrors("- **強調である。** 続きの文\n", "a.md"), []);
  // 行末（softbreak）も空白として扱う。
  assert.deepEqual(findEmphasisErrors("**強調である。**\n", "a.md"), []);
  assert.deepEqual(findEmphasisErrors("決まり、**保証できない。**\n次の行\n", "a.md"), []);
  // 開きの直前が句読点なら、直後が句読点でも開ける。
  assert.deepEqual(findEmphasisErrors("ではなく「**0であること**」とする。\n", "a.md"), []);
});

test("3個以上のアスタリスクの連続を検出する", () => {
  const errors = findEmphasisErrors("**前半である。****後半**\n", "a.md");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\.md:1: アスタリスクが4個連続/);
});

test("閉じていない強調を検出する", () => {
  assert.deepEqual(findEmphasisErrors("**閉じていない\n続きの行\n", "a.md"), [
    "a.md:1: `**` が閉じていません。",
  ]);
});

test("行をまたいで閉じる強調は正しいとみなす", () => {
  assert.deepEqual(findEmphasisErrors("**前半から\n後半まで**つながる\n", "a.md"), []);
});

test("空行・見出し・listの先頭でblockを区切る", () => {
  assert.deepEqual(findEmphasisErrors("**ひとつめ**\n\n**ふたつめ**\n", "a.md"), []);
  assert.deepEqual(findEmphasisErrors("- **ひとつめ**\n- **ふたつめ**\n", "a.md"), []);
  assert.deepEqual(findEmphasisErrors("## 見出し\n\n**本文**\n", "a.md"), []);
  assert.deepEqual(findEmphasisErrors("- **閉じ忘れ\n- **つぎの項目**\n", "a.md"), [
    "a.md:1: `**` が閉じていません。",
  ]);
});

test("見出しは1行、表はcellごとに閉じる必要がある", () => {
  assert.deepEqual(findEmphasisErrors("| a | **b** |\n| c | **d** |\n", "a.md"), []);
  assert.deepEqual(findEmphasisErrors("| a | **閉じ忘れ |\n", "a.md"), ["a.md:1: `**` が閉じていません。"]);
  // cellをまたいだ強調は成立しないので、cellごとに別の崩れとして出る。
  assert.deepEqual(findEmphasisErrors("| **ひとつめ | ふたつめ** |\n", "a.md"), [
    "a.md:1: `**` が閉じていません。",
    "a.md:1: `**` が開き側にも閉じ側にも使えない位置にあります。前後の空白か句読点の位置を見直してください。",
  ]);
  assert.deepEqual(findEmphasisErrors("## **閉じ忘れ\n", "a.md"), ["a.md:1: `**` が閉じていません。"]);
});

test("コードblockとコードスパンの中は見ない", () => {
  assert.deepEqual(findEmphasisErrors("```text\n**数えない\nsrc/**\n```\n", "a.md"), []);
  // `**` を含むglobが本文に出ても検出しない
  assert.deepEqual(findEmphasisErrors("パターンは `apps/web/src/**` を使う\n", "a.md"), []);
  // コードスパンを挟んだ強調を4連アスタリスクとして誤検出しない
  assert.deepEqual(findEmphasisErrors("| **`started_at`** | **定義** |\n", "a.md"), []);
});

test("stripInlineCodeは長さとbacktickを保ったまま置き換える", () => {
  // backtickを残さないと、隣接する`**`から見た隣の文字が句読点でなくなり判定が変わる。
  assert.equal(stripInlineCode("a `code` b"), "a `xxxx` b");
  assert.equal(stripInlineCode("**`x`**"), "**`x`**");
  assert.equal(stripInlineCode("値は ``a**b`` だ"), "値は ``xxxx`` だ");
  assert.equal(stripInlineCode("値は ``a**b`` だ").length, "値は ``a**b`` だ".length);
});

test("コードスパンに隣接した`**`は強調にならないので検出する", () => {
  // GitHubの`/markdown` APIで確認: `値は**`code`**である。`は`**`が本文に出る。
  const { errors, swaps } = analyzeEmphasis("値は**`code`**である。\n", "a.md");
  assert.ok(errors.length >= 1);
  assert.match(errors[0], /開き側に使えません/);
  // backtickと入れ替えるとコードスパンが壊れるので、自動修正はしない。
  assert.deepEqual(swaps, []);
  // 空白を挟めば成立する。
  assert.deepEqual(findEmphasisErrors("値は **`code`** である。\n", "a.md"), []);
  assert.deepEqual(findEmphasisErrors("| **`started_at`** | **定義** |\n", "a.md"), []);
});

test("4空白インデントのcode blockと種類の違うfenceの中は見ない", () => {
  // `--fix`がコマンド例を書き換えないこと。
  const indented = "文\n\n    cmd --flag **a。**b\n\n次の段落\n";
  assert.deepEqual(findEmphasisErrors(indented, "a.md"), []);
  assert.equal(applySwaps(indented, analyzeEmphasis(indented, "a.md").swaps).applied, 0);
  // 段落の続きの行はcode blockにならない（4空白でも本文として見る）。
  assert.deepEqual(findEmphasisErrors("文のつづき\n    **崩れている。**続き\n", "a.md"), [
    "a.md:2: 句読点の直後の `**` は閉じ側に使えません。`**強調**。` の形にするか、閉じの後に空白を置いてください（`--fix` で直せます）。",
  ]);
  // ``` の中に ~~~ が出てもfenceは閉じない。
  assert.deepEqual(findEmphasisErrors("```text\n~~~\n**a。**b\n```\n", "a.md"), []);
  // 閉じfenceは開きと同じ長さ以上が必要。````の中の```では閉じない。
  assert.deepEqual(findEmphasisErrors("````markdown\n```\n**a。**b\n```\n````\n", "a.md"), []);
  // ````は````で閉じ、そのあとの行は本文として見る。
  assert.equal(findEmphasisErrors("````\n**a。**b\n````\n**崩れている。**続き\n", "a.md").length, 1);
});

test("fenceのインデントは3空白まで、閉じていなければ報告する", () => {
  // 4空白のcode blockの中のfence行で状態を反転させない（以降の全行が無検査になる）。
  const indentedFence = "文\n\n    ```sh\n    cmd\n\n**崩れている。**続き\n";
  assert.equal(findEmphasisErrors(indentedFence, "a.md").length, 1);
  assert.match(findEmphasisErrors(indentedFence, "a.md")[0], /^a\.md:6:/);
  // 3空白までは有効なfence。
  assert.deepEqual(findEmphasisErrors("   ```sh\n**a。**b\n   ```\n", "a.md"), []);
  // 閉じていないfenceは黙って通さない。
  assert.deepEqual(findEmphasisErrors("```sh\ncmd\n\n**崩れている。**続き\n", "a.md"), [
    "a.md: ``` で開いたcode blockが閉じていません。そこから後の行を検査していません。",
  ]);
});

test("HTMLコメントとYAML frontmatterの中は見ない", () => {
  // 表示されない文字列を`--fix`が書き換えないようにする。
  for (const source of [
    "文\n\n<!-- **メモ。**続き -->\n",
    "文\n\n<!--\n**メモ。**続き\n-->\n",
    "---\nname: a\ndescription: **説明である。**続き\n---\n\n本文\n",
  ]) {
    assert.deepEqual(findEmphasisErrors(source, "a.md"), [], source);
    assert.equal(applySwaps(source, analyzeEmphasis(source, "a.md").swaps).applied, 0, source);
  }
  // コメントの外、前付けの後は従来どおり検出する。
  assert.equal(findEmphasisErrors("<!-- メモ -->\n**崩れている。**続き\n", "a.md").length, 1);
  assert.equal(findEmphasisErrors("---\nname: a\n---\n\n**崩れている。**続き\n", "a.md").length, 1);
  // 2行目以降の`---`は前付けの開始ではない（水平線かsetextの下線）。
  assert.equal(findEmphasisErrors("本文\n\n---\n\n**崩れている。**続き\n", "a.md").length, 1);
});

test("コメントが開いている間は、飛ばす経路より先に閉じる機会を与える", () => {
  // fence行や4空白行で`return`すると、その行の`-->`が消費されずコメントが開いたまま残り、
  // 以降が黙って無検査になる（後ろに余分な`-->`があるとEOFの報告まで消える）。
  // 閉じが4空白インデントの行にある。GitHubの`/markdown`で確認すると、HTML blockは`-->`を
  // 含む行で終わり、その後の`**壊れ。**続き`は段落なので`**`が本文に出る。
  const closedOnIndented = findEmphasisErrors("<!-- a\n\n    --> \n\n**壊れ。**続き\n\n-->\n", "a.md");
  assert.equal(closedOnIndented.length, 1, JSON.stringify(closedOnIndented));
  assert.match(closedOnIndented[0], /^a\.md:5: 句読点の直後の/);

  // 閉じがfence行の中にある。この場合はHTML blockのあとの ``` が開きfenceになり、
  // 以降はcode blockの中になる（GitHubも`<pre><code>`で描画する）。強調は指摘しないが、
  // **黙って通さず「fenceが閉じていません」を報告する**。
  const closedOnFence = findEmphasisErrors("<!-- a\n\n```text\n-->\n```\n\n**壊れ。**続き\n\n-->\n", "a.md");
  assert.equal(closedOnFence.length, 1, JSON.stringify(closedOnFence));
  assert.match(closedOnFence[0], /で開いたcode blockが閉じていません/);

  // 行をまたぐ正常なコメントの中は、従来どおり見ない。
  assert.equal(findEmphasisErrors("文\n\n<!--\n**メモ。**続き\n-->\n\n**崩れ。**続き\n", "a.md").length, 1);
});

test("コードスパン・code blockの中の`<!--`でコメントの状態を反転させない", () => {
  // 反転すると、そこから後の行が黙って無検査になる。
  assert.equal(findEmphasisErrors("書き方は `<!--` である\n\n**崩れている。**続き\n", "a.md").length, 1);
  assert.equal(findEmphasisErrors("文\n\n    <!-- 例\n\n**崩れている。**続き\n", "a.md").length, 1);
  assert.equal(findEmphasisErrors("```text\n<!-- 例\n```\n\n**崩れている。**続き\n", "a.md").length, 1);
});

// 行を飛ばす状態を「開いたまま閉じない」形にする入力。`skippingStates`のすべての状態を覆う
// （覆っていなければ下のtestが落ちるので、状態を足したらここにも足すことになる）。
const unclosedFixtures = {
  fence: "```sh\ncmd\n\n**崩れている。**続き\n",
  comment: "<!-- 未完\n\n**崩れている。**続き\n",
  // 2行目がYAMLのkeyなので前付けとして扱われ、閉じの`---`が無い。
  frontmatter: "---\nname: a\n本文の**強調。**続き\n",
};

test("行を飛ばす状態は、すべて閉じ忘れを報告する", () => {
  // 1つでも報告を漏らすと、そのファイルが丸ごと検査されないままCIが緑になる。
  // fence・HTMLコメント・frontmatterの3つで順番にその穴を作ったので、網羅を機械で確かめる。
  assert.deepEqual(
    Object.keys(unclosedFixtures).sort(),
    Object.keys(skippingStates).sort(),
    "行を飛ばす状態を足したら、閉じ忘れのfixtureも足す",
  );

  for (const [name, source] of Object.entries(unclosedFixtures)) {
    const errors = findEmphasisErrors(source, "a.md");
    assert.equal(errors.length, 1, `${name}: 閉じ忘れを1件だけ報告する（実際: ${JSON.stringify(errors)}）`);
    assert.match(errors[0], /^a\.md: /, name);
    assert.match(errors[0], /検査していません/, `${name}: 無検査になったことが分かる文言で報告する`);
  }

  // 1行目の`---`を水平線として書いた場合も、黙らずに報告する。
  assert.equal(findEmphasisErrors("---\n\n本文の**強調。**続き\n", "a.md").length, 1);
});

test("すべての行が、記録された扱い方のどれかで処理される", () => {
  // 行を飛ばす経路を足して記録を忘れると、返り値がundefinedになって内部エラーが出る。
  // これは`skippingStates`の表の外にローカル変数で状態を足した場合も捕まる。
  const samples = [
    "---\nname: a\n---\n\n# 見出し\n\n本文の**強調**。\n\n| a | **b** |\n| --- | --- |\n",
    "```sh\ncmd\n```\n\n    indented\n\n\ttabbed\n\n***\n\n<!-- メモ -->\n\n> 引用の**強調**。\n",
  ];
  for (const source of samples) {
    const errors = findEmphasisErrors(source, "a.md");
    for (const error of errors) {
      assert.doesNotMatch(error, /内部エラー/, `扱い方が記録されていない行がある: ${error}`);
    }
  }
});

test("ファイル末尾の崩れは、どんな経路で飛ばされても必ず報告される", () => {
  // `skippingStates`の表に載っていない形で行を飛ばす状態を足されても落ちるようにする。
  // 表の網羅検査だけでは「表の外にローカル変数で足した場合」を守れない。
  const broken = "**崩れている。**続き\n";
  const prefixes = {
    ...unclosedFixtures,
    通常の本文: "文\n\n",
    閉じたfence: "```sh\ncmd\n```\n\n",
    閉じたコメント: "<!-- メモ -->\n\n",
    閉じたfrontmatter: "---\nname: a\n---\n\n",
    "4空白code block": "文\n\n    cmd\n\n",
    "tabのcode block": "文\n\n\tcmd\n\n",
  };
  for (const [name, prefix] of Object.entries(prefixes)) {
    const errors = findEmphasisErrors(prefix + broken, "a.md");
    assert.ok(errors.length >= 1, `${name}: 末尾の崩れが黙って通った`);
  }
});

test("tab・blockquoteのcode blockを本文として扱わない", () => {
  // tabは4空白相当。`^ {4,}`だけを見ていると`--fix`がコマンド例を書き換える。
  const tabbed = "文\n\n\tcmd --x **a。**b\n\n文\n";
  assert.deepEqual(findEmphasisErrors(tabbed, "a.md"), []);
  assert.equal(applySwaps(tabbed, analyzeEmphasis(tabbed, "a.md").swaps).applied, 0);
  // blockquoteの中のfenceもfenceとして扱う。
  const quoted = "> ```sh\n> **a。**b\n> ```\n";
  assert.deepEqual(findEmphasisErrors(quoted, "a.md"), []);
  // blockquoteの本文は従来どおり検出する。
  assert.equal(findEmphasisErrors("> **崩れている。**続き\n", "a.md").length, 1);
});

test("1行目の`---`は、続く行がYAMLに見えるときだけ前付けとして扱う", () => {
  // 水平線として書かれた`---`を前付け扱いすると、2つ目の`---`までが黙って無検査になる。
  assert.equal(findEmphasisErrors("---\n本文**崩れ。**続き\n---\n後**崩れ。**続き\n", "a.md").length, 2);
  assert.equal(findEmphasisErrors("---\n\n本文**崩れ。**続き\n", "a.md").length, 1);
  // 本物の前付けは従来どおり飛ばす。
  assert.equal(findEmphasisErrors("---\nname: a\ndescription: **説明。**続き\n---\n\n本文\n", "a.md").length, 0);
});

test("閉じfenceの条件をCommonMarkより緩くしない", () => {
  // 緩いと、code blockの中のfence行で閉じてしまい、`--fix`が中身を書き換える。
  // しかも行単位の指摘が消えるので、書き換えた位置が報告から落ちる。
  const insideCodeBlock = [
    "```text\n> ```\n**壊れ。**続き\n```\n", // 引用の内外が食い違う行
    "```\ncode\n```js\n**壊れ。**続き\n```\n", // 閉じにinfo stringは付けられない
    "~~~\n~~~yaml\n**壊れ。**続き\n~~~\n",
  ];
  for (const source of insideCodeBlock) {
    assert.deepEqual(findEmphasisErrors(source, "a.md"), [], source);
    assert.equal(applySwaps(source, analyzeEmphasis(source, "a.md").swaps).applied, 0, source);
  }
  // 閉じ行にfence以降の文字があると閉じないので、未閉として報告する。
  const trailing = "```\ncode\n``` ここで閉じたつもり\n**壊れ。**続き\n";
  assert.equal(findEmphasisErrors(trailing, "a.md").length, 1);
  assert.match(findEmphasisErrors(trailing, "a.md")[0], /閉じていません/);
  assert.equal(applySwaps(trailing, analyzeEmphasis(trailing, "a.md").swaps).applied, 0);
  // 閉じの後ろが空白だけなら閉じる。
  assert.equal(findEmphasisErrors("```sh\ncmd\n```   \n\n**崩れ。**続き\n", "a.md").length, 1);
});

test("blockquoteの中で開いたfenceは引用が終わったら閉じる", () => {
  // 引きずらせると引用の外の本文が飛ばされ、あとで出てくる本物のfenceで閉じてしまう。
  const source = "> ```text\n> code\n\n本文**崩れ。**続き\nもう1行**崩れ。**続き\n\n```sh\ncmd\n```\n";
  const errors = findEmphasisErrors(source, "a.md");
  assert.equal(errors.length, 2);
  for (const error of errors) assert.match(error, /^a\.md:[45]:/, "引用の外の本文を指す");
  // 引用の中で閉じている場合は従来どおり飛ばす。
  assert.deepEqual(findEmphasisErrors("> ```text\n> **a。**b\n> ```\n", "a.md"), []);
});

test("YAML frontmatterはインデントされた`---`では閉じない", () => {
  // block scalarの中の`---`で閉じると、`--fix`がYAMLへ届く。
  const source = "---\na: |\n  ---\nb: c\n---\n\n**崩れている。**続き\n";
  const { errors, swaps } = analyzeEmphasis(source, "a.md");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^a\.md:7:/, "YAMLの行ではなく本文の行を指す");
  assert.deepEqual(swaps, [{ line: 7, column: 8, direction: "left" }]);
});

test("maskHtmlCommentsは長さとマーカーを保つ", () => {
  const line = "前 <!-- **メモ。**続き --> 後";
  const masked = maskHtmlComments(line);
  assert.equal(masked.line.length, line.length);
  assert.equal(masked.line, "前 <!--xxxxxxxxxxx--> 後");
  assert.equal(masked.inComment, false);
  // 閉じていないコメントは次の行へ続く。
  assert.equal(maskHtmlComments("<!-- 続く").inComment, true);
  assert.equal(maskHtmlComments("まだ中 -->", true).inComment, false);
});

test("水平線の`***`は強調として扱わない", () => {
  assert.deepEqual(findEmphasisErrors("文\n\n***\n\n次の段落\n", "a.md"), []);
  assert.deepEqual(findEmphasisErrors("文\n\n * * *\n\n次の段落\n", "a.md"), []);
  // 本文中の`***`は従来どおり指摘する。
  assert.ok(findEmphasisErrors("これは***だめ***です\n", "a.md").length >= 1);
});

test("表のescapeした縦棒はcellの区切りにしない", () => {
  // GitHubは`<strong>あ|い</strong>`を返す。分割で落とすと強調が割れて誤検知になる。
  assert.deepEqual(findEmphasisErrors("| a | **あ\\|い** |\n", "a.md"), []);
});

test("同じ行の複数箇所を1回のpassで直せる（入れ替えが長さを変えないため）", () => {
  assert.equal(fix("- **あ。**い**う。**え\n"), "- **あ**。い**う**。え\n");
});

test("`***`以上のrunを作る入れ替えは当てずに人へ返す", () => {
  // `A**、**C`は、どちらを入れ替えても動かした`**`がもう一方と隣接して`****`になる。
  const source = "A**、**C\n";
  const { swaps } = analyzeEmphasis(source, "a.md");
  assert.equal(swaps.length, 2);
  const result = applySwaps(source, swaps);
  assert.equal(result.applied, 0, "どちらも当ててはいけない");
  assert.equal(result.text, source, "当てられないのに書き換えている");
  assert.doesNotMatch(result.text, /\*{3,}/);
});

test("keepsProseは`*`の並びの崩れを見逃さない", () => {
  assert.ok(keepsProse("A**、**C", "A、****C") === false);
  assert.ok(keepsProse("**あ。**い", "**あ**。い"));
  // 長さが変われば本文を触っている。
  assert.ok(keepsProse("**あ。**い", "**あ**。いう") === false);
});

test("--fixはファイルを書き換え、直し終えたら違反を残さない", async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, "a.md");
    await writeFile(filePath, "- **強調である。**続きの文\n");

    const { errors, fixedFiles } = await checkMarkdown(directory, { fix: true });
    assert.deepEqual(errors, []);
    assert.equal(fixedFiles, 1);
    assert.equal(await readFile(filePath, "utf8"), "- **強調である**。続きの文\n");
  });
});

test("--fixで直せない崩れはファイルを書き換えず指摘を残す", async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, "a.md");
    const source = "ではなく**「0であること」**とする。\n";
    await writeFile(filePath, source);

    const { errors, fixedFiles } = await checkMarkdown(directory, { fix: true });
    assert.equal(fixedFiles, 0);
    assert.ok(errors.length >= 1);
    assert.match(errors[0], /開き側に使えません/);
    // 行番号つきの指摘が出ること（手で直す人が場所を得られる）。
    assert.ok(
      errors.every((error) => /^a\.md:\d+:/.test(error)),
      `行番号の無い指摘がある: ${JSON.stringify(errors)}`,
    );
    assert.equal(await readFile(filePath, "utf8"), source, "直せないのに書き換えている");
  });
});

test("生成物・依存のディレクトリは見ない", async () => {
  await withTempDir(async (directory) => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(directory, "node_modules"), { recursive: true });
    await writeFile(path.join(directory, "node_modules", "a.md"), "- **崩れている。**続き\n");

    const { errors, fixedFiles } = await checkMarkdown(directory, { fix: true });
    assert.deepEqual(errors, []);
    assert.equal(fixedFiles, 0);
  });
});
