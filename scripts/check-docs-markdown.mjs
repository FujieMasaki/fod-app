import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(rootDir, "docs");

// 日本語の本文で `**` の強調が壊れる形を機械的に止める。レビューでは見つけにくく、
// GitHub上の表示を見るまで気づかない（PRのmarkdown差分は既定でrawで表示される）。
//
// 一番多い崩れは、句読点の直後に閉じの`**`を置くことである。
//
//     **強調。**続き   → `**`がそのまま本文に出る
//     **強調**。続き   → 正しく<strong>になる
//     **強調。** 続き  → 正しく<strong>になる（閉じの直後が空白）
//
// CommonMarkのright-flankingは「直前が空白でない、かつ（直前が句読点でない、または
// 直前が句読点で直後が空白か句読点）」なので、`。**続` は閉じ側として使えない。
// `**`の数が偶数でも壊れるため、数を数えるだけでは検出できない。
// そこでblockごとにdelimiterの対応を取り、open/closeに使えるかをflanking規則で判定する
// （GitHubの`/markdown` APIで実際の描画を確認した上での実装）。
//
// `--fix`を渡すと、閉じ側に使えない`**`とその直前の句読点を入れ替えて直す。
// 入れ替えは長さを変えないので位置がずれず、`*`を除いた本文も変わらない。

// CommonMarkの「Unicode punctuation character」に相当。
const punctuation = /\p{P}/u;

// `**`と入れ替えても他の記法を壊さない文字だけを`--fix`の対象にする。
// `[`・`` ` ``・`*`はリンク・コードスパン・強調の境界なので、入れ替えると構文が変わる。
// 半角の括弧も除く（`](url)`の一部になり得る）。
const swappable = /^[、。，．・：；？！（）「」『』〔〕【】〈〉《》〜…―§]$/u;

function isWhitespace(character) {
  return character === undefined || /\s/u.test(character);
}

function isPunctuation(character) {
  return character !== undefined && punctuation.test(character);
}

// blockの端はwhitespace扱い（undefinedを渡す）。
export function flanking(previousCharacter, nextCharacter) {
  const left =
    !isWhitespace(nextCharacter) &&
    (!isPunctuation(nextCharacter) || isWhitespace(previousCharacter) || isPunctuation(previousCharacter));
  const right =
    !isWhitespace(previousCharacter) &&
    (!isPunctuation(previousCharacter) || isWhitespace(nextCharacter) || isPunctuation(nextCharacter));
  return { canOpen: left, canClose: right };
}

// コードスパンの中身は数えたくないが、消すと位置がずれて元の行の列が引けなくなる。
// 同じ長さのplaceholderへ置き換える（前後の`**`も隣接しない）。
export function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, (match) => "x".repeat(match.length));
}

function isListItemStart(line) {
  return /^\s*(?:[-*+]\s|\d+[.)]\s)/.test(line);
}

function isTableRow(line) {
  return /^\s*\|/.test(line);
}

function isHeading(line) {
  return /^\s*#{1,6}\s/.test(line);
}

// blockは複数行を1つのテキストとして持ち、文字位置から元の行と列を引けるようにする。
// 行の継ぎ目はsoftbreak（空白扱い）なので改行を入れる。入れないと行末の`**`を
// 次の行の先頭文字と隣り合わせに判定してしまう。
function makeBlock() {
  const spans = [];
  return {
    text: "",
    push(content, lineNumber) {
      spans.push({ start: this.text.length, lineNumber });
      this.text += content + "\n";
    },
    locate(index) {
      let found = spans[0];
      for (const span of spans) if (span.start <= index) found = span;
      return { line: found.lineNumber, column: index - found.start };
    },
  };
}

// errors（人が読む指摘）と swaps（--fixで入れ替える位置）を返す。
export function analyzeEmphasis(source, relativePath) {
  const errors = [];
  const swaps = [];
  const lines = source.split("\n");

  let inFence = false;
  let block = null;

  const flush = () => {
    if (!block) return;
    const text = block.text;
    const open = [];
    for (let index = 0; index < text.length - 1; index += 1) {
      if (text[index] !== "*" || text[index + 1] !== "*") continue;
      const previous = text[index - 1];
      const next = text[index + 2];
      const { canOpen, canClose } = flanking(previous, next);
      if (canClose && open.length > 0) {
        open.pop();
      } else if (open.length > 0 && isPunctuation(previous) && !isWhitespace(next)) {
        // 直前の句読点を`**`の後ろへ動かせば閉じられる。
        const at = block.locate(index);
        const fixable = swappable.test(previous);
        errors.push(
          `${relativePath}:${at.line}: 句読点の直後の \`**\` は閉じ側に使えません。` +
            "`**強調**。` の形にするか、閉じの後に空白を置いてください" +
            (fixable ? "（`--fix` で直せます）。" : "。"),
        );
        if (fixable) swaps.push({ line: at.line, column: at.column, direction: "left" });
        open.pop();
      } else if (canOpen) {
        open.push({ index });
      } else if (isPunctuation(next) && !isWhitespace(next)) {
        // 直後の句読点を`**`の前へ動かせば開ける。閉じ側と鏡の関係にある崩れ。
        const at = block.locate(index);
        const fixable = swappable.test(next);
        errors.push(
          `${relativePath}:${at.line}: 句読点の直前の \`**\` は開き側に使えません。` +
            "`「**強調**」` の形にするか、開きの前に空白を置いてください" +
            (fixable ? "（`--fix` で直せます）。" : "。"),
        );
        if (fixable) swaps.push({ line: at.line, column: at.column, direction: "right" });
        open.push({ index });
      } else {
        const at = block.locate(index);
        errors.push(
          `${relativePath}:${at.line}: \`**\` が開き側にも閉じ側にも使えない位置にあります。` +
            "前後の空白か句読点の位置を見直してください。",
        );
      }
      index += 1;
    }
    for (const unmatched of open) {
      const at = block.locate(unmatched.index);
      errors.push(`${relativePath}:${at.line}: \`**\` が閉じていません。`);
    }
    block = null;
  };

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;

    if (/^\s*(?:```|~~~)/.test(rawLine)) {
      flush();
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const line = stripInlineCode(rawLine);

    for (const match of line.matchAll(/\*{3,}/g)) {
      errors.push(
        `${relativePath}:${lineNumber}: アスタリスクが${match[0].length}個連続しています。` +
          "長さ3以上のrunは対応規則が複雑なので、この文書群では使いません。",
      );
    }

    if (line.trim() === "") {
      flush();
      return;
    }
    // 表の行と見出しは1行で閉じる必要がある。
    if (isTableRow(line) || isHeading(line)) {
      flush();
      block = makeBlock();
      block.push(line, lineNumber);
      flush();
      return;
    }
    if (isListItemStart(line)) flush();
    if (!block) block = makeBlock();
    block.push(line, lineNumber);
  });

  flush();
  return { errors, swaps };
}

export function findEmphasisErrors(source, relativePath) {
  return analyzeEmphasis(source, relativePath).errors;
}

// 句読点と`**`を入れ替える。長さが変わらないので、同じ行の複数箇所でも位置がずれない。
// `left`は`**`を直前の句読点の前へ、`right`は直後の句読点の後ろへ動かす。
export function applySwaps(source, swaps) {
  if (swaps.length === 0) return source;
  const lines = source.split("\n");
  for (const swap of swaps) {
    const line = lines[swap.line - 1];
    const mark = swap.column;
    lines[swap.line - 1] =
      swap.direction === "right"
        ? line.slice(0, mark) + line[mark + 2] + "**" + line.slice(mark + 3)
        : line.slice(0, mark - 1) + "**" + line[mark - 1] + line.slice(mark + 2);
  }
  return lines.join("\n");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(entryPath)));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files;
}

export async function checkDocsMarkdown(directory = docsDir, { fix = false } = {}) {
  const errors = [];
  let fixedFiles = 0;
  for (const filePath of (await walk(directory)).sort()) {
    const relativePath = path.relative(rootDir, filePath);
    const source = await readFile(filePath, "utf8");
    const analysis = analyzeEmphasis(source, relativePath);

    if (fix && analysis.swaps.length > 0) {
      // 1回の入れ替えで別の崩れが見えることがあるので、swapsが出なくなるまで繰り返す。
      let fixed = source;
      let swaps = analysis.swaps;
      let broken = false;
      for (let pass = 0; pass < 5 && swaps.length > 0; pass += 1) {
        fixed = applySwaps(fixed, swaps);
        // `*`を除いた本文が変わっていないことを確認する。入れ替え以外を変えていない保証。
        if (fixed.replaceAll("*", "") !== source.replaceAll("*", "")) {
          errors.push(`${relativePath}: --fix が本文を変えてしまうため中止しました。手で直してください。`);
          broken = true;
          break;
        }
        swaps = analyzeEmphasis(fixed, relativePath).swaps;
      }
      if (broken) continue;
      await writeFile(filePath, fixed);
      fixedFiles += 1;
      errors.push(...analyzeEmphasis(fixed, relativePath).errors);
      continue;
    }
    errors.push(...analysis.errors);
  }
  return { errors, fixedFiles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fix = process.argv.includes("--fix");
  const { errors, fixedFiles } = await checkDocsMarkdown(docsDir, { fix });
  if (fix) console.log(`${fixedFiles}ファイルを直しました。`);
  if (errors.length > 0) {
    console.error("Markdown emphasis violations:\n" + errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  }
}
