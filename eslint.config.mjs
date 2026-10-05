import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...typescriptEslint.configs.recommended,
  globalIgnores([
    ".next/**",
    ".worktrees/**",
    ".claude/worktrees/**",
    "**/dist/**",
    "**/coverage/**",
    // contracts/openapi.yaml から生成する型（pnpm --filter @focus-on-dot/web generate:api-types）
    "apps/web/src/types/api-contract.d.ts",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // PascalCase is reserved for types and React components. Values and
      // parameters otherwise use camelCase; immutable, module-level values
      // may use UPPER_CASE for named constants.
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
          trailingUnderscore: "allow",
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
        },
        {
          selector: "parameter",
          // JSX component aliases must remain PascalCase so React treats them
          // as components (for example, `{ as: Tag }`).
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
      ],
    },
  },
  {
    // Webの関数は、Component・hook・補助関数も含めて const + arrow functionで書く（2026-10-05に決定、
    // docs/development/frontend.md）。混在させないためlintで固定する。
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "func-style": ["error", "expression"],
    },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.{js,mjs,ts}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
]);

export default eslintConfig;
