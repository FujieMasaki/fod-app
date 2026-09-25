import assert from "node:assert/strict";
import test from "node:test";
import { checksFor, evaluateStop, MAX_BLOCKS, MAX_CONSECUTIVE_FAILURES } from "./claude-quality-gate.mjs";

function fakeDeps(overrides = {}) {
  let state = overrides.state ?? null;
  const runs = [];
  const deps = {
    branch: () => "claude/task-008-dot-history",
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
    ...overrides,
  };
  return { deps, runs, state: () => state };
}

const failing = (label) => (check) =>
  [check.command, ...check.args].join(" ") === label ? { ok: false, output: "1 test failed" } : { ok: true, output: "" };

test("does nothing outside claude/task-* branches", () => {
  const { deps, runs } = fakeDeps({ branch: () => "main" });
  assert.deepEqual(evaluateStop(deps), { block: false, message: undefined });
  assert.deepEqual(runs, []);
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

test("asks for a PR with the failure recorded at the limit, then lets Claude stop", () => {
  const { deps, state } = fakeDeps({
    run: failing("pnpm test"),
    state: { branch: "claude/task-008-dot-history", consecutiveFailures: MAX_CONSECUTIVE_FAILURES - 1, blocks: 4 },
  });
  const decision = evaluateStop(deps);
  assert.equal(decision.block, true);
  assert.match(decision.reason, /fix limit is reached/);
  assert.equal(state().gaveUp, true);

  assert.equal(evaluateStop(deps).block, false);
});

test("resets the failure count once checks pass", () => {
  const { deps, state } = fakeDeps({
    state: { branch: "claude/task-008-dot-history", consecutiveFailures: 3, blocks: 3 },
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
    state: { branch: "claude/task-008-dot-history", consecutiveFailures: 0, blocks: 2, paused: "仕様の確認" },
  });
  const decision = evaluateStop(deps);
  assert.equal(decision.block, false);
  assert.match(decision.message, /仕様の確認/);
  assert.deepEqual(runs, []);
});

test("stops continuing after the block limit", () => {
  const { deps } = fakeDeps({
    pullRequest: () => ({ status: "none" }),
    state: { branch: "claude/task-008-dot-history", consecutiveFailures: 0, blocks: MAX_BLOCKS },
  });
  assert.equal(evaluateStop(deps).block, false);
});

test("state from another branch is ignored", () => {
  const { deps, state } = fakeDeps({
    state: { branch: "claude/task-006-identity", consecutiveFailures: 4, blocks: 39, paused: "old" },
    run: failing("pnpm check"),
  });
  assert.equal(evaluateStop(deps).block, true);
  assert.equal(state().branch, "claude/task-008-dot-history");
  assert.equal(state().consecutiveFailures, 1);
});
