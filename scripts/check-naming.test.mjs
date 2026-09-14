import assert from "node:assert/strict";
import test from "node:test";

import { findCssNamingErrors, isAllowedFileName, isAllowedPathSegment } from "./check-naming.mjs";

test("allows kebab-case source paths and Next.js structural names", () => {
  assert.equal(isAllowedPathSegment("recording-stage"), true);
  assert.equal(isAllowedPathSegment("(app)"), true);
  assert.equal(isAllowedPathSegment("[sessionId]"), true);
  assert.equal(isAllowedFileName("use-recorder.ts"), true);
  assert.equal(isAllowedFileName("page.tsx"), true);
  assert.equal(isAllowedFileName("recording-stage.module.css"), true);
});

test("rejects non-kebab-case paths", () => {
  assert.equal(isAllowedPathSegment("RecordingStage"), false);
  assert.equal(isAllowedFileName("recordingStage.tsx"), false);
});

test("checks CSS-module classes, keyframes, and custom properties", () => {
  assert.deepEqual(
    findCssNamingErrors(".stop-button {}\n@keyframes fade-in {}\n  --Bad_name: 0;", "button.module.css"),
    [
      "button.module.css: CSS class `.stop-button` must use camelCase.",
      "button.module.css: custom property `--Bad_name` must use lowercase kebab-case.",
      "button.module.css: keyframes `fade-in` must use camelCase.",
    ],
  );
});
