import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

// Webの書き方（docs/development/frontend.md §1）。
const webFunctionSyntax = [
  {
    // func-styleは`const f = function () {}`（関数式）を通すため、arrow functionに限る。classとobjectの
    // methodの形（`start() {}`）は関数式として表されるため除く。
    selector:
      "FunctionExpression:not(MethodDefinition > FunctionExpression):not(Property[method=true] > FunctionExpression)",
    message: "関数はarrow functionで書きます（docs/development/frontend.md §1）。",
  },
  {
    // const + arrow functionの関数も、function宣言のときと同じくcamelCase・PascalCaseにする
    // （naming-conventionのvariableはUPPER_CASEを許すため。typesによる判定は型情報が要る）
    selector: "VariableDeclarator[init.type='ArrowFunctionExpression'][id.name=/^[A-Z][A-Z0-9]*_[A-Z0-9_]*$/]",
    message: "関数名はcamelCaseかPascalCaseにします。",
  },
];
const webClassSyntax = [
  {
    selector: "ClassDeclaration, ClassExpression",
    message: "classは使わず、constの作成関数と型ガードで書きます（docs/development/frontend.md §1）。",
  },
];

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
      "no-restricted-syntax": ["error", ...webFunctionSyntax],
    },
  },
  {
    // Webの実装ではclassも使わない。testの差し替え（AudioContextなど、実装が`new`で作るもの）は、
    // constructorが要るため除く。flat configではruleの指定が置き換わるため、関数の指定も含める。
    files: ["apps/web/**/*.{ts,tsx}"],
    ignores: ["apps/web/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...webFunctionSyntax, ...webClassSyntax],
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
