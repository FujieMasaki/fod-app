import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 手で書いたmarkdownだけを見る。生成物・依存・作業用のディレクトリは入らない。
const skipDirectories = new Set([
  ".git",
  "node_modules",
  "worktrees",
  "vendor",
  "tmp",
  "log",
  "dist",
  "build",
  "coverage",
]);

// 日本語の本文で `**` の強調が壊れる形を機械的に止める。レビューでは見つけにくく、
// GitHub上の表示を見るまで気づかない（PRのmarkdown差分は既定でrawで表示される）。
//
//     **強調。**続き   → `**`がそのまま本文に出る
//     **強調**。続き   → 正しく<strong>になる
//     **強調。** 続き  → 正しく<strong>になる（閉じの直後が空白）
//     は**「強調」**だ → `**`がそのまま本文に出る（開き側も同じ規則で壊れる）
//
// CommonMarkのflankingは「閉じ側は直前が空白でない、かつ（直前が句読点でない、または直後が
// 空白か句読点）」で、開き側はその鏡である。したがって`。**続`は閉じ側に、`は**「`は開き側に
// 使えない。`**`の数が偶数でも壊れるため、数を数えるだけでは検出できない。
// blockごとにdelimiterの対応を取り、open/closeに使えるかをflanking規則で判定する
// （GitHubの`/markdown` APIで実際の描画を確認した上での実装）。
//
// `--fix`を渡すと、崩れている`**`と隣の句読点を入れ替えて直す。入れ替えは長さを変えないので
// 位置がずれず、`*`を除いた本文も変わらない。
//
// 既知の制限（検出漏れ）:
//   - setext見出し（`===`・`---`の下線）を見出しとして扱わない。段落として解析する
//   - code blockの判定はfenceと4空白インデントだけで、list項目の中の深いインデントは
//     段落の続きとして扱う（CommonMarkより緩い）
//
// 既知の制限（誤検知）:
//   - HTMLブロック（`<div>`・`<details>`から空行まで）の中を本文として解析する。
//     GitHubはrawで通すので、`**`を含むHTMLブロックを書くと指摘が出る
//   - コードスパンに入れていない裸の`**`（globやURL）は「閉じていません」になる。
//     `` `apps/web/src/**` ``のようにコードスパンへ入れる運用で避ける

// CommonMarkの「punctuation character」はASCII punctuationとUnicodeのP*である。
// `\p{P}`に入らないASCII punctuation（`$ + < = > ^ ` | ~`）を足す。
const punctuation = /[\p{P}$+<=>^`|~]/u;

// `**`と入れ替えても読み方が変わらない文字だけを`--fix`の対象にする。
// 対になる括弧・鉤括弧は入れない。片方だけを強調の外へ出すと範囲が割れて読みにくくなるため、
// 人に返す。リンクとコードスパンの境界（`[` `` ` ``）も、入れ替えると構文が変わるので入れない。
const swappable = /^[、。，．・：；？！…―〜§]$/u;

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

// コードスパンの中身は見たくないが、消すと位置がずれて元の行の列が引けなくなる。
// 同じ長さのplaceholderへ置き換える。
// **backtickは残す。** CommonMarkはコードスパンを強調より先に解析するので、隣接する`**`から見た
// 実際の隣の文字はbacktick（punctuation）である。`x`に化かすと flanking の判定が変わり、
// `値は**`code`**である。`（`**`が本文に出る）を見逃す。
export function stripInlineCode(line) {
  return line.replace(/(`+)[^`]*\1/g, (match, fence) => fence + "x".repeat(match.length - fence.length * 2) + fence);
}

function isListItemStart(line) {
  return /^\s*(?:[-*+]\s|\d+[.)]\s)/.test(line);
}

function isTableRow(line) {
  return /^\s*\|/.test(line);
}

// escapeした縦棒（`\|`）はcellの区切りではない。分割で落とすと強調が割れて誤検知になる。
function splitTableCells(line) {
  const cells = [];
  let current = "";
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "\\" && line[index + 1] === "|") {
      current += "\\|";
      index += 1;
    } else if (line[index] === "|") {
      cells.push(current);
      current = "";
    } else {
      current += line[index];
    }
  }
  cells.push(current);
  return cells;
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
    push(content, lineNumber, columnOffset = 0) {
      spans.push({ start: this.text.length, lineNumber, columnOffset });
      this.text += content + "\n";
    },
    locate(index) {
      let found = spans[0];
      for (const span of spans) if (span.start <= index) found = span;
      return { line: found.lineNumber, column: index - found.start + found.columnOffset };
    },
  };
}

// errors（人が読む指摘）と swaps（--fixで入れ替える位置）を返す。
export function analyzeEmphasis(source, relativePath) {
  const errors = [];
  const swaps = [];
  const lines = source.split("\n");

  // 開いたfenceの記号を覚える。``` と ~~~ を区別しないと、片方の中にもう片方が出た時点で
  // 状態が反転し、code blockの中を本文として解析してしまう。
  let fence = null;
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

    // 水平線（`***`だけの行）は強調ではないので先に外す。
    if (fence === null && /^ {0,3}\*[\s*]*$/.test(rawLine) && (rawLine.match(/\*/g) ?? []).length >= 3) {
      flush();
      return;
    }

    // 閉じfenceは開きと同じ記号で、同じ長さ以上である必要がある。長さを捨てると
    // ````で開いたblockの中の```で閉じてしまい、code blockの中を本文として解析する。
    // インデントは3空白まで（CommonMark）。`^\s*`にすると、4空白のcode blockの中に書いた
    // fence行で状態が反転し、閉じないままEOFへ達して以降の全行が無検査になる。
    const fenceStart = /^ {0,3}(```+|~~~+)/.exec(rawLine);
    if (fenceStart && (fence === null || fenceStart[1].startsWith(fence))) {
      flush();
      fence = fence === null ? fenceStart[1] : null;
      return;
    }
    if (fence !== null) return;

    // 4空白インデントのcode block。空行のあとに始まるものだけが該当する
    // （段落の続きの行は中断できない）。中身を本文として扱うと`--fix`がコマンド例を書き換える。
    if (block === null && /^ {4,}\S/.test(rawLine)) return;

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
    // 表はcellごとに閉じる必要がある（cellをまたぐ強調は成立しない）。見出しは1行で閉じる。
    if (isTableRow(line)) {
      flush();
      let offset = 0;
      for (const cell of splitTableCells(line)) {
        if (cell.trim() !== "") {
          block = makeBlock();
          block.push(cell, lineNumber, offset);
          flush();
        }
        offset += cell.length + 1;
      }
      return;
    }
    if (isHeading(line)) {
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
  // 閉じていないfenceは、その後の行がすべて無検査になる。黙って通さずに報告する。
  if (fence !== null) {
    errors.push(
      `${relativePath}: ${fence} で開いたcode blockが閉じていません。そこから後の行を検査していません。`,
    );
  }
  return { errors, swaps };
}

export function findEmphasisErrors(source, relativePath) {
  return analyzeEmphasis(source, relativePath).errors;
}

// 1つのswapが書き換える範囲。`right`は`**`と直後の1文字、`left`は`**`と直前の1文字。
function swapRange(swap) {
  return swap.direction === "right" ? [swap.column, swap.column + 2] : [swap.column - 1, swap.column + 1];
}

// 句読点と`**`を入れ替える。長さが変わらないので、重ならない限り同じ行へ同時に適用できる。
// 重なるswap（`A**、**C`のように`**`が1文字しか離れていない場合）は適用せず、次のpassへ回す。
export function applySwaps(source, swaps) {
  if (swaps.length === 0) return { text: source, applied: 0 };
  const lines = source.split("\n");
  const byLine = new Map();
  for (const swap of swaps) {
    if (!byLine.has(swap.line)) byLine.set(swap.line, []);
    byLine.get(swap.line).push(swap);
  }

  let applied = 0;
  for (const [lineNumber, lineSwaps] of byLine) {
    let line = lines[lineNumber - 1];
    let previousEnd = -1;
    for (const swap of [...lineSwaps].sort((a, b) => a.column - b.column)) {
      const [start, end] = swapRange(swap);
      if (start <= previousEnd) continue; // 直前のswapと重なるので次のpassで扱う
      const mark = swap.column;
      const candidate =
        swap.direction === "right"
          ? line.slice(0, mark) + line[mark + 2] + "**" + line.slice(mark + 3)
          : line.slice(0, mark - 1) + "**" + line[mark - 1] + line.slice(mark + 2);
      // 動かした`**`が別の`**`と隣接すると`***`以上のrunになる（`A**、**C`）。
      // その場合は当てずに人へ返す。長さが変わらないので、飛ばしても後続の位置はずれない。
      if (longAsteriskRuns(candidate) > longAsteriskRuns(line)) continue;
      line = candidate;
      previousEnd = end;
      applied += 1;
    }
    lines[lineNumber - 1] = line;
  }
  return { text: lines.join("\n"), applied };
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skipDirectories.has(entry.name)) continue;
      files.push(...(await walk(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }
  return files;
}

function longAsteriskRuns(text) {
  return (text.match(/\*{3,}/g) ?? []).length;
}

// 入れ替え以外を変えていないことの検査。長さと`*`を除いた本文が一致し、
// `*`を3つ以上並べてしまっていない（新しい崩れを作っていない）ことを求める。
// `*`を除いた本文の一致だけでは、`*`の並びが崩れても気づけない。
export function keepsProse(source, fixed) {
  return (
    fixed.length === source.length &&
    fixed.replaceAll("*", "") === source.replaceAll("*", "") &&
    longAsteriskRuns(fixed) <= longAsteriskRuns(source)
  );
}

export async function checkMarkdown(directory = rootDir, { fix = false } = {}) {
  const errors = [];
  let fixedFiles = 0;
  for (const filePath of (await walk(directory)).sort()) {
    // 走査対象からの相対パスにする（rootDir固定にすると、別のディレクトリを渡したときに
    // `../../..`が並んで読めなくなる）。
    const relativePath = path.relative(directory, filePath);
    const source = await readFile(filePath, "utf8");
    const analysis = analyzeEmphasis(source, relativePath);

    if (fix && analysis.swaps.length > 0) {
      // 1回の入れ替えで別の崩れが見えること、重なりを次のpassへ回すことがあるため繰り返す。
      let fixed = source;
      let swaps = analysis.swaps;
      let aborted = false;
      for (let pass = 0; pass < 10 && swaps.length > 0; pass += 1) {
        const result = applySwaps(fixed, swaps);
        if (result.applied === 0) break; // これ以上は進まない
        if (!keepsProse(source, result.text)) {
          errors.push(`${relativePath}: --fix が本文を変えてしまうため中止しました。手で直してください。`);
          // 手で直す人が行番号を得られるよう、元の違反も併せて出す。
          errors.push(...analysis.errors);
          aborted = true;
          break;
        }
        fixed = result.text;
        swaps = analyzeEmphasis(fixed, relativePath).swaps;
      }
      if (aborted) continue;
      if (fixed !== source) {
        await writeFile(filePath, fixed);
        fixedFiles += 1;
      }
      errors.push(...analyzeEmphasis(fixed, relativePath).errors);
      continue;
    }
    errors.push(...analysis.errors);
  }
  return { errors, fixedFiles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fix = process.argv.includes("--fix");
  const { errors, fixedFiles } = await checkMarkdown(rootDir, { fix });
  if (fix) console.log(`${fixedFiles}ファイルを直しました。`);
  if (errors.length > 0) {
    console.error("Markdown emphasis violations:\n" + errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  }
}
