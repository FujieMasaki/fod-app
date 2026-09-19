import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webPaths = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "eslint.config.mjs",
  "scripts/check-naming.mjs",
  "scripts/check-naming.test.mjs",
]);

const documentationPaths = new Set([
  "README.md",
  "AGENTS.md",
  ".github/pull_request_template.md",
]);

export function classifyPath(filePath) {
  if (filePath.startsWith("apps/web/") || webPaths.has(filePath)) return "web";
  if (filePath.startsWith("apps/api/")) return "api";
  if (filePath.startsWith(".github/actions/install-node-deps/")) return "web";
  if (filePath.startsWith("docs/") || filePath.startsWith(".claude/") || documentationPaths.has(filePath)) {
    return "docs";
  }
  return "both";
}

export function classifyPaths(filePaths) {
  // An empty diff is unexpected for a PR. Run everything rather than skip tests.
  if (filePaths.length === 0) return { web: true, api: true };

  const required = { web: false, api: false };
  for (const filePath of filePaths) {
    const area = classifyPath(filePath);
    if (area === "web" || area === "both") required.web = true;
    if (area === "api" || area === "both") required.api = true;
  }
  return required;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const inputPath = process.argv[2];
  if (!inputPath || !process.env.GITHUB_OUTPUT) {
    throw new Error("Expected a NUL-delimited path file and GITHUB_OUTPUT");
  }

  const filePaths = readFileSync(inputPath).toString("utf8").split("\0").filter(Boolean);
  const { web, api } = classifyPaths(filePaths);
  appendFileSync(process.env.GITHUB_OUTPUT, `web=${web}\napi=${api}\n`);
  console.log(`CI targets: web=${web}, api=${api}`);
}
