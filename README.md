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

GitHub Actions runs three independent jobs on pull requests, pushes to `main`, and manual dispatch:

| Status check | Local command | Purpose |
| --- | --- | --- |
| Check | `pnpm check` | ESLint |
| TypeScript | `pnpm type-check` | Generate Next.js route types, then run TypeScript |
| Tests | `pnpm test` | Run Vitest once (jsdom; no browser installation needed) |

The shared `.github/actions/install-node-deps` action reads Node.js and pnpm versions from `package.json`, caches the pnpm store, and installs with `--frozen-lockfile`. Each job has a timeout, and newer runs cancel older runs on the same PR or branch. The workflow uses read-only repository permissions and requires no secrets.

External actions are pinned to commit SHAs. Dependabot checks for GitHub Actions updates weekly, including the shared composite action.

After pushing these files and running CI once, configure the `main` branch protection/ruleset to require **Check**, **TypeScript**, and **Tests**. Committing the workflow alone does not make these checks mandatory for merging. Dependabot becomes active once its configuration is on the default branch.

This initial CI covers lint, types, and tests. Docker, AI review, and generated-file drift checks can be added when the project has corresponding requirements.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
