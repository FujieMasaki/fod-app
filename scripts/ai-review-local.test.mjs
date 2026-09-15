import test from "node:test";
import assert from "node:assert/strict";
import { MAX_DIFF_BYTES, reviewLocal, workingTreeDiff } from "./ai-review-local.mjs";

const env = { OPENAI_API_KEY: "test-openai" };
function mock({ diff = "+const x = 1;", status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: "問題なし" }] }], usage: { input_tokens: 100, output_tokens: 50 } }), { status });
  };
  return { calls, diff, fetchImpl };
}

test("missing key or empty diff makes no request", async () => {
  const m = mock();
  await assert.rejects(reviewLocal({ env: {}, diff: m.diff, ...m }), /OPENAI_API_KEY/);
  await assert.rejects(reviewLocal({ env, ...m, diff: "" }), /No tracked changes/);
  assert.equal(m.calls.length, 0);
});

test("oversized diff is rejected before OpenAI is called", async () => {
  const m = mock({ diff: "x".repeat(MAX_DIFF_BYTES + 1) });
  await assert.rejects(reviewLocal({ env, ...m }), /exceeds/);
  assert.equal(m.calls.length, 0);
});

test("one bounded request returns the review text", async () => {
  const m = mock();
  const result = await reviewLocal({ env, ...m });
  assert.equal(result.text, "問題なし");
  assert.equal(m.calls.length, 1);
  const body = JSON.parse(m.calls[0].options.body);
  assert.equal(body.max_output_tokens, 4096);
  assert.equal(body.store, false);
  assert.equal(body.tools, undefined);
});

test("invalid base does not attempt a diff", () => {
  assert.throws(() => workingTreeDiff({ base: "missing", gitImpl: () => { throw new Error("bad ref"); } }), /does not resolve/);
});
