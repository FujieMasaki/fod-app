import assert from "node:assert/strict";
import test from "node:test";
import { classifyPaths } from "./ci-changes.mjs";

test("web-only changes run only web checks", () => {
  assert.deepEqual(classifyPaths(["apps/web/src/main.tsx", "package.json", "scripts/check-naming.mjs"]), {
    web: true,
    api: false,
  });
});

test("API-only changes run only Rails", () => {
  assert.deepEqual(classifyPaths(["apps/api/app/models/application_record.rb"]), {
    web: false,
    api: true,
  });
});

test("mixed changes run both", () => {
  assert.deepEqual(classifyPaths(["apps/web/src/main.tsx", "apps/api/Gemfile"]), {
    web: true,
    api: true,
  });
});

test("documentation-only changes run neither application suite", () => {
  assert.deepEqual(classifyPaths(["README.md", "docs/architecture.md", ".github/pull_request_template.md"]), {
    web: false,
    api: false,
  });
});

test("shared or unknown paths run both", () => {
  for (const filePath of [".github/workflows/ci.yml", ".github/dependabot.yml", "scripts/new-script.mjs"]) {
    assert.deepEqual(classifyPaths([filePath]), { web: true, api: true });
  }
});

test("renames across applications run both when old and new paths are supplied", () => {
  assert.deepEqual(classifyPaths(["apps/web/old.ts", "apps/api/new.rb"]), {
    web: true,
    api: true,
  });
});

test("an empty or untrustworthy diff runs both", () => {
  assert.deepEqual(classifyPaths([]), { web: true, api: true });
});
