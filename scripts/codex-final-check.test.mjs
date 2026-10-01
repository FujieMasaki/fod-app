import assert from "node:assert/strict";
import test from "node:test";
import { DISABLED_FEATURES, EXIT_TIMEOUT, TIMEOUT_MS, buildCodexArgs, validateArgs } from "./codex-final-check.mjs";

test("accepts a single origin base branch", () => {
  assert.deepEqual(validateArgs(["origin/main"]), { ok: true, base: "origin/main" });
  assert.deepEqual(validateArgs(["origin/release/1.2"]), { ok: true, base: "origin/release/1.2" });
});

test("rejects extra arguments so sandbox flags cannot be appended", () => {
  assert.equal(validateArgs(["origin/main", "--dangerously-bypass-approvals-and-sandbox"]).ok, false);
  assert.equal(validateArgs(["origin/main", "-s", "workspace-write"]).ok, false);
  assert.equal(validateArgs([]).ok, false);
});

test("rejects bases that are flags, local branches, or ranges", () => {
  for (const base of ["--add-dir=/", "main", "origin/main..HEAD", "origin/-x", "origin/main;ls", "origin/main\n"]) {
    assert.equal(validateArgs([base]).ok, false, base);
  }
});

test("always runs codex exec in the read-only sandbox", () => {
  const args = buildCodexArgs("origin/main", "/tmp/out.md");
  assert.deepEqual(args.slice(0, 3), ["exec", "--sandbox", "read-only"]);
  assert.ok(args.includes("--ignore-rules"), "execpolicy allow rules would run commands outside the sandbox");
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes("--ignore-user-config"), "user MCP servers and plugins run outside the sandbox");
  assert.ok(args.includes('web_search="disabled"'));
  for (const feature of ["apps", "browser_use", "computer_use", "hooks", "plugins"]) {
    assert.ok(DISABLED_FEATURES.includes(feature), feature);
    assert.equal(args[args.indexOf(feature) - 1], "--disable", feature);
  }
  assert.ok(args.at(-1).includes("origin/main...HEAD"));
  assert.ok(!args.some((arg) => arg.startsWith("--dangerously")));
});

test("a timeout has its own exit code so the caller can retry it once", () => {
  assert.ok(TIMEOUT_MS > 0);
  assert.ok(![0, 1, 2].includes(EXIT_TIMEOUT));
});
