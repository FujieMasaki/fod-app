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
//   - `__太字__`・`*斜体*`は同じ形で壊れるが見ない（この文書群では使っていない）
//   - **空行の後の4空白インデント行はcode blockとして飛ばす。** list項目の継続段落でも飛ばすので、
//     その中の崩れは検出しない（listの文脈を見ないとCommonMarkどおりには判定できない）
//   - code blockの判定はfenceと4空白インデントだけで、list項目の中の深いインデントが
//     段落の続きのときは本文として解析する（CommonMarkより緩い）
//
// 既知の制限（誤検知）:
//   - HTMLブロック（`<div>`・`<details>`から空行まで）の中を本文として解析する。
//     GitHubはrawで通すので、`**`を含むHTMLブロックを書くと指摘が出る
//   - コードスパンに入れていない裸の`**`（globやURL）は「閉じていません」になる。
//     `` `apps/web/src/**` ``のようにコードスパンへ入れる運用で避ける
//   - 先頭の`|`が無いGFMの表（`a | b`）は段落として扱い、cellごとに区切らない

// CommonMarkの「punctuation character」はASCII punctuationとUnicodeのP*である。
// `\p{P}`に入らないASCII punctuation（`$ + < = > ^ ` | ~`）を足す。
const punctuation = /[\p{P}$+<=>^`|~]/u;

// `**`と入れ替えても読み方が変わらない文字だけを`--fix`の対象にする。
// 対になる括弧・鉤括弧は入れない。片方だけを強調の外へ出すと範囲が割れて読みにくくなるため、
// 人に返す。リンクとコードスパンの境界（`[` `` ` ``）も、入れ替えると構文が変わるので入れない。
// `§`も外す。入れ替えると`§**45**`のように記号だけが強調の外へ出て、同じ行の他の`§`が中に
// 入っている形と混ざる。開きの前に空白を置けば記号ごと強調に入るので、人に返す。
const swappable = /^[、。，．・：；？！…―〜]$/u;

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

// HTMLコメントの中身を同じ長さのplaceholderへ置き換える。`<!--`・`-->`は残す。
// 行をまたぐので、直前の行から続いているかを受け取って返す。
export function maskHtmlComments(line, inComment = false) {
  let result = "";
  let index = 0;
  while (index < line.length) {
    if (inComment) {
      const end = line.indexOf("-->", index);
      if (end === -1) {
        result += "x".repeat(line.length - index);
        break;
      }
      result += "x".repeat(end - index) + "-->";
      index = end + 3;
      inComment = false;
    } else {
      const start = line.indexOf("<!--", index);
      if (start === -1) {
        result += line.slice(index);
        break;
      }
      result += line.slice(index, start) + "<!--";
      index = start + 4;
      inComment = true;
    }
  }
  return { line: result, inComment };
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

// **行を飛ばす状態の定義。** 開いたまま終わると、そこから後の行がすべて無検査になるので、
// `analyzeEmphasis`はこの表を回してEOFで開いているものを報告する。
//
// **新しい除外を足すときは必ずここへ足す。** fence・HTMLコメント・frontmatterの3つで順番に
// 「報告を書き忘れてファイルが丸ごと素通りする」穴を作ったため、個別のifをやめて表にした。
// `check-markdown.test.mjs`が、この表のすべての状態について閉じ忘れが報告されることを検査する
// （fixtureを足さずに状態を足すとtestが落ちる）。
export const skippingStates = {
  // ``` と ~~~ を区別しないと、片方の中にもう片方が出た時点で状態が反転する。
  fence: {
    initial: null,
    message: (value) => `${value} で開いたcode blockが閉じていません。そこから後の行を検査していません。`,
  },
  comment: {
    initial: false,
    message: () => "HTMLコメント（<!--）が閉じていません。そこから後の行を検査していません。",
  },
  frontmatter: {
    initial: false,
    message: () =>
      "YAML frontmatter（1行目の---）が閉じていません。" +
      "ファイル全体を検査していません。前付けでなければ1行目に`---`を置かないでください。",
  },
};

// errors（人が読む指摘）と swaps（--fixで入れ替える位置）を返す。
export function analyzeEmphasis(source, relativePath) {
  const errors = [];
  const swaps = [];
  const lines = source.split("\n");

  const skipping = Object.fromEntries(
    Object.entries(skippingStates).map(([name, state]) => [name, { open: state.initial, message: state.message }]),
  );
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

  // **行ごとの処理は必ず「どう扱ったか」を返す。** 返し忘れ（bare return）はundefinedになり、
  // 下の検査が内部エラーとして落とす。**行を飛ばす経路を足して記録を忘れる失敗**を、
  // `skippingStates`への登録だけでなく、この型でも止める。
  const handleLine = (originalLine, index) => {
    const lineNumber = index + 1;

    // YAML frontmatterは本文ではない。1行目の`---`だけを前付けの開始として扱う
    // （2行目以降の`---`は水平線かsetextの下線）。`--fix`がYAMLのスカラを書き換えないため。
    if (index === 0 && originalLine.trim() === "---") {
      skipping.frontmatter.open = true;
      return "frontmatter";
    }
    if (skipping.frontmatter.open) {
      // 閉じは行頭の`---`だけ。`trim()`にすると、YAMLのblock scalarの中の
      // インデントされた`---`で前付けが閉じ、`--fix`がYAMLへ届く。
      if (/^---\s*$/.test(originalLine)) skipping.frontmatter.open = false;
      return "frontmatter";
    }

    const rawLine = originalLine;
    // block構造の判定にはblockquoteの`>`を外し、先頭のtabを空白へ開いた形を使う。
    // **tabは4空白相当なので、tabで始まる行はcode blockである**（`^ {4,}`だけを見ていると
    // 本文として解析し、`--fix`がコマンド例を書き換える）。位置は`rawLine`のままで数える。
    const structural = rawLine.replace(/^(?:\s*>)+ ?/, "").replace(/^\t+/, (tabs) => "    ".repeat(tabs.length));

    // 水平線（`*`だけの行）は強調ではないので先に外す。
    if (
      skipping.fence.open === null &&
      /^ {0,3}\*[\s*]*$/.test(structural) &&
      (structural.match(/\*/g) ?? []).length >= 3
    ) {
      flush();
      return "thematicBreak";
    }

    // 閉じfenceは開きと同じ記号で、同じ長さ以上である必要がある。長さを捨てると
    // ````で開いたblockの中の```で閉じてしまい、code blockの中を本文として解析する。
    // インデントは3空白まで（CommonMark）。`^\s*`にすると、4空白のcode blockの中に書いた
    // fence行で状態が反転し、閉じないままEOFへ達して以降の全行が無検査になる。
    const fenceStart = /^ {0,3}(```+|~~~+)/.exec(structural);
    if (fenceStart && (skipping.fence.open === null || fenceStart[1].startsWith(skipping.fence.open))) {
      flush();
      skipping.fence.open = skipping.fence.open === null ? fenceStart[1] : null;
      return "fence";
    }
    if (skipping.fence.open !== null) return "fence";

    // 4空白インデント（tab 1個も4空白相当）のcode block。空行のあとに始まるものだけが該当する
    // （段落の続きの行は中断できない）。中身を本文として扱うと`--fix`がコマンド例を書き換える。
    if (block === null && /^ {4,}\S/.test(structural)) return "indentedCode";

    // コードスパンを潰したあとでHTMLコメントを外す。この順にすると、CommonMarkと同じ優先順位
    // （block構造 → コードスパン → raw HTML）になり、コードスパンやcode blockの中の`<!--`で
    // コメントの状態が反転しない。反転すると、そこから後の行が黙って無検査になる。
    const masked = maskHtmlComments(stripInlineCode(rawLine), skipping.comment.open);
    skipping.comment.open = masked.inComment;
    const line = masked.line;

    for (const match of line.matchAll(/\*{3,}/g)) {
      errors.push(
        `${relativePath}:${lineNumber}: アスタリスクが${match[0].length}個連続しています。` +
          "長さ3以上のrunは対応規則が複雑なので、この文書群では使いません。",
      );
    }

    if (line.trim() === "") {
      flush();
      return "blankLine";
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
      return "tableRow";
    }
    if (isHeading(line)) {
      flush();
      block = makeBlock();
      block.push(line, lineNumber);
      flush();
      return "heading";
    }
    if (isListItemStart(line)) flush();
    if (!block) block = makeBlock();
    block.push(line, lineNumber);
    return "analyzed";
  };

  // 行の扱い方の一覧。**ここに無い値（returnの書き忘れによるundefinedを含む）はエラーにする。**
  const lineOutcomes = new Set([
    "analyzed",
    "blankLine",
    "heading",
    "tableRow",
    "thematicBreak",
    "fence",
    "indentedCode",
    "frontmatter",
    "comment",
  ]);

  lines.forEach((originalLine, index) => {
    const outcome = handleLine(originalLine, index);
    if (!lineOutcomes.has(outcome)) {
      errors.push(
        `${relativePath}:${index + 1}: 内部エラー。この行の扱い方（${String(outcome)}）が記録されていません。` +
          "行を飛ばす経路を足したなら、扱い方を返して`lineOutcomes`へ登録してください。",
      );
    }
  });

  flush();
  // **開いたまま終わった状態を表から機械的に報告する。** 個別のifで書いていたときは、
  // 状態を足すたびに報告を書き忘れて「そのファイルが丸ごと素通りする」穴を作っていた。
  for (const state of Object.values(skipping)) {
    if (state.open) errors.push(`${relativePath}: ${state.message(state.open)}`);
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
