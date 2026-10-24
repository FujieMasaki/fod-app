import assert from "node:assert/strict";
import test from "node:test";
import {
  branchTypes,
  checksFor,
  evaluateStop,
  initialState,
  pauseState,
  resetState,
  MAX_BLOCKS,
  MAX_CONSECUTIVE_FAILURES,
  OWNER_TTL_MS,
  taskBranchPattern,
} from "./claude-quality-gate.mjs";

function fakeDeps(overrides = {}) {
  let state = overrides.state ?? null;
  const runs = [];
  const deps = {
    branch: () => "feat/task-008-dot-history",
    changedPaths: () => ["apps/web/src/main.tsx"],
    run: (check) => {
      runs.push([check.command, ...check.args].join(" "));
      return { ok: true, output: "" };
    },
    worktreeStatus: () => ({ dirty: false, unpushed: false }),
    pullRequest: () => ({ status: "found" }),
    readState: () => state,
    writeState: (next) => {
      state = structuredClone(next);
    },
    removeState: () => {
      state = null;
    },
    ...overrides,
  };
  return { deps, runs, state: () => state };
}

const failing = (label) => (check) =>
  [check.command, ...check.args].join(" ") === label ? { ok: false, output: "1 test failed" } : { ok: true, output: "" };

test("does nothing outside <type>/task-* branches", () => {
  const { deps, runs } = fakeDeps({ branch: () => "main" });
  assert.deepEqual(evaluateStop(deps), { block: false, message: undefined });
  assert.deepEqual(runs, []);
});

test("recognises every commit type as a task branch prefix", () => {
  for (const type of branchTypes) {
    assert.equal(taskBranchPattern.test(`${type}/task-008-dot-history`), true, type);
    assert.equal(taskBranchPattern.test(`${type}/task-008`), true, type);
  }
  // Prefixes outside the list, and branches without a task number, stay untouched.
  for (const branch of ["claude/task-008-x", "feature/task-008-x", "feat/dot-history", "feat/task-8-x"]) {
    assert.equal(taskBranchPattern.test(branch), false, branch);
  }
});

test("selects checks with the same classification as CI", () => {
  const labels = (paths) => checksFor(paths).map((check) => [check.command, ...check.args].join(" "));
  assert.deepEqual(labels(["docs/tasks/README.md"]), []);
  assert.deepEqual(labels(["apps/web/src/main.tsx"]), ["pnpm check", "pnpm type-check", "pnpm test"]);
  assert.deepEqual(labels(["apps/api/app/models/user.rb"]), [
    "bundle exec rubocop",
    "bundle exec brakeman --no-pager --quiet",
    "bundle exec rspec",
  ]);
  assert.equal(checksFor([]).length, 6);
});

test("allows the stop when checks pass and a PR exists", () => {
  const { deps, runs } = fakeDeps();
  assert.equal(evaluateStop(deps).block, false);
  assert.deepEqual(runs, ["pnpm check", "pnpm type-check", "pnpm test"]);
});

test("blocks with the failing output and stops at the first failure", () => {
  const { deps, state } = fakeDeps({ run: failing("pnpm type-check") });
  const decision = evaluateStop(deps);
  assert.equal(decision.block, true);
  assert.match(decision.reason, /pnpm type-check.*\(1\/5\)/);
  assert.match(decision.reason, /1 test failed/);
  assert.equal(state().consecutiveFailures, 1);
  assert.equal(state().blocks, 1);
});

test("at the limit, hands over locally without a PR, then lets Claude stop", () => {
  const { deps, state } = fakeDeps({
    run: failing("pnpm test"),
    pullRequest: () => ({ status: "none" }),
    state: { branch: "feat/task-008-dot-history", consecutiveFailures: MAX_CONSECUTIVE_FAILURES - 1, blocks: 4 },
  });
  const decision = evaluateStop(deps);
  assert.equal(decision.block, true);
  assert.match(decision.reason, /fix limit is reached/);
  // pre-push runs the same checks, so asking for a push or PR would be impossible.
  assert.match(decision.reason, /do not push or create a PR/);
  assert.equal(state().gaveUp, true);

  const next = evaluateStop(deps);
  assert.equal(next.block, false);
  assert.match(next.message, /without a PR/);
});

test("resets the failure count once checks pass", () => {
  const { deps, state } = fakeDeps({
    state: { branch: "feat/task-008-dot-history", consecutiveFailures: 3, blocks: 3 },
  });
  evaluateStop(deps);
  assert.equal(state().consecutiveFailures, 0);
});

test("blocks until changes are committed, pushed, and a PR exists", () => {
  const dirty = fakeDeps({ worktreeStatus: () => ({ dirty: true, unpushed: true }) });
  assert.match(evaluateStop(dirty.deps).reason, /uncommitted/);

  const unpushed = fakeDeps({ worktreeStatus: () => ({ dirty: false, unpushed: true }) });
  assert.match(evaluateStop(unpushed.deps).reason, /not pushed/);

  const noPr = fakeDeps({ pullRequest: () => ({ status: "none" }) });
  assert.match(evaluateStop(noPr.deps).reason, /no PR yet/);
});

test("does not loop when the PR cannot be checked", () => {
  const { deps } = fakeDeps({ pullRequest: () => ({ status: "error", error: "gh auth login required" }) });
  const decision = evaluateStop(deps);
  assert.equal(decision.block, false);
  assert.match(decision.message, /gh auth login required/);
});

test("lets Claude stop while paused for a human decision", () => {
  const { deps, runs } = fakeDeps({
    pullRequest: () => ({ status: "none" }),
    state: { branch: "feat/task-008-dot-history", consecutiveFailures: 0, blocks: 2, paused: "仕様の確認" },
  });
  const decision = evaluateStop(deps);
  assert.equal(decision.block, false);
  assert.match(decision.message, /仕様の確認/);
  assert.deepEqual(runs, []);
});

test("stops continuing after the block limit", () => {
  const { deps } = fakeDeps({
    pullRequest: () => ({ status: "none" }),
    state: { branch: "feat/task-008-dot-history", consecutiveFailures: 0, blocks: MAX_BLOCKS },
  });
  assert.equal(evaluateStop(deps).block, false);
});

test("state from another branch is ignored", () => {
  const { deps, state } = fakeDeps({
    state: { branch: "fix/task-006-identity", consecutiveFailures: 4, blocks: 39, paused: "old" },
    run: failing("pnpm check"),
  });
  assert.equal(evaluateStop(deps).block, true);
  assert.equal(state().branch, "feat/task-008-dot-history");
  assert.equal(state().consecutiveFailures, 1);
});

const ownedAt = "2026-10-24T00:00:00.000Z";
const soon = Date.parse(ownedAt) + 60 * 1000;

test("another session sharing the worktree is let go without touching the state", () => {
  const owned = { ...initialState("feat/task-008-dot-history", "run-task", ownedAt), blocks: 3 };
  let writes = 0;
  const { deps, runs, state } = fakeDeps({
    state: owned,
    worktreeStatus: () => ({ dirty: true, unpushed: true }),
  });
  const writeState = deps.writeState;
  deps.writeState = (next) => {
    writes += 1;
    writeState(next);
  };
  const decision = evaluateStop(deps, "other", soon);
  assert.equal(decision.block, false);
  // Say why the gate was skipped, so a session left out by mistake can notice it.
  assert.match(decision.message, /owned by session run-task/);
  assert.deepEqual(runs, []);
  // The owner's continuation count is not used up by someone else's stops.
  assert.equal(state().blocks, 3);
  assert.equal(writes, 0);
});

test("the session that ran --reset is still held to the gate", () => {
  const { deps, state } = fakeDeps({
    state: initialState("feat/task-008-dot-history", "run-task", ownedAt),
    worktreeStatus: () => ({ dirty: true, unpushed: true }),
  });
  assert.match(evaluateStop(deps, "run-task", soon).reason, /uncommitted/);
  assert.equal(state().blocks, 1);
});

test("keeps the owner when the task moves to another branch", () => {
  const { deps, state } = fakeDeps({
    state: { ...initialState("fix/task-006-identity", "run-task", ownedAt), blocks: 5 },
    worktreeStatus: () => ({ dirty: true, unpushed: true }),
  });
  assert.equal(evaluateStop(deps, "other", soon).block, false);
  assert.equal(evaluateStop(deps, "run-task", soon).block, true);
  assert.equal(state().branch, "feat/task-008-dot-history");
  assert.equal(state().sessionId, "run-task");
  assert.equal(state().blocks, 1);
});

test("without a recorded owner, every session is held to the gate as before", () => {
  const { deps } = fakeDeps({ worktreeStatus: () => ({ dirty: true, unpushed: true }) });
  assert.match(evaluateStop(deps, "any").reason, /uncommitted/);
});

test("an owner recorded but no session id in the hook input still blocks", () => {
  const { deps } = fakeDeps({
    state: initialState("feat/task-008-dot-history", "run-task", ownedAt),
    worktreeStatus: () => ({ dirty: true, unpushed: true }),
  });
  assert.match(evaluateStop(deps, undefined, soon).reason, /uncommitted/);
});

test("an expired owner no longer lets other sessions go", () => {
  const { deps } = fakeDeps({
    state: initialState("feat/task-008-dot-history", "run-task", ownedAt),
    worktreeStatus: () => ({ dirty: true, unpushed: true }),
  });
  assert.match(evaluateStop(deps, "other", Date.parse(ownedAt) + OWNER_TTL_MS).reason, /uncommitted/);
});

test("an unreadable or future ownedAt counts as expired", () => {
  for (const broken of [null, "not a date", "2026-10-25T00:00:00.000Z"]) {
    const { deps } = fakeDeps({
      state: { ...initialState("feat/task-008-dot-history", "run-task"), ownedAt: broken },
      worktreeStatus: () => ({ dirty: true, unpushed: true }),
    });
    assert.match(evaluateStop(deps, "other", soon).reason, /uncommitted/, String(broken));
  }
});

test("--reset records the session as the owner, or clears the state without an id", () => {
  const stale = { ...initialState("feat/task-008-dot-history", "old", ownedAt), blocks: 12, gaveUp: true };
  const withId = fakeDeps({ state: stale });
  resetState(withId.deps, "run-task", Date.parse(ownedAt));
  assert.deepEqual(withId.state(), initialState("feat/task-008-dot-history", "run-task", ownedAt));

  const withoutId = fakeDeps({ state: stale });
  resetState(withoutId.deps, undefined);
  assert.equal(withoutId.state(), null);
});

test("--pause keeps the counts and the owner", () => {
  const { deps, state } = fakeDeps({
    state: { ...initialState("feat/task-008-dot-history", "run-task", ownedAt), blocks: 2 },
  });
  pauseState(deps, "仕様の確認");
  assert.equal(state().paused, "仕様の確認");
  assert.equal(state().blocks, 2);
  assert.equal(state().sessionId, "run-task");
  assert.equal(state().ownedAt, ownedAt);
});
