import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultTasksDir, evaluateTask, interactiveCategories } from "./task-status.mjs";

// Starts every task /run-task can take on, in parallel, from launchd every
// morning (see scripts/task-scheduler.sh). Tasks another session already holds
// are skipped; when nothing can start, it only notifies what is left and why.

export const DEFAULT_MAX_PARALLEL = 3;
// launchd will not start the next morning's run while this one is alive, so a
// stuck session must not hold the whole run.
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000;
// Staggered so concurrent sessions do not race on git's ref and index locks.
const LAUNCH_INTERVAL_MS = 30 * 1000;
const NOTIFICATION_LINES = 8;

const worktreeNamePattern = /^task-(\d{3})(?:-|$)/;
const branchTaskPattern = /(?:^|\/)task-(\d{3})(?:-|$)/;

export function parseMaxParallel(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : DEFAULT_MAX_PARALLEL;
}

export function listTaskIds(tasksDir = defaultTasksDir) {
  return readdirSync(tasksDir)
    .map((name) => name.match(/^(TASK-\d{3})-.*\.md$/)?.[1])
    .filter(Boolean)
    .sort();
}

// Reads `git worktree list --porcelain` into { path, branch } entries.
export function parseWorktrees(porcelain) {
  return porcelain
    .split("\n\n")
    .map((block) => ({
      path: block.match(/^worktree (.+)$/m)?.[1],
      branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null,
    }))
    .filter((worktree) => worktree.path);
}

// A task is held by another session while any worktree is named after it or
// is on its branch (wherever /run-task created it), or an open PR is on its
// branch. Remote branches are not used: they outlive merges.
export function findClaims({ worktrees = [], pullRequests = [] }) {
  const claims = new Map();
  for (const worktree of worktrees) {
    const number =
      path.basename(worktree.path).match(worktreeNamePattern)?.[1] ?? worktree.branch?.match(branchTaskPattern)?.[1];
    if (number) claims.set(`TASK-${number}`, `worktree ${path.basename(worktree.path)}`);
  }
  for (const pr of pullRequests) {
    const number = pr.headRefName.match(branchTaskPattern)?.[1];
    if (number) claims.set(`TASK-${number}`, `PR #${pr.number}`);
  }
  return claims;
}

// Number of unfinished tasks that wait on each task, directly or through others.
export function waitingCounts(tasks) {
  const unfinished = tasks.filter((task) => task.status !== "Done");
  const dependents = new Map(tasks.map((task) => [task.id, []]));
  for (const task of unfinished) {
    for (const dependencyId of task.dependencies) dependents.get(dependencyId)?.push(task.id);
  }

  const counts = new Map();
  for (const task of tasks) {
    const seen = new Set();
    const stack = [...dependents.get(task.id)];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...dependents.get(id));
    }
    counts.set(task.id, seen.size);
  }
  return counts;
}

function pendingDependencies(task, statusById) {
  return task.dependencies.filter((id) => statusById.get(id) !== "Done");
}

function describe(task, { claims, statusById, deferred }) {
  if (claims.has(task.id)) return `着手済み（${claims.get(task.id)}）`;
  if (deferred.has(task.id)) return "並列数の上限のため次回";

  const reasons = [];
  if (interactiveCategories.has(task.category)) reasons.push(`人間と対話で進める（${task.category}）`);
  const pending = pendingDependencies(task, statusById);
  if (pending.length) reasons.push(`依存待ち: ${pending.join(", ")}`);
  if (!reasons.length && task.status === "In progress") reasons.push("In progress（作業中または人間の確認待ち）");
  if (!reasons.length) reasons.push(...task.reasons);
  return reasons.join(" / ");
}

export function planRun(tasks, claims, maxParallel = DEFAULT_MAX_PARALLEL) {
  const counts = waitingCounts(tasks);
  const statusById = new Map(tasks.map((task) => [task.id, task.status]));
  const byWaiting = (a, b) => counts.get(b.id) - counts.get(a.id) || a.id.localeCompare(b.id);

  // In progress on main means a session is on it or it waits for a human check.
  const startable = tasks
    .filter((task) => task.runnable && task.status !== "In progress" && !claims.has(task.id))
    .sort(byWaiting);
  const start = startable.slice(0, maxParallel);
  const deferred = new Set(startable.slice(maxParallel).map((task) => task.id));
  const startIds = new Set(start.map((task) => task.id));

  const remaining = tasks
    .filter((task) => task.status !== "Done" && !startIds.has(task.id))
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      waiting: counts.get(task.id),
      reason: describe(task, { claims, statusById, deferred }),
    }));

  // What to finish first: unfinished, not waiting on anything, and holding others up.
  const bottlenecks = tasks
    .filter(
      (task) =>
        task.status !== "Done" &&
        !startIds.has(task.id) &&
        counts.get(task.id) > 0 &&
        pendingDependencies(task, statusById).length === 0,
    )
    .sort(byWaiting)
    .map((task) => ({ id: task.id, title: task.title, category: task.category, waiting: counts.get(task.id) }));

  return { start: start.map((task) => ({ id: task.id, title: task.title })), remaining, bottlenecks };
}

function bottleneckLine(bottleneck) {
  return `${bottleneck.id}（${bottleneck.category}）: ${bottleneck.title} — 後続${bottleneck.waiting}件が待機中`;
}

export function resultLine(result) {
  if (result.pr) return `${result.id}: PR #${result.pr.number} ${result.pr.url}`;
  return `${result.id}: PRなし（${result.detail}）`;
}

export function notificationText(plan, results = []) {
  const lines = [];
  if (results.length) {
    lines.push(`${results.length}件を進めました`, ...results.map(resultLine));
  } else {
    lines.push("着手できるタスクはありません。残っているタスクはこちらです");
    if (plan.bottlenecks[0]) lines.push(`先に進める: ${plan.bottlenecks[0].id}（${plan.bottlenecks[0].category}）`);
    lines.push(...plan.remaining.map((task) => `${task.id} ${task.status}: ${task.reason}`));
  }
  const shown = lines.slice(0, NOTIFICATION_LINES);
  if (lines.length > shown.length) shown.push(`ほか${lines.length - shown.length}行はレポートを参照`);
  return shown.join("\n");
}

export function formatReport(plan, results = [], { date } = {}) {
  const sections = [`# タスクの定期実行 ${date ?? ""}`.trimEnd()];

  sections.push(
    "## 今回進めたタスク",
    results.length ? results.map((result) => `- ${resultLine(result)}`).join("\n") : "なし。",
  );

  if (plan.bottlenecks.length) {
    sections.push(
      "## 先に進めると後続が動くタスク",
      plan.bottlenecks.map((bottleneck) => `- ${bottleneckLine(bottleneck)}`).join("\n"),
    );
  }

  sections.push(
    "## 残っているタスク",
    plan.remaining.length
      ? [
          "| ID | 状態 | 理由 | タスク名 |",
          "| --- | --- | --- | --- |",
          ...plan.remaining.map((task) => `| ${task.id} | ${task.status} | ${task.reason} | ${task.title} |`),
        ].join("\n")
      : "なし。",
  );

  return `${sections.join("\n\n")}\n`;
}

function command(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...options });
  return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? result.error?.message ?? "" };
}

function openPullRequests(root) {
  const result = command("gh", ["pr", "list", "--state", "open", "--limit", "200", "--json", "number,url,headRefName"], {
    cwd: root,
  });
  if (!result.ok) throw new Error(`gh pr list failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

function listWorktrees(root) {
  const result = command("git", ["-C", root, "worktree", "list", "--porcelain"]);
  if (!result.ok) throw new Error(`git worktree list failed: ${result.stderr.trim()}`);
  return parseWorktrees(result.stdout);
}

function notify(message, title = "Focus on Dot タスク") {
  // argv keeps quotes and newlines in the message out of the AppleScript source.
  command("osascript", [
    "-e",
    "on run argv",
    "-e",
    "display notification (item 1 of argv) with title (item 2 of argv)",
    "-e",
    "end run",
    message,
    title,
  ]);
}

function timestamp(now) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The last line of the session's final message, from `claude --output-format json`.
export function sessionSummary(output) {
  try {
    const line = String(JSON.parse(output).result ?? "").trim().split("\n").at(-1);
    return line ? line.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

function runTask(task, { root, logDir }) {
  const worktree = path.join(root, ".claude", "worktrees", `task-${task.id.slice(5)}`);
  // Fails when the path exists, so a session that got here first keeps the task.
  const added = command("git", ["-C", root, "worktree", "add", "--detach", worktree, "origin/main"]);
  if (!added.ok) return Promise.resolve({ id: task.id, detail: `worktreeを作れません: ${added.stderr.trim()}` });

  const outPath = path.join(logDir, `${task.id}.json`);
  const errPath = path.join(logDir, `${task.id}.log`);
  const out = openSync(outPath, "w");
  const err = openSync(errPath, "w");
  const child = spawn(
    "claude",
    ["-p", `/run-task ${task.id}`, "--permission-mode", "auto", "--output-format", "json", "--name", `run-task ${task.id}`],
    {
      cwd: worktree,
      // Each session gets its own RSpec database (see apps/api/config/database.yml).
      env: { ...process.env, TEST_ENV_NUMBER: `_${task.id.toLowerCase().replace("-", "_")}` },
      stdio: ["ignore", out, err],
    },
  );

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, SESSION_TIMEOUT_MS);

  return new Promise((resolve) => {
    child.on("close", (code) => {
      clearTimeout(timer);
      closeSync(out);
      closeSync(err);
      const detail = timedOut
        ? `${SESSION_TIMEOUT_MS / 3600000}時間で打ち切り。${errPath}を参照`
        : (sessionSummary(readFileSync(outPath, "utf8")) ?? `claudeが終了コード${code}で終了。${errPath}を参照`);
      resolve({ id: task.id, detail });
    });
    child.on("error", (error) => resolve({ id: task.id, detail: `claudeを起動できません: ${error.message}` }));
  });
}

export async function run({ root, dryRun = false, maxParallel = DEFAULT_MAX_PARALLEL, now = new Date() }) {
  const tasks = listTaskIds().map((id) => evaluateTask(id));
  const claims = findClaims({ worktrees: listWorktrees(root), pullRequests: openPullRequests(root) });
  const plan = planRun(tasks, claims, maxParallel);

  if (dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    console.log(`\n--- notification ---\n${notificationText(plan)}`);
    return;
  }

  const logDir = path.join(homedir(), "Library", "Logs", "focus-on-dot", timestamp(now));
  mkdirSync(logDir, { recursive: true });

  const sessions = [];
  for (const [index, task] of plan.start.entries()) {
    if (index > 0) await sleep(LAUNCH_INTERVAL_MS);
    sessions.push(runTask(task, { root, logDir }));
  }
  const finished = await Promise.all(sessions);

  // The report must still be written when GitHub is unreachable after the sessions.
  let pullRequests = [];
  try {
    if (finished.length) pullRequests = openPullRequests(root);
  } catch (error) {
    console.error(error);
  }
  const results = finished.map((result) => ({
    ...result,
    pr: pullRequests.find((pr) => pr.headRefName.match(branchTaskPattern)?.[1] === result.id.slice(5)),
  }));

  const reportPath = path.join(logDir, "report.md");
  writeFileSync(reportPath, formatReport(plan, results, { date: timestamp(now) }));
  notify(notificationText(plan, results));
  console.log(`report: ${reportPath}`);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [mode, ...args] = process.argv.slice(2);
  const root = option(args, "--root");
  if (!["run", "plan"].includes(mode) || !root) {
    console.error("Usage: node scripts/task-scheduler.mjs <run|plan> --root <repository root>");
    process.exit(64);
  }
  const maxParallel = parseMaxParallel(process.env.FOD_TASK_MAX_PARALLEL ?? DEFAULT_MAX_PARALLEL);
  run({ root: path.resolve(root), dryRun: mode === "plan", maxParallel }).catch((error) => {
    console.error(error);
    notify(`定期実行に失敗しました: ${error.message}`);
    process.exitCode = 1;
  });
}
