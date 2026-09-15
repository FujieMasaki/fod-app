# Focus on Dot

音声で今日を振り返る、クライアント中心のジャーナリングアプリです。フロントエンドは Vite + React + TanStack Router で構成しています。

## Getting Started

Use Node.js 22 and pnpm 11.16.0 (specified in `package.json`). Install dependencies with `pnpm install --frozen-lockfile`.

First, run the development server:

```bash
pnpm dev
```

Open the URL shown by Vite (normally [http://localhost:5173](http://localhost:5173)).

Routes are defined in `src/router.tsx`; browser-only state is managed by the session provider and React Query.

## API

The UI calls a standalone API at the `dot` path below `VITE_DOT_API_URL` when that variable is set. Configure it as an absolute API base URL, such as `https://api.example.com` or `https://api.example.com/api`; a trailing slash is accepted. Until the API is implemented, omit that variable to use the existing delayed mock response locally. This keeps API keys, audio uploads, and persistence outside the SPA boundary.

## CI

GitHub Actions runs four independent jobs on pull requests, pushes to `main`, and manual dispatch:

| Status check | Local command | Purpose |
| --- | --- | --- |
| Check | `pnpm check` | ESLint |
| TypeScript | `pnpm type-check` | Type-check the Vite application |
| Tests | `pnpm test` | Run Vitest once (jsdom; no browser installation needed) |
| Build | `pnpm build` | Compile the production SPA |

The production build does not download fonts. The browser loads the existing Zen font families from Google Fonts.

The shared `.github/actions/install-node-deps` action reads Node.js and pnpm versions from `package.json`, caches the pnpm store, and installs with `--frozen-lockfile`. Each job has a timeout, and newer runs cancel older runs on the same PR or branch. The workflow uses read-only repository permissions and requires no secrets.

External actions are pinned to commit SHAs. Dependabot checks for GitHub Actions updates weekly, including the shared composite action. It also checks npm/pnpm dependencies every Monday (Asia/Tokyo), with at most five open version-update PRs. React and its types are grouped; other minor/patch updates are grouped and other major updates stay separate. Updates are reviewed and merged manually.

After pushing these files and running CI once, configure the `main` branch protection/ruleset to require **Check**, **TypeScript**, **Tests**, and **Build**. Committing the workflow alone does not make these checks mandatory for merging. Dependabot becomes active once its configuration is on the default branch.

## Local Git hooks

`pnpm install --frozen-lockfile` installs Lefthook's Git hooks automatically. Run `pnpm exec lefthook install` to reinstall them in an existing checkout.

- Before commit: ESLint checks staged JavaScript/TypeScript file paths without automatically changing or staging files.
- Before push: type-check and tests run in parallel.
- Production builds run in CI to keep local pushes fast. CI remains the final check even when local hooks are skipped.

The shared CI install action sets `LEFTHOOK=0` to avoid installing local hooks on runners.
