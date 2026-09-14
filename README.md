This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Use Node.js 22 and pnpm 11.16.0 (specified in `package.json`). Install dependencies with `pnpm install --frozen-lockfile`.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## CI

GitHub Actions runs four independent jobs on pull requests, pushes to `main`, and manual dispatch:

| Status check | Local command | Purpose |
| --- | --- | --- |
| Check | `pnpm check` | ESLint |
| TypeScript | `pnpm type-check` | Generate Next.js route types, then run TypeScript |
| Tests | `pnpm test` | Run Vitest once (jsdom; no browser installation needed) |
| Build | `pnpm build` | Compile the production app and prerender pages |

Build needs network access to download the Google Fonts used by `next/font`.

The shared `.github/actions/install-node-deps` action reads Node.js and pnpm versions from `package.json`, caches the pnpm store, and installs with `--frozen-lockfile`. Each job has a timeout, and newer runs cancel older runs on the same PR or branch. The workflow uses read-only repository permissions and requires no secrets.

External actions are pinned to commit SHAs. Dependabot checks for GitHub Actions updates weekly, including the shared composite action. It also checks npm/pnpm dependencies every Monday (Asia/Tokyo), with at most five open version-update PRs. Next.js and its ESLint config are grouped together, as are React and its types. Other minor/patch updates are grouped; other major updates stay separate. Updates are reviewed and merged manually.

After pushing these files and running CI once, configure the `main` branch protection/ruleset to require **Check**, **TypeScript**, **Tests**, and **Build**. Committing the workflow alone does not make these checks mandatory for merging. Dependabot becomes active once its configuration is on the default branch.

## Local Git hooks

`pnpm install --frozen-lockfile` installs Lefthook's Git hooks automatically. Run `pnpm exec lefthook install` to reinstall them in an existing checkout.

- Before commit: ESLint checks staged JavaScript/TypeScript file paths without automatically changing or staging files.
- Before push: type-check and tests run in parallel.
- Production builds run in CI to keep local pushes fast. CI remains the final check even when local hooks are skipped.

The shared CI install action sets `LEFTHOOK=0` to avoid installing local hooks on runners.

## Local AI review

Copy `.env.local.example` to `.env.local` and set `OPENAI_API_KEY`. `.env.local` is ignored by Git. Run `pnpm ai:review` whenever you want a review.

The command compares the working tree with `main`, so it includes committed, staged, and unstaged changes but not untracked files. Set `AI_REVIEW_BASE` in `.env.local` when another comparison base is needed. It sends that textual diff to OpenAI using `gpt-5.4-mini-2026-03-17`, then writes the review to the terminal; it neither creates a PR comment nor needs a GitHub token. It does not execute application code, install dependencies, or give the model tools. Images and binary contents cannot be reviewed through this textual diff.

Review is advisory. Each run makes at most one OpenAI request, with low reasoning effort, at most 4,096 output tokens (including reasoning), and `store: false`. Diffs larger than 60,000 UTF-8 bytes are rejected before sending; split the work to review it. No automatic retries are made. At the [published GPT-5.4 mini prices](https://developers.openai.com/api/docs/models/gpt-5.4-mini), 10,000 input tokens plus 2,000 output tokens cost approximately $0.0165 per run ($1.65 per 100 runs). This is an example, not a fixed fee or monthly cap; actual usage and prices vary.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
