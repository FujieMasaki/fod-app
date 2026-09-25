import assert from "node:assert/strict";
import test from "node:test";
import { denyReason } from "./claude-guard.mjs";

const denied = [
  "git commit --no-verify -m 'wip'",
  "git commit -n -m 'wip'",
  "git push --no-verify origin claude/task-008",
  "LEFTHOOK=0 git push",
  "git push --force origin claude/task-008",
  "git push -f",
  "git push -uf origin claude/task-008",
  "git push origin +claude/task-008",
  "git push origin main",
  "git push origin HEAD:main",
  "git push origin HEAD:refs/heads/main",
  "git -C apps/api push origin main",
  "pnpm test && git push origin main",
  "gh pr merge 42 --squash",
  'git commit -m "feat: x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"',
];

const allowed = [
  "git push --force-with-lease origin claude/task-008-dot-history",
  "git push -u origin claude/task-008-dot-history",
  "git push",
  "git commit -m 'docs: --no-verify を禁止する規約を追記'",
  'git commit -m "fix: main の表示を修正"',
  "git switch main",
  "git fetch origin main",
  "git pull --ff-only origin main",
  "gh pr create --title 'x' --body 'gh pr merge は人間が行う'",
  "gh pr view --json url",
  "pnpm test",
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
