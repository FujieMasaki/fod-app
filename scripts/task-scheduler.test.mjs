import assert from "node:assert/strict";
import test from "node:test";
import { findClaims, formatReport, notificationText, planRun, waitingCounts } from "./task-scheduler.mjs";

function task(id, { status = "Blocked", category = "実装", dependencies = [], runnable = false, title = "サンプル" } = {}) {
  return { id, title, category, status, dependencies, runnable, reasons: [] };
}

test("claims come from /run-task worktrees and open PR branches only", () => {
  const claims = findClaims({
    worktreeNames: ["task-006", "scheduler", "task-scheduler", "review-flow"],
    pullRequests: [
      { number: 50, headRefName: "feat/task-008-dot-history" },
      { number: 51, headRefName: "docs/review-flow" },
    ],
  });

  assert.deepEqual(
    [...claims],
    [
      ["TASK-006", "worktree .claude/worktrees/task-006"],
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

  const plan = planRun(tasks, findClaims({ worktreeNames: ["task-006"] }), 2);

  assert.deepEqual(
    plan.start.map((started) => started.id),
    ["TASK-003", "TASK-002"],
  );
  const reasons = Object.fromEntries(plan.remaining.map((remaining) => [remaining.id, remaining.reason]));
  assert.equal(reasons["TASK-004"], "並列数の上限のため次回");
  assert.equal(reasons["TASK-005"], "依存待ち: TASK-003");
  assert.equal(reasons["TASK-006"], "着手済み（worktree .claude/worktrees/task-006）");
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
  const lines = notificationText({ remaining, bottlenecks: [] }).split("\n");

  assert.equal(lines.length, 9);
  assert.equal(lines.at(-1), "ほか3行はレポートを参照");
});
