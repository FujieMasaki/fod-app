import assert from "node:assert/strict";
import test from "node:test";

import { analyzeEmphasis, applySwaps, findEmphasisErrors, flanking, stripInlineCode } from "./check-docs-markdown.mjs";

// `--fix`相当。本文（`*`を除いた文字列）が変わらないことも併せて確認する。
function fix(source) {
  let fixed = source;
  for (let pass = 0; pass < 5; pass += 1) {
    const { swaps } = analyzeEmphasis(fixed, "a.md");
    if (swaps.length === 0) break;
    fixed = applySwaps(fixed, swaps);
  }
  assert.equal(fixed.replaceAll("*", ""), source.replaceAll("*", ""), "入れ替え以外で本文が変わっている");
  assert.deepEqual(findEmphasisErrors(fixed, "a.md"), [], "直したのに違反が残っている");
  return fixed;
}

test("flankingはCommonMarkの規則どおりに判定する", () => {
  // `。**続` は直前が句読点で直後が非空白なので閉じ側に使えない。
  assert.deepEqual(flanking("。", "続"), { canOpen: true, canClose: false });
  // `は**「` は直後が句読点で直前が非空白・非句読点なので開き側に使えない。
  assert.deepEqual(flanking("は", "「"), { canOpen: false, canClose: true });
  // 空白に挟まれていればどちら側にも使えない。
  assert.deepEqual(flanking(" ", " "), { canOpen: false, canClose: false });
  // blockの端はundefinedで渡す（空白扱い）。
  assert.deepEqual(flanking(undefined, "強"), { canOpen: true, canClose: false });
  assert.deepEqual(flanking("調", undefined), { canOpen: false, canClose: true });
});

test("句点の直後の閉じ`**`を検出して直す（`**`の数が偶数でも壊れる）", () => {
  const source = "- **強調である。**続きの文\n";
  const errors = findEmphasisErrors(source, "a.md");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\.md:1: 句読点の直後の `\*\*` は閉じ側に使えません/);
  assert.equal(fix(source), "- **強調である**。続きの文\n");
});

test("句読点の直前の開き`**`を検出して直す", () => {
  const source = "ではなく**「0であること」**とする。\n";
  const errors = findEmphasisErrors(source, "a.md");
  assert.match(errors[0], /a\.md:1: 句読点の直前の `\*\*` は開き側に使えません/);
  // 開き側は右へ、閉じ側は左へ動かし、鉤括弧を強調の外へ出す。
  assert.equal(fix(source), "ではなく「**0であること**」とする。\n");
});

test("リンクやコードスパンの境界は自動修正の対象にしない", () => {
  const source = "正本は**[architecture.md](a.md)の要求に従う**。\n";
  const { errors, swaps } = analyzeEmphasis(source, "a.md");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /開き側に使えません/);
  assert.doesNotMatch(errors[0], /--fix/);
  assert.deepEqual(swaps, []);
});

test("正しく書けている強調は検出しない", () => {
  assert.deepEqual(findEmphasisErrors("- **強調である**。続きの文\n", "a.md"), []);
  // 閉じの直後が空白なら句点を含んだままでも閉じられる。
  assert.deepEqual(findEmphasisErrors("- **強調である。** 続きの文\n", "a.md"), []);
  // 行末（softbreak）も空白として扱う。
  assert.deepEqual(findEmphasisErrors("**強調である。**\n", "a.md"), []);
  assert.deepEqual(findEmphasisErrors("決まり、**保証できない。**\n次の行\n", "a.md"), []);
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

test("見出しと表は1行で閉じる必要がある", () => {
  assert.deepEqual(findEmphasisErrors("| a | **b** |\n| c | **d** |\n", "a.md"), []);
  assert.deepEqual(findEmphasisErrors("| a | **閉じ忘れ |\n", "a.md"), ["a.md:1: `**` が閉じていません。"]);
  assert.deepEqual(findEmphasisErrors("## **閉じ忘れ\n", "a.md"), ["a.md:1: `**` が閉じていません。"]);
});

test("コードブロックの中は見ない", () => {
  assert.deepEqual(findEmphasisErrors("```text\n**数えない\nsrc/**\n```\n", "a.md"), []);
});

test("コードスパンの中は見ず、前後の強調を隣接させない", () => {
  // `**` を含むglobが本文に出ても検出しない
  assert.deepEqual(findEmphasisErrors("パターンは `apps/web/src/**` を使う\n", "a.md"), []);
  // コードスパンを挟んだ強調を4連アスタリスクとして誤検出しない
  assert.deepEqual(findEmphasisErrors("| **`started_at`** | **定義** |\n", "a.md"), []);
});

test("stripInlineCodeは長さを保ったまま置き換える", () => {
  assert.equal(stripInlineCode("a `code` b"), "a xxxxxx b");
  assert.equal(stripInlineCode("**`x`**").length, "**`x`**".length);
});

test("applySwapsは同じ行の複数箇所を同時に直せる（長さが変わらないため）", () => {
  assert.equal(fix("- **あ。**い**う。**え\n"), "- **あ**。い**う**。え\n");
});
