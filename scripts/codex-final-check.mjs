import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync } from "node:fs";
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

// Background runs have no time limit of their own, so the script carries one. A distinct
// exit code lets the caller tell a timeout (retry once) from other failures (stop).
export const TIMEOUT_MS = 20 * 60 * 1000;
export const EXIT_TIMEOUT = 3;

// The user config is not loaded (its MCP servers and plugins run outside the sandbox), so the
// model it would have chosen is pinned here.
export const MODEL = "gpt-6.1-sol";
export const REASONING_EFFORT = "high";
// Features that reach outside the sandbox (browser, desktop, app integrations, hooks).
export const DISABLED_FEATURES = [
  "apps",
  "browser_use",
  "browser_use_external",
  "computer_use",
  "hooks",
  "in_app_browser",
  "plugins",
];

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
  // --sandbox only confines shell commands the model runs. execpolicy `allow` rules, MCP servers
  // and plugins from the user config, and the features below all act outside it, so none are
  // loaded, and approvals are disabled so nothing can be escalated during the check.
  return [
    "exec",
    "--sandbox",
    "read-only",
    "--ignore-rules",
    "--ignore-user-config",
    "--ephemeral",
    "-c",
    'approval_policy="never"',
    "-m",
    MODEL,
    "-c",
    `model_reasoning_effort="${REASONING_EFFORT}"`,
    "-c",
    'web_search="disabled"',
    ...DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
    "--cd",
    repoRoot,
    "--output-last-message",
    outputFile,
    prompt,
  ];
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

  const revision = (args) => spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  const outputDir = mkdtempSync(path.join(tmpdir(), "codex-final-check-"));
  const outputFile = path.join(outputDir, "final.md");
  const logFile = path.join(outputDir, "progress.log");
  // Printed first so the range Codex reports can be compared, and the files found again.
  console.log(`base: ${result.base} ${revision(["rev-parse", result.base])}`);
  console.log(`merge-base: ${revision(["merge-base", result.base, "HEAD"])}`);
  console.log(`HEAD: ${revision(["rev-parse", "HEAD"])}`);
  console.log(`saved: ${outputFile} (progress: ${logFile})\n`);

  // Progress output is long, so stdout and stderr both go to the log and only the final
  // message is printed. stdin is closed so codex neither appends it to the prompt nor
  // waits for input.
  const log = openSync(logFile, "w");
  const codex = spawnSync("codex", buildCodexArgs(result.base, outputFile), {
    cwd: repoRoot,
    stdio: ["ignore", log, log],
    timeout: TIMEOUT_MS,
    killSignal: "SIGTERM",
  });
  closeSync(log);
  const tail = () => readFileSync(logFile, "utf8").split("\n").slice(-20).join("\n");
  if (codex.error?.code === "ETIMEDOUT") {
    console.error(`codex exec timed out after ${TIMEOUT_MS / 60000} minutes\n${tail()}`);
    return EXIT_TIMEOUT;
  }
  if (codex.error || codex.status !== 0) {
    console.error(`codex exec failed: ${codex.error?.message ?? `exit ${codex.status ?? codex.signal}`}\n${tail()}`);
    return 1;
  }
  if (!existsSync(outputFile)) {
    console.error(`codex exec wrote no final message\n${tail()}`);
    return 1;
  }

  process.stdout.write(readFileSync(outputFile, "utf8"));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
