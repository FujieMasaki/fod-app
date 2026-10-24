import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyPaths } from "./ci-changes.mjs";

// Claude Code Stop hook for /run-task, started via scripts/claude-hook.sh.
// On <type>/task-* branches it keeps Claude working until the CI-equivalent
// checks pass and a PR exists, unless Claude paused for a human decision.
// Exit code 2 blocks the stop and feeds stderr back to Claude.

export const MAX_CONSECUTIVE_FAILURES = 5;
export const MAX_BLOCKS = 40;
// A /run-task runs within a day. After that the recorded owner is treated as
// gone, so a leftover state does not keep every later session out of the gate.
export const OWNER_TTL_MS = 24 * 60 * 60 * 1000;
const OUTPUT_TAIL_LINES = 60;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

// The prefix is the commit type of the task's main change, so the branch name
// reads like the PR title instead of naming the tool that wrote it.
export const branchTypes = ["feat", "fix", "refactor", "chore", "docs", "test"];

export const taskBranchPattern = new RegExp(String.raw`^(?:${branchTypes.join("|")})/task-\d{3}(?:-|$)`);

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

// The state belongs to the session that ran --reset, so another session sharing
// the worktree is not held to that task's commits or its continuation count.
export function initialState(branch, sessionId, ownedAt) {
  const owner = sessionId ? { sessionId, ownedAt: ownedAt ?? null } : { sessionId: null, ownedAt: null };
  return { branch, consecutiveFailures: 0, blocks: 0, gaveUp: false, paused: null, ...owner };
}

// An unreadable or future ownedAt counts as expired, so a broken record never
// keeps other sessions out of the gate for longer than a day.
function ownedByAnother(saved, sessionId, now) {
  if (!saved?.sessionId || !sessionId || saved.sessionId === sessionId) return false;
  const ownedAt = Date.parse(saved.ownedAt);
  return Number.isFinite(ownedAt) && ownedAt <= now && now - ownedAt < OWNER_TTL_MS;
}

// deps: branch(), changedPaths(), run(check), worktreeStatus(), pullRequest(),
// readState(), writeState(state), removeState(). Kept injectable so the decisions are testable.
export function evaluateStop(deps, sessionId, now = Date.now()) {
  const branch = deps.branch();
  if (!taskBranchPattern.test(branch ?? "")) return allow();

  const saved = deps.readState();
  // Leave the state untouched so the owning session's counts stay its own. Without
  // either id, or once the owner has expired, every session is held to the gate.
  if (ownedByAnother(saved, sessionId, now)) {
    return allow(`Quality gate skipped: owned by session ${saved.sessionId} since ${saved.ownedAt}`);
  }
  // Switching branches restarts the counts but keeps the owner.
  const state = saved?.branch === branch ? saved : initialState(branch, saved?.sessionId, saved?.ownedAt);

  const owner = { sessionId: saved?.sessionId ?? null, ownedAt: saved?.ownedAt ?? null };
  const finish = (decision) => {
    // The checks can take minutes. If --reset ran meanwhile, its state wins: writing
    // ours back would erase the new owner, and a new owner elsewhere lets this session go.
    const current = deps.readState();
    if ((current?.sessionId ?? null) !== owner.sessionId || (current?.ownedAt ?? null) !== owner.ownedAt) {
      if (current?.sessionId && sessionId && current.sessionId !== sessionId) {
        return allow(`Quality gate skipped: owned by session ${current.sessionId} since ${current.ownedAt}`);
      }
      return decision;
    }
    if (decision.block) state.blocks += 1;
    deps.writeState(state);
    return decision;
  };

  if (state.paused) return finish(allow(`/run-task paused: ${state.paused}`));
  if (state.gaveUp) {
    return finish(allow("/run-task stopped after repeated check failures; handed over without a PR"));
  }
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
      // pre-push runs the same checks, so a failing branch cannot be pushed.
      // Hand over locally instead of asking for a PR that cannot be created.
      state.gaveUp = true;
      return finish(
        block(
          `${header}\nThe fix limit is reached. Do not weaken or skip tests, and do not push or create a PR. ` +
            `Record the failing check, what you tried, and your best guess at the cause in the Plan's ` +
            `Completion Record, and commit it locally if the pre-commit hook allows. Then report the same ` +
            `to the human in chat and stop.\n\n${tail(result.output)}`,
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
  if (worktree.unpushed) {
    return finish(
      block(
        "Checks passed, but commits are not pushed. Push with an explicit destination " +
          "(`git push -u origin HEAD:<this branch>`) and continue.",
      ),
    );
  }

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

// Without a session id the state is removed, so every session is held to the gate as before.
export function resetState(deps, sessionId, now = Date.now()) {
  if (sessionId) deps.writeState(initialState(deps.branch(), sessionId, new Date(now).toISOString()));
  else deps.removeState();
}

// Pausing never changes the owner; only --reset does.
export function pauseState(deps, reason) {
  const branch = deps.branch();
  const saved = deps.readState();
  const state = saved?.branch === branch ? saved : initialState(branch, saved?.sessionId, saved?.ownedAt);
  deps.writeState({ ...state, paused: reason });
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
    removeState: () => rmSync(stateFile, { force: true }),
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
    // reset the runner state when /run-task starts or resumes. Claude Code passes
    // the session id to Bash, which is the same id the Stop hook receives.
    const deps = gitDeps(process.cwd());
    const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
    if (flag === "--reset") {
      resetState(deps, sessionId);
      console.log(`/run-task state reset for session ${sessionId ?? "(unknown)"}`);
    } else {
      const reason = rest.join(" ").trim();
      if (!reason) throw new Error('Usage: --pause "<reason>"');
      pauseState(deps, reason);
      console.log(`/run-task paused: ${reason}`);
    }
  } else {
    const input = readStdin();
    const decision = evaluateStop(gitDeps(input.cwd ?? process.cwd()), input.session_id);
    if (decision.block) {
      process.stderr.write(`${decision.reason}\n`);
      process.exitCode = 2;
    } else if (decision.message) {
      console.log(JSON.stringify({ systemMessage: decision.message }));
    }
  }
}
