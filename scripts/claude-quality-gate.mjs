import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyPaths } from "./ci-changes.mjs";

// Claude Code Stop hook for /run-task, started via scripts/claude-hook.sh.
// On claude/task-* branches it keeps Claude working until the CI-equivalent
// checks pass and a PR exists, unless Claude paused for a human decision.
// Exit code 2 blocks the stop and feeds stderr back to Claude.

export const MAX_CONSECUTIVE_FAILURES = 5;
export const MAX_BLOCKS = 40;
const OUTPUT_TAIL_LINES = 60;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

export const taskBranchPattern = /^claude\/task-\d{3}(?:-|$)/;

const webChecks = [
  { cwd: ".", command: "pnpm", args: ["check"] },
  { cwd: ".", command: "pnpm", args: ["type-check"] },
  { cwd: ".", command: "pnpm", args: ["test"] },
];

// build and bundler-audit --update stay in CI: they are slow or need network.
const apiChecks = [
  { cwd: "apps/api", command: "bundle", args: ["exec", "rubocop"] },
  { cwd: "apps/api", command: "bundle", args: ["exec", "brakeman", "--no-pager", "--quiet"] },
  { cwd: "apps/api", command: "bundle", args: ["exec", "rspec"] },
];

export function checksFor(paths) {
  const { web, api } = classifyPaths(paths);
  return [...(web ? webChecks : []), ...(api ? apiChecks : [])];
}

function tail(output) {
  return output.trimEnd().split("\n").slice(-OUTPUT_TAIL_LINES).join("\n");
}

const allow = (message) => ({ block: false, message });
const block = (reason) => ({ block: true, reason });

// deps: branch(), changedPaths(), run(check), worktreeStatus(), pullRequest(),
// readState(), writeState(state). Kept injectable so the decisions are testable.
export function evaluateStop(deps) {
  const branch = deps.branch();
  if (!taskBranchPattern.test(branch ?? "")) return allow();

  const saved = deps.readState();
  const state =
    saved?.branch === branch ? saved : { branch, consecutiveFailures: 0, blocks: 0, gaveUp: false, paused: null };

  const finish = (decision) => {
    if (decision.block) state.blocks += 1;
    deps.writeState(state);
    return decision;
  };

  if (state.paused) return finish(allow(`/run-task paused: ${state.paused}`));
  if (state.gaveUp) return finish(allow("/run-task stopped after repeated check failures"));
  if (state.blocks >= MAX_BLOCKS) {
    return finish(allow(`/run-task reached ${MAX_BLOCKS} continuations; stopping for a human`));
  }

  for (const check of checksFor(deps.changedPaths())) {
    const result = deps.run(check);
    if (result.ok) continue;

    state.consecutiveFailures += 1;
    const label = [check.command, ...check.args].join(" ");
    const header = `Quality gate failed: \`${label}\` in ${check.cwd} (${state.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}).`;

    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      state.gaveUp = true;
      return finish(
        block(
          `${header}\nThe fix limit is reached. Do not weaken or skip tests. Record the failing check and ` +
            `what you tried in the Plan's Completion Record and in the PR body, commit, push, create the PR, ` +
            `print its URL, and then stop.\n\n${tail(result.output)}`,
        ),
      );
    }
    return finish(
      block(`${header}\nFix the cause and keep going. Do not weaken or skip tests.\n\n${tail(result.output)}`),
    );
  }
  state.consecutiveFailures = 0;

  const worktree = deps.worktreeStatus();
  if (worktree.dirty) {
    return finish(block("Checks passed, but there are uncommitted changes. Commit them by concern and continue."));
  }
  if (worktree.unpushed) return finish(block("Checks passed, but commits are not pushed. Push and continue."));

  const pullRequest = deps.pullRequest();
  if (pullRequest.status === "error") {
    // Never loop on a gh/network failure: surface it and let a human look.
    return finish(allow(`Could not check the PR (${pullRequest.error}); stopping for a human`));
  }
  if (pullRequest.status === "none") {
    return finish(
      block(
        "Checks passed, but this branch has no PR yet. Finish the remaining /run-task steps " +
          "(Plan record, self-review, push) and create the PR, then print its URL.",
      ),
    );
  }
  return finish(allow());
}

function sh(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: COMMAND_TIMEOUT_MS });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`;
  return { ok: result.status === 0, output, stdout: result.stdout ?? "" };
}

export function gitDeps(cwd) {
  const git = (...args) => sh("git", args, cwd);
  const root = git("rev-parse", "--show-toplevel").stdout.trim() || cwd;
  const stateFile = path.resolve(root, git("rev-parse", "--git-dir").stdout.trim(), "claude-task-runner.json");

  return {
    stateFile,
    branch: () => git("branch", "--show-current").stdout.trim(),
    changedPaths: () => {
      const base = ["origin/main", "main"].map((ref) => git("merge-base", ref, "HEAD")).find((result) => result.ok);
      // Without a base, run every check rather than skip them.
      if (!base) return [];
      const lines = (result) => result.stdout.split("\n").filter(Boolean);
      return [
        ...lines(git("diff", "--name-only", "--no-renames", base.stdout.trim())),
        ...lines(git("ls-files", "--others", "--exclude-standard")),
      ];
    },
    run: (check) => sh(check.command, check.args, path.join(root, check.cwd)),
    worktreeStatus: () => {
      const unpushed = git("rev-list", "--count", "@{upstream}..HEAD");
      return {
        dirty: git("status", "--porcelain").stdout.trim() !== "",
        // No upstream yet means nothing has been pushed.
        unpushed: !unpushed.ok || Number(unpushed.stdout.trim()) > 0,
      };
    },
    pullRequest: () => {
      // Any PR counts, including merged or closed ones, so a finished branch
      // is never pushed back into work.
      const result = sh("gh", ["pr", "view", "--json", "url"], root);
      if (result.ok) return { status: "found" };
      if (/no pull requests found/i.test(result.output)) return { status: "none" };
      return { status: "error", error: tail(result.output).split("\n").at(-1) };
    },
    readState: () => {
      try {
        return JSON.parse(readFileSync(stateFile, "utf8"));
      } catch {
        return null;
      }
    },
    writeState: (state) => writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`),
  };
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [flag, ...rest] = process.argv.slice(2);

  if (flag === "--pause" || flag === "--reset") {
    // Called by Claude from the task worktree: pause for a human decision, or
    // clear the runner state when /run-task starts or resumes.
    const deps = gitDeps(process.cwd());
    if (flag === "--reset") {
      rmSync(deps.stateFile, { force: true });
      console.log("/run-task state cleared");
    } else {
      const reason = rest.join(" ").trim();
      if (!reason) throw new Error('Usage: --pause "<reason>"');
      const branch = deps.branch();
      const saved = deps.readState();
      const state = saved?.branch === branch ? saved : { branch, consecutiveFailures: 0, blocks: 0, gaveUp: false };
      deps.writeState({ ...state, paused: reason });
      console.log(`/run-task paused: ${reason}`);
    }
  } else {
    const input = readStdin();
    const decision = evaluateStop(gitDeps(input.cwd ?? process.cwd()));
    if (decision.block) {
      process.stderr.write(`${decision.reason}\n`);
      process.exitCode = 2;
    } else if (decision.message) {
      console.log(JSON.stringify({ systemMessage: decision.message }));
    }
  }
}
