import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  findClaims,
  formatReport,
  notificationText,
  parseMaxParallel,
  parseWorktrees,
  planRun,
  pullRequestFor,
  runTask,
  sessionSummary,
  waitingCounts,
} from "./task-scheduler.mjs";

function task(id, { status = "Blocked", category = "実装", dependencies = [], runnable = false, title = "サンプル" } = {}) {
  return { id, title, category, status, dependencies, runnable, reasons: [] };
}

test("claims come from worktrees named after or on a task branch, and open PRs from this repository", () => {
  const worktrees = parseWorktrees(
    [
      "worktree /repo\nHEAD aaa\nbranch refs/heads/main",
      "worktree /repo/.claude/worktrees/task-006\nHEAD bbb\ndetached",
      "worktree /repo/.claude/worktrees/review-flow\nHEAD ccc\nbranch refs/heads/feat/task-007-identity",
      "worktree /repo/.claude/worktrees/scheduler\nHEAD ddd\ndetached",
      "worktree /repo/.claude/worktrees/task-scheduler\nHEAD eee\nbranch refs/heads/feat/scheduled-task-runner",
      "",
    ].join("\n\n"),
  );
  const claims = findClaims({
    worktrees,
    pullRequests: [
      { number: 50, headRefName: "feat/task-008-dot-history", isCrossRepository: false },
      { number: 51, headRefName: "docs/review-flow", isCrossRepository: false },
      // Anyone can open a fork PR with any branch name; it must not block a task.
      { number: 52, headRefName: "feat/task-009-anything", isCrossRepository: true },
    ],
  });

  assert.deepEqual(
    [...claims],
    [
      ["TASK-006", "worktree task-006"],
      ["TASK-007", "worktree review-flow"],
      ["TASK-008", "PR #50"],
    ],
  );
});

test("waiting counts include tasks that wait through others, but not Done ones", () => {
  const counts = waitingCounts([
    task("TASK-001", { status: "Done" }),
    task("TASK-002", { dependencies: ["TASK-001"] }),
    task("TASK-003", { dependencies: ["TASK-002"] }),
    task("TASK-004", { status: "Done", dependencies: ["TASK-002"] }),
  ]);

  assert.equal(counts.get("TASK-001"), 2);
  assert.equal(counts.get("TASK-002"), 1);
  assert.equal(counts.get("TASK-003"), 0);
});

test("starts unclaimed runnable tasks, the most waited-on first, up to the limit", () => {
  const tasks = [
    task("TASK-001", { status: "Done" }),
    task("TASK-002", { runnable: true, dependencies: ["TASK-001"] }),
    task("TASK-003", { runnable: true, dependencies: ["TASK-001"] }),
    task("TASK-004", { runnable: true, status: "Todo" }),
    task("TASK-005", { dependencies: ["TASK-003"] }),
    task("TASK-006", { runnable: true, status: "Todo" }),
  ];

  const plan = planRun(tasks, findClaims({ worktrees: [{ path: "/repo/.claude/worktrees/task-006", branch: null }] }), 2);

  assert.deepEqual(
    plan.start.map((started) => started.id),
    ["TASK-003", "TASK-002"],
  );
  const reasons = Object.fromEntries(plan.remaining.map((remaining) => [remaining.id, remaining.reason]));
  assert.equal(reasons["TASK-004"], "並列数の上限のため次回");
  assert.equal(reasons["TASK-005"], "依存待ち: TASK-003");
  assert.equal(reasons["TASK-006"], "着手済み（worktree task-006）");
});

test("does not start In progress tasks, which are being worked or wait for a human", () => {
  const plan = planRun([task("TASK-001", { runnable: true, status: "In progress" })], new Map());

  assert.deepEqual(plan.start, []);
  assert.equal(plan.remaining[0].reason, "In progress（作業中または人間の確認待ち）");
});

test("with nothing to start, names the interactive bottleneck and what is left", () => {
  const tasks = [
    task("TASK-001", { status: "In progress", category: "設計判断", title: "生成の設計判断" }),
    task("TASK-002", { category: "API契約", dependencies: ["TASK-001"] }),
    task("TASK-003", { dependencies: ["TASK-002"] }),
  ];

  const plan = planRun(tasks, new Map());

  assert.deepEqual(plan.start, []);
  assert.deepEqual(plan.bottlenecks, [{ id: "TASK-001", title: "生成の設計判断", category: "設計判断", waiting: 2 }]);
  assert.equal(plan.remaining[1].reason, "人間と対話で進める（API契約） / 依存待ち: TASK-001");
  assert.equal(
    notificationText(plan),
    [
      "着手できるタスクはありません。残っているタスクはこちらです",
      "先に進める: TASK-001（設計判断）",
      "TASK-001 In progress: 人間と対話で進める（設計判断）",
      "TASK-002 Blocked: 人間と対話で進める（API契約） / 依存待ち: TASK-001",
      "TASK-003 Blocked: 依存待ち: TASK-002",
    ].join("\n"),
  );
  assert.match(formatReport(plan, [], { date: "2026-10-03-0400" }), /\| TASK-003 \| Blocked \| 依存待ち: TASK-002 \| サンプル \|/);
});

test("reports a PR for each started task, or why there is none", () => {
  const results = [
    { id: "TASK-006", detail: "done", pr: { number: 50, url: "https://example.test/pull/50" } },
    { id: "TASK-008", detail: "仕様の判断が必要" },
  ];

  assert.equal(
    notificationText({ remaining: [], bottlenecks: [] }, results),
    ["2件を進めました", "TASK-006: PR #50 https://example.test/pull/50", "TASK-008: PRなし（仕様の判断が必要）"].join(
      "\n",
    ),
  );
});

test("truncates long notifications and points to the report", () => {
  const remaining = Array.from({ length: 10 }, (_, index) => ({
    id: `TASK-0${10 + index}`,
    status: "Blocked",
    reason: "依存待ち",
  }));
  const lines = notificationText({ start: [], remaining, bottlenecks: [] }).split("\n");

  assert.equal(lines.length, 9);
  assert.equal(lines.at(-1), "ほか3行はレポートを参照");
});

test("summarizes a session by the last line of its final message", () => {
  const output = JSON.stringify({ result: "作業しました\nPR: https://example.test/pull/50" });

  assert.equal(sessionSummary(output), "PR: https://example.test/pull/50");
  assert.equal(sessionSummary(""), undefined);
  assert.equal(sessionSummary(JSON.stringify({ result: "" })), undefined);
});

test("parallelism accepts only positive integers", () => {
  assert.equal(parseMaxParallel("5"), 5);
  for (const value of ["0", "-2", "1.5", "abc", undefined]) assert.equal(parseMaxParallel(value), 3);
});

test("a session's PR is the one on its exact branch from this repository", () => {
  const pullRequests = [
    { number: 52, headRefName: "feat/task-006-backend-identity", isCrossRepository: true },
    { number: 51, headRefName: "feat/task-006-other", isCrossRepository: false },
    { number: 50, headRefName: "feat/task-006-backend-identity", isCrossRepository: false },
  ];

  assert.equal(pullRequestFor("feat/task-006-backend-identity", pullRequests).number, 50);
  assert.equal(pullRequestFor("feat/task-006-missing", pullRequests), undefined);
  assert.equal(pullRequestFor("", pullRequests), undefined);
});

// A spawn stand-in: emits the given events on the next tick, like a real child.
function fakeSpawn(events, logDir) {
  return (_command, _args, options) => {
    const child = new EventEmitter();
    child.pid = 999999;
    child.kill = () => {};
    setImmediate(() => {
      for (const [event, value] of events) {
        if (event === "output") writeFileSync(path.join(logDir, "TASK-006.json"), value);
        else child.emit(event, value);
      }
    });
    assert.equal(options.env.FOD_DB_SUFFIX, "_task_006");
    return child;
  };
}

// A git stand-in answering the calls runTask makes; records every call.
function fakeGit({ addOk = true, branch = "", head = "base", status = "" } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(" "));
    const ok = (stdout = "") => ({ ok: true, stdout, stderr: "" });
    if (args.includes("rev-parse") && args.includes("origin/main")) return ok("base\n");
    if (args.includes("add")) return addOk ? ok() : { ok: false, stdout: "", stderr: "already exists" };
    if (args.includes("--show-current")) return ok(`${branch}\n`);
    if (args.includes("HEAD")) return ok(`${head}\n`);
    if (args.includes("status")) return ok(status);
    return ok();
  };
  return { git, calls };
}

function withLogDir(callback) {
  const logDir = mkdtempSync(path.join(tmpdir(), "task-scheduler-"));
  return callback(logDir).finally(() => rmSync(logDir, { recursive: true, force: true }));
}

const removed = (calls) => calls.some((call) => call.includes("worktree remove"));

test("a session claude could not start settles once and gives the task back", () =>
  withLogDir(async (logDir) => {
    const { git, calls } = fakeGit();
    // A failed spawn emits both events; closing the log files twice would crash.
    const spawn = fakeSpawn([["error", new Error("spawn claude ENOENT")], ["close", -2]], logDir);

    const result = await runTask({ id: "TASK-006" }, { root: "/repo", logDir, deps: { git, spawn } });

    assert.match(result.detail, /^claudeを起動できません: spawn claude ENOENT/);
    assert.equal(result.branch, "");
    assert.ok(removed(calls));
  }));

test("a session that ended without any work gives the task back", () =>
  withLogDir(async (logDir) => {
    const { git, calls } = fakeGit();
    const spawn = fakeSpawn([["output", JSON.stringify({ result: "認証が必要です" })], ["close", 1]], logDir);

    const result = await runTask({ id: "TASK-006" }, { root: "/repo", logDir, deps: { git, spawn } });

    assert.equal(result.detail, "認証が必要です（作業がなかったためworktreeを削除）");
    assert.ok(removed(calls));
  }));

test("a session that left a branch keeps its worktree and reports the branch", () =>
  withLogDir(async (logDir) => {
    const { git, calls } = fakeGit({ branch: "feat/task-006-backend-identity", head: "other" });
    const spawn = fakeSpawn([["output", JSON.stringify({ result: "PRを作成しました" })], ["close", 0]], logDir);

    const result = await runTask({ id: "TASK-006" }, { root: "/repo", logDir, deps: { git, spawn } });

    assert.deepEqual(result, { id: "TASK-006", branch: "feat/task-006-backend-identity", detail: "PRを作成しました" });
    assert.ok(!removed(calls));
  }));

test("a worktree that already exists means another session holds the task", () =>
  withLogDir(async (logDir) => {
    const { git } = fakeGit({ addOk: false });
    const spawn = () => assert.fail("must not start a session");

    const result = await runTask({ id: "TASK-006" }, { root: "/repo", logDir, deps: { git, spawn } });

    assert.equal(result.detail, "worktreeを作れません: already exists");
  }));

test("a session with uncommitted work keeps its worktree", () =>
  withLogDir(async (logDir) => {
    const { git, calls } = fakeGit({ status: " M apps/api/Gemfile\n" });
    const spawn = fakeSpawn([["close", 1]], logDir);

    await runTask({ id: "TASK-006" }, { root: "/repo", logDir, deps: { git, spawn } });

    assert.ok(!removed(calls));
  }));

test("a running session is recorded for manual /run-task and the record is removed after", () =>
  withLogDir(async (logDir) => {
    const lockDir = path.join(logDir, "scheduled-sessions");
    const lockPath = path.join(lockDir, "TASK-006.json");
    const { git } = fakeGit({ branch: "feat/task-006-x" });
    let recorded;
    const spawn = (...args) => {
      const child = fakeSpawn([["close", 0]], logDir)(...args);
      assert.equal(args[2].env.FOD_SCHEDULED_TASK, "TASK-006");
      queueMicrotask(() => (recorded = JSON.parse(readFileSync(lockPath, "utf8"))));
      return child;
    };

    await runTask({ id: "TASK-006" }, { root: "/repo", logDir, lockDir, deps: { git, spawn } });

    assert.deepEqual(recorded, { pid: 999999, worktree: "/repo/.claude/worktrees/task-006" });
    assert.ok(!existsSync(lockPath));
  }));

test("plan mode lists what would start instead of saying nothing can", () => {
  const plan = { start: [{ id: "TASK-006", title: "認証基盤" }], remaining: [], bottlenecks: [] };

  assert.equal(notificationText(plan), "1件を起動予定\nTASK-006: 認証基盤");
});

test("a session keeps running and keeps its worktree when it cannot be recorded", () =>
  withLogDir(async (logDir) => {
    // A file where the record directory should be makes recording fail.
    const lockDir = path.join(logDir, "not-a-directory");
    writeFileSync(lockDir, "");
    const { git, calls } = fakeGit({ branch: "feat/task-006-x" });
    const spawn = fakeSpawn([["close", 0]], logDir);

    const result = await runTask({ id: "TASK-006" }, { root: "/repo", logDir, lockDir, deps: { git, spawn } });

    assert.equal(result.branch, "feat/task-006-x");
    assert.ok(!removed(calls));
  }));
