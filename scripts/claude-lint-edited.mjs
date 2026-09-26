import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { taskBranchPattern } from "./claude-quality-gate.mjs";

// Claude Code PostToolUse hook for Edit / Write on claude/task-* branches.
// Lints only the edited file and hands problems back to Claude as context.
// It never blocks: the Stop hook quality gate is the enforcing check.

export function lintCommandFor(root, filePath) {
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;

  if (/\.(?:[cm]?[jt]sx?)$/.test(relative)) {
    return { cwd: root, command: "pnpm", args: ["exec", "eslint", "--", relative] };
  }
  if (relative.startsWith("apps/api/") && /\.(?:rb|rake)$/.test(relative)) {
    return { cwd: path.join(root, "apps/api"), command: "bundle", args: ["exec", "rubocop", path.relative("apps/api", relative)] };
  }
  return undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    // Not a hook payload; nothing to lint.
  }

  const cwd = input.cwd ?? process.cwd();
  const git = (...args) => spawnSync("git", args, { cwd, encoding: "utf8" }).stdout?.trim() ?? "";
  const filePath = input.tool_input?.file_path;

  if (filePath && taskBranchPattern.test(git("branch", "--show-current"))) {
    const root = git("rev-parse", "--show-toplevel") || cwd;
    const lint = lintCommandFor(root, path.resolve(cwd, filePath));
    if (lint) {
      const result = spawnSync(lint.command, lint.args, { cwd: lint.cwd, encoding: "utf8", timeout: 60_000 });
      if (result.status !== 0) {
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
        console.log(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: "PostToolUse",
              additionalContext: `Lint problems in ${path.relative(root, filePath)}; fix them now:\n${output}`,
            },
          }),
        );
      }
    }
  }
}
