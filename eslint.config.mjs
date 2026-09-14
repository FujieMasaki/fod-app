import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...typescriptEslint.configs.recommended,
  globalIgnores([
    ".next/**",
    "dist/**",
    "coverage/**",
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
    files: ["scripts/**/*.mjs", "*.config.{js,mjs,ts}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
]);

export default eslintConfig;
