import test from "node:test";
import assert from "node:assert/strict";
import { review, MAX_DIFF_BYTES } from "./ai-review.mjs";

const env = { PR_NUMBER: "2", GITHUB_REPOSITORY: "owner/repo", GH_TOKEN: "test-gh", OPENAI_API_KEY: "test-openai" };
function mock({ diff = "+const x = 1;", status = 200, stale = false } = {}) {
  const calls = [];
  let reads = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("api.openai.com")) return new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: "確認 <img> @user" }] }], usage: { input_tokens: 100, output_tokens: 50 } }), { status });
    if (options.method === "POST") return Response.json({ id: 1 });
    if (options.headers.Accept.endsWith(".diff")) return new Response(diff);
    reads++;
    return Response.json({ state: "open", head: { sha: stale && reads === 3 ? "new" : "old" }, base: { sha: "base" } });
  };
  return { calls, fetchImpl };
}

test("invalid input and missing secret make no requests", async () => {
  const m = mock();
  await assert.rejects(review({ env: { ...env, PR_NUMBER: "2; bad" }, ...m }), /positive integer/);
  await assert.rejects(review({ env: { ...env, OPENAI_API_KEY: "" }, ...m }), /secret/);
  assert.equal(m.calls.length, 0);
});
test("oversized diff is rejected before OpenAI is called", async () => {
  const m = mock({ diff: "x".repeat(MAX_DIFF_BYTES + 1) });
  await assert.rejects(review({ env, ...m }), /exceeds/);
  assert.ok(m.calls.every(({ url }) => !url.includes("openai")));
});
test("one bounded request posts escaped findings", async () => {
  const m = mock(); await review({ env, ...m });
  const ai = m.calls.filter(({ url }) => url.includes("openai"));
  assert.equal(ai.length, 1);
  const body = JSON.parse(ai[0].options.body);
  assert.equal(body.max_output_tokens, 4096); assert.equal(body.store, false); assert.equal(body.tools, undefined);
  assert.match(JSON.parse(m.calls.at(-1).options.body).body, /&lt;img&gt; ＠user/);
});
test("API error is not retried or posted", async () => {
  const m = mock({ status: 429 }); await assert.rejects(review({ env, ...m }), /HTTP 429/);
  assert.equal(m.calls.filter(({ url }) => url.includes("openai")).length, 1);
  assert.ok(m.calls.every(({ url }) => !url.endsWith("/comments")));
});
test("a changed PR does not receive stale findings", async () => {
  const m = mock({ stale: true }); await assert.rejects(review({ env, ...m }), /stale/);
  assert.ok(m.calls.every(({ url }) => !url.endsWith("/comments")));
});
