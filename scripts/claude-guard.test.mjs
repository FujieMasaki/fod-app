import assert from "node:assert/strict";
import test from "node:test";
import { denyReason, tokenize } from "./claude-guard.mjs";

// Branch checked out in each directory, standing in for `git branch --show-current`.
const branches = { "/repo": "claude/task-008-dot-history", "/main-checkout": "main" };
const check = (command, cwd = "/repo") => denyReason(command, { cwd, currentBranch: (dir) => branches[dir] });

test("tokenize removes quoting and splits simple commands", () => {
  assert.deepEqual(tokenize(`LEFTHOOK="0" git push 'a b' "c\\"d" e\\ f && gh pr view # --force`), [
    ["LEFTHOOK=0", "git", "push", "a b", 'c"d', "e f"],
    ["gh", "pr", "view"],
  ]);
});

const denied = [
  // Lefthook bypass
  ["git commit --no-verify -m 'wip'"],
  ["git commit -n -m 'wip'"],
  ["git commit -nm 'wip'"],
  ["git commit -am wip --no-verify"],
  ["git push --no-verify origin claude/task-008"],
  ['git push "--no-verify" origin claude/task-008'],
  ["LEFTHOOK=0 git push"],
  ['LEFTHOOK="0" git push origin claude/task-008'],
  ["LEFTHOOK=false git commit -m x"],
  ["env LEFTHOOK=0 git push"],
  ["export LEFTHOOK=0 && git push"],
  ["LEFTHOOK_EXCLUDE=tests git push"],
  ["git merge --no-verify feature"],
  // Force push
  ["git push --force origin claude/task-008"],
  ['git push "--force" origin claude/task-008'],
  ["git push -f"],
  ["git push -uf origin claude/task-008"],
  ["git push origin +claude/task-008"],
  ["git push --mirror origin"],
  ["git push --all origin"],
  // Push to main, explicit or implied by the current branch
  ["git push origin main"],
  ['git push origin "main"'],
  ["git push origin HEAD:main"],
  ['git push origin "HEAD:main"'],
  ["git push origin HEAD:refs/heads/main"],
  ["git push origin --delete main"],
  ["git push origin :main"],
  ["git push origin HEAD", "/main-checkout"],
  ["git push", "/main-checkout"],
  ["git push -u origin @", "/main-checkout"],
  ["git -C /main-checkout push origin HEAD"],
  ["cd /main-checkout && git push origin HEAD"],
  ["pnpm test && git push origin main"],
  // Merge and attribution
  ["gh pr merge 42 --squash"],
  ["gh -R FujieMasaki/fod-app pr merge 42"],
  ['git commit -m "feat: x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"'],
];

const allowed = [
  ["git push --force-with-lease origin claude/task-008-dot-history"],
  ["git push -u origin claude/task-008-dot-history"],
  ["git push -u origin HEAD"],
  ["git push"],
  ["git push --dry-run origin HEAD"],
  ["git commit -m 'docs: --no-verify を禁止する規約を追記'"],
  ["git commit -m 'LEFTHOOK=0 を禁止する'"],
  ['git commit -m "fix: main の表示を修正"'],
  ["git commit -am 'n と f を含む -nf 風のメッセージ'"],
  ["git switch main"],
  ["git fetch origin main"],
  ["git pull --ff-only origin main"],
  ["git log main..HEAD"],
  ["gh pr create --title 'x' --body 'gh pr merge は人間が行う。git push origin main はしない'"],
  ["gh pr view --json url"],
  ["pnpm test"],
  ["echo 'git push --force'"],
];

for (const [command, cwd] of denied) {
  test(`denies: ${command}${cwd ? ` (in ${cwd})` : ""}`, () => {
    assert.ok(check(command, cwd));
  });
}

for (const [command, cwd] of allowed) {
  test(`allows: ${command}${cwd ? ` (in ${cwd})` : ""}`, () => {
    assert.equal(check(command, cwd), undefined);
  });
}
