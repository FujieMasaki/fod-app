import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { denyReason, gitEnvFor, isMainCheckout, parseCommand, tokenize } from "./claude-guard.mjs";

const task = "feat/task-008-dot-history";

test("tokenize removes quoting and splits simple commands", () => {
  assert.deepEqual(tokenize(`LEFTHOOK="0" git push 'a b' "c\\"d" e\\ f && gh pr view # --force`), [
    ["LEFTHOOK=0", "git", "push", "a b", 'c"d', "e f"],
    ["gh", "pr", "view"],
  ]);
});

test("tokenize drops redirections and their targets", () => {
  assert.deepEqual(tokenize("git push origin HEAD:x 2>&1 | grep -v y >> /tmp/log"), [
    ["git", "push", "origin", "HEAD:x"],
    ["grep", "-v", "y"],
  ]);
  assert.deepEqual(tokenize("git commit -q -F - <<'EOF' >/dev/null"), [["git", "commit", "-q", "-F", "-"]]);
  assert.deepEqual(tokenize("node x.mjs &> out.txt"), [["node", "x.mjs"]]);
  // `2>&-` closes stderr and takes no target, so `-n` stays an argument.
  assert.deepEqual(tokenize("git commit 2>&- -n"), [["git", "commit", "-n"]]);
});

test("heredoc bodies are parsed apart from the outer command", () => {
  const { segments, incomplete } = parseCommand("cat <<'EOF'\nHere's a note.\nEOF\ngit push origin HEAD:x\n");
  assert.equal(incomplete, false);
  assert.deepEqual(segments[0], ["cat"]);
  assert.deepEqual(segments[1], ["git", "push", "origin", "HEAD:x"]);
});

test("unterminated quotes, heredocs, and substitutions are reported", () => {
  assert.equal(parseCommand('git commit -m "wip').incomplete, true);
  assert.equal(parseCommand("cat <<EOF\nno end").incomplete, true);
  assert.equal(parseCommand("echo $(git status").incomplete, true);
  assert.equal(parseCommand('echo "$(cat <<EOF\nno end\n)"').incomplete, true);
  assert.equal(parseCommand("git status").incomplete, false);
});

const denied = [
  // Lefthook bypass
  "git commit --no-verify -m 'wip'",
  "git commit -n -m 'wip'",
  "git commit -nm 'wip'",
  'git commit -nm"wip: hook check"',
  "git commit -anm'wip (1/2)'",
  "git commit -am wip --no-verify",
  'git commit 2>&- -n -m "wip: hook check"',
  "git commit -m x <&- -n",
  `git push --no-verify origin HEAD:${task}`,
  `git push "--no-verify" origin HEAD:${task}`,
  `LEFTHOOK=0 git push origin HEAD:${task}`,
  `LEFTHOOK="0" git push origin HEAD:${task}`,
  "LEFTHOOK=false git commit -m x",
  `env LEFTHOOK=0 git push origin HEAD:${task}`,
  `export LEFTHOOK=0 && git push origin HEAD:${task}`,
  `LEFTHOOK_EXCLUDE=tests git push origin HEAD:${task}`,
  "git merge --no-verify feature",
  // Force push
  `git push --force origin HEAD:${task}`,
  `git push "--force" origin HEAD:${task}`,
  `git push -f origin HEAD:${task}`,
  `git push -uf origin HEAD:${task}`,
  `git push -fu origin HEAD:${task}`,
  `git push -o ci.skip -f origin HEAD:${task}`,
  `git push origin +HEAD:${task}`,
  "git push --mirror origin",
  "git push --all origin",
  // Push to main
  "git push origin HEAD:main",
  'git push origin "HEAD:main"',
  "git push origin HEAD:refs/heads/main",
  "git push origin main:main",
  "git push origin :main",
  "pnpm test && git push origin HEAD:main",
  "git push origin HEAD:main 2>&1 | tail -5",
  "git push 2>/dev/null",
  "git push origin 'refs/heads/*:refs/heads/*'",
  "git push origin 'HEAD:refs/heads/ma*'",
  "git push origin '^refs/heads/feat/*' 'refs/heads/*:refs/heads/*'",
  // Commands hidden in heredocs, substitutions, and nested shells
  "cat <<'EOF'\nHere's a note.\nEOF\ngit push --dry-run origin HEAD:main",
  "sh <<'EOF'\ngit push origin HEAD:main\nEOF",
  "cat <<-EOF\n\tbody\n\tEOF\ngit commit -n -m x",
  'echo "$(git push origin HEAD:main)"',
  "echo `git push origin HEAD:main`",
  "sh -c 'git push origin HEAD:main'",
  'bash -lc "git commit -n -m x"',
  "eval git push origin HEAD:main",
  "command git push origin HEAD:main",
  "nohup git push origin HEAD:main",
  'command -- git commit -n -m "wrapper check"',
  "command -p git commit -n -m x",
  "exec -- git commit -n -m x",
  "exec -a name git commit -n -m x",
  "env -i git commit -n -m x",
  "env -u HOME -- git commit -n -m x",
  'git commit -m "$(cat <<\'EOF\'\nfix: handle \')\' in input\nEOF\n)" && git push origin HEAD:main',
  // Input the parser cannot close is not guessed at
  'git commit -m "wip',
  "git commit -F - <<'EOF'\nfix: no terminator",
  // Destination left to the current branch or push config
  "git push",
  "git push origin",
  "git push -u origin HEAD",
  "git push origin @",
  "git push origin main",
  `git push origin ${task}`,
  "git push origin HEAD:HEAD",
  "git push origin --delete main",
  "git switch main && git push origin HEAD",
  "git -C ../main-checkout push origin HEAD",
  // Merge and attribution
  "gh pr merge 42 --squash",
  "gh -R FujieMasaki/fod-app pr merge 42",
  'git commit -m "feat: x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"',
];

const allowed = [
  `git push -u origin HEAD:${task}`,
  `git push --force-with-lease origin HEAD:${task}`,
  `git push -o ci.skip origin HEAD:${task}`,
  `git push origin ${task}:${task}`,
  `git push origin HEAD:refs/heads/${task}`,
  `git push --dry-run origin HEAD:${task}`,
  `git push origin HEAD:${task} 2>&1 | grep -E "rror"`,
  `git push -u origin HEAD:${task} > /tmp/push.log`,
  "git commit -q -F - <<'EOF' >/dev/null\nfix: it's done\n\n- git push の手順を書く\nEOF",
  "git commit -F - <<-EOF\n\tdocs: indented\n\tEOF",
  `git push origin HEAD:${task} 2>&-`,
  "cat <<EOF | wc -l\nhello\nEOF",
  'echo "$(date)"',
  // Claude Code's usual commit form: a heredoc message inside a substitution
  'git commit -m "$(cat <<\'EOF\'\nfix: handle \')\' in input\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nfeat: add x (1/2)\n\n- it\'s done: ( and ) and \\" quotes\nEOF\n)"',
  'gh pr create --title "x" --body "$(cat <<\'EOF\'\n## 概要\n\n- (a) と b)\nEOF\n)"',
  "command -v git",
  "sh -c 'pnpm test'",
  "git commit -m 'docs: --no-verify を禁止する規約を追記'",
  "git commit -m 'LEFTHOOK=0 を禁止する'",
  'git commit -m "fix: main の表示を修正"',
  'git commit -m"-n"',
  "git commit -am'n と f を含むメッセージ'",
  "git commit -F /tmp/message-with--no-verify.txt",
  "git switch main",
  "git fetch origin main",
  "git pull --ff-only origin main",
  "git log main..HEAD",
  "gh pr create --title 'x' --body 'gh pr merge は人間が行う。git push origin main はしない'",
  "gh pr view --json url",
  "pnpm test",
  "echo 'git push --force'",
];

for (const command of denied) {
  test(`denies: ${command}`, () => {
    assert.ok(denyReason(command));
  });
}

for (const command of allowed) {
  test(`allows: ${command}`, () => {
    assert.equal(denyReason(command), undefined);
  });
}

// The main checkout is /repo; /repo/.claude/worktrees/task-009 is a linked worktree.
const mainCheckout = { cwd: "/repo", isMainCheckout: (dir) => dir === "/repo" };
const linkedWorktree = { ...mainCheckout, cwd: "/repo/.claude/worktrees/task-009" };

const deniedInMainCheckout = [
  "git switch feat/task-009-2-job-and-aws",
  "git switch -c feat/task-009-2-job-and-aws origin/main",
  "git switch --create=feat/task-009-2-job-and-aws",
  "git checkout feat/task-009-2-job-and-aws",
  "git checkout -b docs/task-025-vendor origin/main",
  "git checkout -t origin/feat/task-009-2-job-and-aws",
  "git checkout refs/heads/fix/task-026-forbidden",
  "git checkout feat/task-009-2-job-and-aws --",
  "git switch -c feat/task-009-7-x feat/task-009-2-job-and-aws",
  "git switch -cfeat/task-009-7-x origin/main",
  "git status --short && git switch feat/task-009-2-job-and-aws && git pull --ff-only -q",
  "cd .claude/worktrees/task-009 && cd /repo && git switch feat/task-009-2-job-and-aws",
  "git -C /repo switch feat/task-009-2-job-and-aws",
  "sh -c 'git switch feat/task-009-2-job-and-aws'",
  "gh pr checkout 103",
  "gh co 103",
];

const allowedInMainCheckout = [
  "git switch main",
  "git switch -c fix/guard-main-checkout-task-branch origin/main",
  "git checkout feat/task-009-2-job-and-aws -- docs/tasks/TASK-009.md",
  "git checkout -- apps/api/db/schema.rb",
  "git show feat/task-009-2-job-and-aws:docs/tasks/TASK-009.md",
  "git worktree add .claude/worktrees/task-009 feat/task-009-2-job-and-aws",
  "git log feat/task-009-2-job-and-aws",
  "cd .claude/worktrees/task-009 && git switch feat/task-009-2-job-and-aws",
  "git -C .claude/worktrees/task-009 switch feat/task-009-2-job-and-aws",
  "git switch -c fix/foo origin/feat/task-009-2-job-and-aws",
  "cd ~someone/repo && git switch feat/task-009-2-job-and-aws",
  "gh pr view 103",
  "git switch --detach origin/feat/task-009-2-job-and-aws",
  "git checkout --detach feat/task-009-2-job-and-aws",
];

for (const command of deniedInMainCheckout) {
  test(`denies in the main checkout: ${command}`, () => {
    assert.ok(denyReason(command, mainCheckout));
  });
}

for (const command of allowedInMainCheckout) {
  test(`allows in the main checkout: ${command}`, () => {
    assert.equal(denyReason(command, mainCheckout), undefined);
  });
}

test("switching branches is not checked without the hook's cwd", () => {
  assert.equal(denyReason("git switch feat/task-009-2-job-and-aws"), undefined);
});

test("a linked worktree may switch between task branches", () => {
  assert.equal(denyReason("git switch feat/task-009-3-cleanup", linkedWorktree), undefined);
  assert.equal(denyReason("gh pr checkout 103", linkedWorktree), undefined);
});

test("moving into the main checkout from a worktree is still denied", () => {
  assert.ok(denyReason("cd /repo && git switch feat/task-009-3-cleanup", linkedWorktree));
  assert.ok(denyReason("git -C /repo checkout feat/task-009-3-cleanup", linkedWorktree));
  assert.ok(denyReason("git -C ../../.. switch feat/task-009-3-cleanup", linkedWorktree));
});

test("cd ~ resolves to the home directory", () => {
  const home = { cwd: "/elsewhere", isMainCheckout: (dir) => dir === path.join(homedir(), "repo") };
  assert.ok(denyReason("cd ~/repo && git switch feat/task-009-2-job-and-aws", home));
});

test("isMainCheckout tells the main working tree from a linked worktree", () => {
  const saved = process.env.GIT_DIR;
  process.env.GIT_DIR = "/nonexistent/.git";
  const root = mkdtempSync(path.join(tmpdir(), "guard-"));
  try {
    const main = path.join(root, "main");
    // Under a git hook (pre-push runs these tests) GIT_DIR points at this
    // repository; without clearing it, these commands would write there.
    // The user's global config (signing, hooksPath) is left out too.
    const env = { ...gitEnvFor(), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
    const git = (...args) => assert.equal(spawnSync("git", args, { encoding: "utf8", env }).status, 0);
    git("init", "-q", main);
    git("-C", main, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "x");
    git("-C", main, "worktree", "add", "-q", path.join(main, ".claude", "worktrees", "task-001"));
    assert.equal(isMainCheckout(main), true);
    assert.equal(isMainCheckout(path.join(main, ".claude")), true);
    assert.equal(isMainCheckout(path.join(main, ".claude", "worktrees", "task-001")), false);
    assert.equal(isMainCheckout(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (saved === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = saved;
  }
});
