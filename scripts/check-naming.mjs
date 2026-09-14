import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(rootDir, "src");
const sourceExtensions = new Set([".ts", ".tsx", ".css"]);
const nextFileNames = new Set([
  "default",
  "error",
  "global-error",
  "globals",
  "index",
  "layout",
  "loading",
  "not-found",
  "page",
  "route",
  "template",
]);
const kebabCase = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const camelCase = /^[a-z][a-zA-Z0-9]*$/;

export function isAllowedPathSegment(segment) {
  return (
    kebabCase.test(segment) ||
    /^\([^()]+\)$/.test(segment) ||
    /^\[\[?\.\.\.[^\]]+\]\]?$/.test(segment) ||
    /^\[[^\]]+\]$/.test(segment) ||
    /^_[a-z][a-z0-9-]*$/.test(segment)
  );
}

export function isAllowedFileName(fileName) {
  const extension = path.extname(fileName);
  if (!sourceExtensions.has(extension)) return true;

  let stem = fileName.slice(0, -extension.length);
  if (stem.endsWith(".module")) stem = stem.slice(0, -".module".length);
  if (stem.endsWith(".test")) stem = stem.slice(0, -".test".length);
  if (stem.endsWith(".spec")) stem = stem.slice(0, -".spec".length);

  return nextFileNames.has(stem) || kebabCase.test(stem);
}

export function findCssNamingErrors(source, relativePath) {
  const errors = [];
  const isModule = relativePath.endsWith(".module.css");
  const classPattern = /\.([A-Za-z_-][A-Za-z0-9_-]*)/g;
  const customPropertyPattern = /^\s*(--[A-Za-z0-9_-]+)\s*:/gm;
  const keyframesPattern = /@(?:-[a-z]+-)?keyframes\s+([A-Za-z_-][A-Za-z0-9_-]*)/g;

  for (const match of source.matchAll(classPattern)) {
    const className = match[1];
    const valid = isModule ? camelCase.test(className) : kebabCase.test(className) || camelCase.test(className);
    if (!valid) errors.push(`${relativePath}: CSS class \`.${className}\` must use ${isModule ? "camelCase" : "camelCase or kebab-case"}.`);
  }

  for (const match of source.matchAll(customPropertyPattern)) {
    const property = match[1];
    if (!/^--[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(property)) {
      errors.push(`${relativePath}: custom property \`${property}\` must use lowercase kebab-case.`);
    }
  }

  for (const match of source.matchAll(keyframesPattern)) {
    const name = match[1];
    if (!camelCase.test(name)) errors.push(`${relativePath}: keyframes \`${name}\` must use camelCase.`);
  }

  return errors;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

export async function checkNaming(directory = sourceDir) {
  const errors = [];
  const files = await walk(directory);

  for (const filePath of files) {
    const relativePath = path.relative(directory, filePath);
    const segments = relativePath.split(path.sep);
    const fileName = segments.pop();

    for (const segment of segments) {
      if (!isAllowedPathSegment(segment)) {
        errors.push(`${relativePath}: directory \`${segment}\` must use kebab-case.`);
      }
    }
    if (!isAllowedFileName(fileName)) {
      errors.push(`${relativePath}: file name \`${fileName}\` must use kebab-case.`);
    }
    if (fileName.endsWith(".css")) {
      errors.push(...findCssNamingErrors(await readFile(filePath, "utf8"), relativePath));
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await checkNaming();
  if (errors.length > 0) {
    console.error("Naming convention violations:\n" + errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  }
}
