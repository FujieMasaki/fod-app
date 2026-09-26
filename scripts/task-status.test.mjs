import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateTask, parseTask } from "./task-status.mjs";

function taskMarkdown({ id, category = "実装", status = "Todo", dependencies = [], criteria = ["- [ ] 動く。"] }) {
  const dependencyLines = dependencies.length ? dependencies.map((dep) => `- ${dep}`).join("\n") : "なし。";
  return `# ${id}: サンプル

| 項目 | 内容 |
| --- | --- |
| ID | ${id} |
| タスク名 | サンプル |
| 作業区分 | ${category} |
| 状態 | ${status} |

## 確認可能な完了条件

${criteria.join("\n")}

## 依存するタスクID

${dependencyLines}

依存先の説明。

## 必要な検証

- [ ] これは完了条件ではない。
`;
}

function withTasks(tasks, callback) {
  const tasksDir = mkdtempSync(path.join(tmpdir(), "task-status-"));
  try {
    for (const task of tasks) writeFileSync(path.join(tasksDir, `${task.id}-sample.md`), taskMarkdown(task));
    return callback(tasksDir);
  } finally {
    rmSync(tasksDir, { recursive: true, force: true });
  }
}

test("parses fields, dependencies, and only the acceptance criteria checkboxes", () => {
  const task = parseTask(
    taskMarkdown({
      id: "TASK-008",
      status: "Blocked",
      dependencies: ["TASK-004", "TASK-006"],
      criteria: ["- [ ] 保存できる。", "- [x] 取得できる。"],
    }),
  );

  assert.deepEqual(task, {
    id: "TASK-008",
    title: "サンプル",
    category: "実装",
    status: "Blocked",
    dependencies: ["TASK-004", "TASK-006"],
    acceptanceCriteria: [
      { done: false, text: "保存できる。" },
      { done: true, text: "取得できる。" },
    ],
  });
});

test("an implementation task with every dependency Done is runnable", () => {
  withTasks(
    [
      { id: "TASK-001", status: "Done" },
      { id: "TASK-002", dependencies: ["TASK-001"] },
    ],
    (tasksDir) => {
      const result = evaluateTask("TASK-002", { tasksDir });
      assert.equal(result.runnable, true);
      assert.equal(result.unblocking, false);
      assert.deepEqual(result.reasons, []);
    },
  );
});

test("a Blocked task whose dependencies are Done is a candidate for unblocking", () => {
  withTasks(
    [
      { id: "TASK-001", status: "Done" },
      { id: "TASK-002", status: "Blocked", dependencies: ["TASK-001"] },
    ],
    (tasksDir) => {
      const result = evaluateTask("TASK-002", { tasksDir });
      assert.equal(result.runnable, true);
      assert.equal(result.unblocking, true);
    },
  );
});

test("an In progress task can be resumed", () => {
  withTasks([{ id: "TASK-001", status: "In progress" }], (tasksDir) => {
    assert.equal(evaluateTask("TASK-001", { tasksDir }).runnable, true);
  });
});

test("unfinished and missing dependencies are reported", () => {
  withTasks(
    [
      { id: "TASK-001", status: "Blocked" },
      { id: "TASK-002", dependencies: ["TASK-001", "TASK-099"] },
    ],
    (tasksDir) => {
      const result = evaluateTask("TASK-002", { tasksDir });
      assert.equal(result.runnable, false);
      assert.deepEqual(result.reasons, ["TASK-001 is Blocked", "TASK-099 is missing"]);
    },
  );
});

test("design decisions and API contracts are left for interactive work", () => {
  withTasks(
    [
      { id: "TASK-001", category: "設計判断" },
      { id: "TASK-002", category: "API契約" },
      { id: "TASK-003", category: "セキュリティ・プライバシー" },
      { id: "TASK-004", category: "テスト・検証" },
    ],
    (tasksDir) => {
      assert.equal(evaluateTask("TASK-001", { tasksDir }).runnable, false);
      assert.equal(evaluateTask("TASK-002", { tasksDir }).runnable, false);
      assert.equal(evaluateTask("TASK-003", { tasksDir }).runnable, true);
      assert.equal(evaluateTask("TASK-004", { tasksDir }).runnable, true);
    },
  );
});

test("Done tasks are not run again", () => {
  withTasks([{ id: "TASK-001", status: "Done" }], (tasksDir) => {
    assert.deepEqual(evaluateTask("TASK-001", { tasksDir }).reasons, ["TASK-001 is already Done"]);
  });
});

test("invalid and unknown IDs are rejected", () => {
  withTasks([], (tasksDir) => {
    assert.equal(evaluateTask("task-1", { tasksDir }).runnable, false);
    assert.equal(evaluateTask(undefined, { tasksDir }).runnable, false);
    assert.deepEqual(evaluateTask("TASK-042", { tasksDir }).reasons, ["TASK-042 does not exist in docs/tasks"]);
  });
});
