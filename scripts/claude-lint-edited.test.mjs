import assert from "node:assert/strict";
import test from "node:test";
import { lintCommandFor } from "./claude-lint-edited.mjs";

const root = "/repo";

test("lints JavaScript and TypeScript files with ESLint from the root", () => {
  assert.deepEqual(lintCommandFor(root, "/repo/apps/web/src/main.tsx"), {
    cwd: root,
    command: "pnpm",
    args: ["exec", "eslint", "--", "apps/web/src/main.tsx"],
  });
  assert.equal(lintCommandFor(root, "/repo/scripts/ci-gate.mjs").command, "pnpm");
});

test("lints Rails files with RuboCop inside apps/api", () => {
  assert.deepEqual(lintCommandFor(root, "/repo/apps/api/app/models/user.rb"), {
    cwd: "/repo/apps/api",
    command: "bundle",
    args: ["exec", "rubocop", "app/models/user.rb"],
  });
});

test("skips other files and files outside the repository", () => {
  assert.equal(lintCommandFor(root, "/repo/docs/tasks/README.md"), undefined);
  assert.equal(lintCommandFor(root, "/repo/apps/web/src/index.css"), undefined);
  assert.equal(lintCommandFor(root, "/elsewhere/main.ts"), undefined);
});
