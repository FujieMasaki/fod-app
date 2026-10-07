import assert from "node:assert/strict";
import test from "node:test";
import { verifyGate } from "./ci-gate.mjs";

const successful = {
  changesResult: "success",
  webTarget: "true",
  apiTarget: "true",
  buildResult: "success",
  lintResult: "success",
  typesResult: "success",
  testsResult: "success",
  railsResult: "success",
};

test("passes when every required check succeeded", () => {
  assert.doesNotThrow(() => verifyGate(successful));
});

test("permits only the unrelated suite to be skipped", () => {
  assert.doesNotThrow(() => verifyGate({
    ...successful,
    webTarget: "false",
    buildResult: "skipped",
    lintResult: "skipped",
    typesResult: "skipped",
    testsResult: "skipped",
  }));
  assert.doesNotThrow(() => verifyGate({ ...successful, apiTarget: "false", railsResult: "skipped" }));
  assert.doesNotThrow(() => verifyGate({
    ...successful,
    webTarget: "false",
    apiTarget: "false",
    buildResult: "skipped",
    railsResult: "skipped",
  }));
});

test("fails when a required check fails or is skipped", () => {
  assert.throws(() => verifyGate({ ...successful, testsResult: "skipped" }), /Required Tests/);
  assert.throws(() => verifyGate({ ...successful, railsResult: "failure" }), /Required Rails/);
});

test("detection failure requires both suites", () => {
  assert.doesNotThrow(() => verifyGate({
    ...successful,
    changesResult: "failure",
    webTarget: "",
    apiTarget: "",
  }));
  assert.throws(() => verifyGate({
    ...successful,
    changesResult: "failure",
    webTarget: "",
    apiTarget: "",
    railsResult: "skipped",
  }), /Required Rails/);
});

test("invalid target output cannot produce a green gate", () => {
  assert.throws(() => verifyGate({ ...successful, webTarget: "" }), /Invalid CI target/);
});
