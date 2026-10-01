import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runs the pr-review-cycle final check with Codex in a read-only sandbox.
// Claude Code's permission rules match by prefix, so allowing `codex exec -s read-only *`
// would also allow appended flags that lift the sandbox. Only this script is allowed:
// it accepts the base branch alone and builds every codex argument itself.
// Usage: node scripts/codex-final-check.mjs origin/<base>

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const basePattern = /^origin\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function validateArgs(args) {
  if (args.length !== 1) {
    return { ok: false, error: "base branch only: node scripts/codex-final-check.mjs origin/<base>" };
  }
  const [base] = args;
  if (!basePattern.test(base) || base.includes("..")) {
    return { ok: false, error: `invalid base: ${base} (expected origin/<branch>)` };
  }
  return { ok: true, base };
}

export function buildCodexArgs(base, outputFile) {
  const prompt =
    `docs/code-review/final-check.md を読み、その手順で ${base}...HEAD の差分を最終チェックしてください。`;
  return ["exec", "--sandbox", "read-only", "--cd", repoRoot, "--output-last-message", outputFile, prompt];
}

function main(args) {
  const result = validateArgs(args);
  if (!result.ok) {
    console.error(result.error);
    return 2;
  }

  const verify = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${result.base}^{commit}`], {
    cwd: repoRoot,
  });
  if (verify.status !== 0) {
    console.error(`base not found: ${result.base} (run git fetch first)`);
    return 2;
  }

  const outputDir = mkdtempSync(path.join(tmpdir(), "codex-final-check-"));
  const outputFile = path.join(outputDir, "final.md");
  // Progress output is long; keep only the final message. stdin is closed so codex
  // neither appends it to the prompt nor waits for input.
  const codex = spawnSync("codex", buildCodexArgs(result.base, outputFile), {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (codex.error || codex.status !== 0) {
    console.error(`codex exec failed: ${codex.error?.message ?? `exit ${codex.status}`}`);
    return 1;
  }

  process.stdout.write(readFileSync(outputFile, "utf8"));
  console.error(`\nsaved: ${outputFile}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
