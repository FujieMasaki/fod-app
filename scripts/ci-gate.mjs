import path from "node:path";
import { fileURLToPath } from "node:url";

export function verifyGate({ changesResult, webTarget, apiTarget, buildResult, lintResult, typesResult, testsResult, railsResult }) {
  if (changesResult !== "success") {
    webTarget = "true";
    apiTarget = "true";
  }

  if (!["true", "false"].includes(webTarget) || !["true", "false"].includes(apiTarget)) {
    throw new Error("Invalid CI target output");
  }

  if (webTarget === "true") {
    for (const [name, result] of Object.entries({
      Build: buildResult,
      Check: lintResult,
      TypeScript: typesResult,
      Tests: testsResult,
    })) {
      if (result !== "success") throw new Error(`Required ${name} check ended with: ${result}`);
    }
  }

  if (apiTarget === "true" && railsResult !== "success") {
    throw new Error(`Required Rails check ended with: ${railsResult}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  verifyGate({
    changesResult: process.env.CHANGES_RESULT,
    webTarget: process.env.WEB_TARGET,
    apiTarget: process.env.API_TARGET,
    buildResult: process.env.BUILD_RESULT,
    lintResult: process.env.LINT_RESULT,
    typesResult: process.env.TYPES_RESULT,
    testsResult: process.env.TESTS_RESULT,
    railsResult: process.env.RAILS_RESULT,
  });
  console.log("All required CI checks passed");
}
