import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(rootDir, "docs");

// 日本語の本文で `**` の強調が壊れる形を機械的に止める。レビューでは見つけにくく、
// GitHub上の表示を見るまで気づかないため。
//
// 1. `***`以上のアスタリスクの連続。CJKの句点の直後に置くと閉じ側として使えず
//    （CommonMarkのright-flankingにならない）、`**`がそのまま本文に出る。
// 2. 1つのblock内で`**`が奇数。閉じ忘れか、閉じられない位置に置いている。
//    表の行は1行で閉じる必要があるので、行ごとに数える。
//
// コードスパンの中（`` `...` ``）は数えない。globやコード例に`**`が出るため。

// コードスパンは中身を数えたくないが、消すと前後の`**`が隣接して`****`に見える。
// 1文字のplaceholderへ置き換えて隣接させない。
export function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, "\u0000");
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

export function findEmphasisErrors(source, relativePath) {
  const errors = [];
  const lines = source.split("\n");

  let inFence = false;
  // block = 強調を閉じきる単位。空行・見出し・listの先頭・表の行で区切る。
  let block = null;

  const flush = () => {
    if (!block) return;
    const count = (block.text.match(/\*\*/g) ?? []).length;
    if (count % 2 === 1) {
      errors.push(
        `${relativePath}:${block.line}: \`**\` の数が奇数です（${count}個）。強調が閉じていないか、閉じられない位置にあります。`,
      );
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
        `${relativePath}:${lineNumber}: アスタリスクが${match[0].length}個連続しています。CJKの句点の直後では閉じ側として使えないので、\`**。**\` のように分けてください。`,
      );
    }

    if (line.trim() === "" || isHeading(line)) {
      flush();
      return;
    }
    if (isTableRow(line)) {
      flush();
      block = { line: lineNumber, text: line };
      flush();
      return;
    }
    if (isListItemStart(line)) flush();
    if (!block) block = { line: lineNumber, text: "" };
    block.text += line;
  });

  flush();
  return errors;
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

export async function checkDocsMarkdown(directory = docsDir) {
  const errors = [];
  for (const filePath of (await walk(directory)).sort()) {
    const relativePath = path.relative(rootDir, filePath);
    errors.push(...findEmphasisErrors(await readFile(filePath, "utf8"), relativePath));
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await checkDocsMarkdown();
  if (errors.length > 0) {
    console.error("Markdown emphasis violations:\n" + errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  }
}
