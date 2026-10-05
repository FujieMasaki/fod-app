import assert from "node:assert/strict";
import test from "node:test";

import { findEmphasisErrors, stripInlineCode } from "./check-docs-markdown.mjs";

test("CJKの句点の直後の4連アスタリスクを検出する", () => {
  const errors = findEmphasisErrors("**ここまでが前半である。****ここから後半**\n", "a.md");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\.md:1: アスタリスクが4個連続/);
});

test("閉じていない強調を検出する（blockは空行で区切る）", () => {
  assert.deepEqual(findEmphasisErrors("**閉じていない\n続きの行\n", "a.md"), [
    "a.md:1: `**` の数が奇数です（1個）。強調が閉じていないか、閉じられない位置にあります。",
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
    "a.md:1: `**` の数が奇数です（1個）。強調が閉じていないか、閉じられない位置にあります。",
  ]);
});

test("表は行ごとに閉じる必要がある", () => {
  assert.deepEqual(findEmphasisErrors("| a | **b** |\n| c | **d** |\n", "a.md"), []);
  assert.deepEqual(findEmphasisErrors("| a | **閉じ忘れ |\n", "a.md"), [
    "a.md:1: `**` の数が奇数です（1個）。強調が閉じていないか、閉じられない位置にあります。",
  ]);
});

test("コードブロックの中は数えない", () => {
  assert.deepEqual(findEmphasisErrors("```text\n**数えない\nsrc/**\n```\n", "a.md"), []);
});

test("コードスパンの中は数えず、前後の強調を隣接させない", () => {
  // `**` を含むglobが本文に出ても検出しない
  assert.deepEqual(findEmphasisErrors("パターンは `apps/web/src/**` を使う\n", "a.md"), []);
  // コードスパンを挟んだ強調は4連アスタリスクとして誤検出しない
  assert.deepEqual(findEmphasisErrors("| **`started_at`** | **定義** |\n", "a.md"), []);
});

test("stripInlineCodeはコードスパンを1文字へ置き換える", () => {
  assert.equal(stripInlineCode("a `code` b"), "a \u0000 b");
  assert.equal(stripInlineCode("**`x`**"), "**\u0000**");
});
