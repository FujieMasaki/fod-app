import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultTasksDir = path.join(repoRoot, "docs", "tasks");

// Design decisions and API contracts need a human to choose between options,
// so they are worked through interactively rather than by /run-task.
const interactiveCategories = new Set(["設計判断", "API契約"]);

const taskIdPattern = /^TASK-\d{3}$/;

function section(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

export function parseTask(markdown) {
  const fields = {};
  for (const line of markdown.split("\n")) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/);
    if (match && !(match[1] in fields)) fields[match[1]] = match[2];
  }

  const dependencies = section(markdown, "依存するタスクID")
    .map((line) => line.match(/^-\s*(TASK-\d{3})\b/)?.[1])
    .filter(Boolean);

  const acceptanceCriteria = section(markdown, "確認可能な完了条件")
    .map((line) => line.match(/^-\s*\[([ xX])\]\s*(.+)$/))
    .filter(Boolean)
    .map((match) => ({ done: match[1] !== " ", text: match[2].trim() }));

  return {
    id: fields.ID,
    title: fields["タスク名"],
    category: fields["作業区分"],
    status: fields["状態"],
    dependencies,
    acceptanceCriteria,
  };
}

export function findTaskFile(taskId, tasksDir = defaultTasksDir) {
  const fileName = readdirSync(tasksDir).find((name) => name.startsWith(`${taskId}-`) && name.endsWith(".md"));
  return fileName ? path.join(tasksDir, fileName) : undefined;
}

export function evaluateTask(taskId, { tasksDir = defaultTasksDir } = {}) {
  if (!taskIdPattern.test(taskId ?? "")) {
    return { id: taskId, runnable: false, reasons: [`Invalid task ID: ${taskId} (expected TASK-000)`] };
  }

  const filePath = findTaskFile(taskId, tasksDir);
  if (!filePath) return { id: taskId, runnable: false, reasons: [`${taskId} does not exist in docs/tasks`] };

  const task = parseTask(readFileSync(filePath, "utf8"));
  const reasons = [];

  if (interactiveCategories.has(task.category)) {
    reasons.push(`${taskId} is a ${task.category} task; work through it interactively`);
  }
  if (task.status === "Done") reasons.push(`${taskId} is already Done`);
  if (!["Todo", "In progress", "Blocked", "Done"].includes(task.status)) {
    reasons.push(`${taskId} has an unknown status: ${task.status}`);
  }

  for (const dependencyId of task.dependencies) {
    const dependencyPath = findTaskFile(dependencyId, tasksDir);
    const dependencyStatus = dependencyPath ? parseTask(readFileSync(dependencyPath, "utf8")).status : "missing";
    if (dependencyStatus !== "Done") reasons.push(`${dependencyId} is ${dependencyStatus}`);
  }

  return {
    ...task,
    file: path.relative(repoRoot, filePath),
    runnable: reasons.length === 0,
    // Blocked with every dependency Done is a candidate for unblocking; the
    // runner must still confirm the upstream decisions before starting.
    unblocking: reasons.length === 0 && task.status === "Blocked",
    reasons,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = evaluateTask(process.argv[2]);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.runnable ? 0 : 1;
}
