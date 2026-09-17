# Implementation Plan

## 1. Goal

現在root直下にあるVite + React + TypeScriptアプリを `apps/web/` へ移動し、
Frontendの挙動を変えずに、将来 `apps/api/` へRuby on Rails APIを追加できる
monorepoの土台を作る。

## 2. Background

- 現在はFrontendのソース、設定、依存関係がrepository rootに置かれている。
- 将来Backendを同じrepositoryで管理するため、Frontend固有の責務とrepository全体の
  実行・検査責務を分離する必要がある。
- rootの主要コマンド、ESLint、Lefthook、命名チェック、CIはrepository全体の入口として
  維持する。
- 今回は配置と実行環境だけを移行し、Router、State、API通信、UI、スタイル、Providerの
  構造や寿命は変更しない。

## 3. Current State

- `src/` にReactアプリ、TanStack Routerのroute定義、Session Provider、録音処理、
  Dot生成処理、UIとテストがある。
- `src/router.tsx` が `/`、`/record`、`/processing`、`/dot`、`/reflection` を定義する。
- `src/features/session/session-context.tsx` がReact stateと `fod.session.v1` の
  `localStorage` を管理する。
- `src/providers.tsx` がTanStack QueryとSession Providerを提供する。
- `src/features/processing/create-dot.ts` は `VITE_DOT_API_URL` がある場合に外部APIへ
  POSTし、ない場合はローカルmockを返す。
- rootの `package.json` がwebの依存関係とrepository全体の開発ツールをまとめて管理する。
- rootのVite、Vitest、TypeScript設定、および命名チェックとLefthookはroot直下の `src/`
  を前提にする。

## 4. Proposed Approach

1. `src/`、`public/`、`index.html`、Vite/Vitest/TypeScript設定とVitest setupを
   `apps/web/` へ移動する。
2. root `package.json` にはworkspace管理、Node/pnpm要件、既存コマンドの入口、ESLint、
   Lefthook、命名チェックに必要な依存関係を残す。
3. `apps/web/package.json` を追加し、React、Vite、TanStack、Zod、TypeScript、Vitestなど
   web固有の依存関係と内部コマンドを管理する。
4. `pnpm-workspace.yaml` のpackage対象を `apps/web` のみにし、既存のpnpm設定を維持する。
5. rootの主要コマンドからpnpm filterでweb packageを実行し、CI利用者の操作を維持する。
6. 命名チェック、Lefthook、ESLint ignore、`.gitignore`、Claudeの起動設定と文書参照を
   新しい配置に合わせる。
7. `apps/api/README.md` と `docs/architecture.md` を追加し、実装済み・決定済み・未決定を
   混同せず記録する。
8. install、静的検査、テスト、build、dev server、route直接アクセス、hook、生成先、ignoreを
   検証する。

## 5. Why This Approach

- Frontendの実装ファイルと実行設定を1つのworkspace packageへまとめることで、将来のRails
  追加時にNode packageとRailsアプリの責務を混在させずに済む。
- rootコマンド名とCIの入口を維持するため、利用者の開発手順を変えずに配置だけを移行できる。
- ESLint、Lefthook、命名チェックをroot管理のままにすることで、Git root基準のstaged pathと
  repository全体の設定・scriptsを継続して検査できる。
- Railsはpnpm workspaceへ含めず、空の実装構造も先に決めないため、参考プロジェクト確認前に
  Rails内部設計を固定しない。

## 6. Data Flow

今回、アプリケーションのデータフローは変更しない。

```text
User Action
↓
apps/web/src の既存Component
↓
既存Hook / Session Provider / TanStack Query
↓
既存Browser API / localStorage / optional external API
↓
既存State Update
↓
既存UI Update
```

変更するのは、rootコマンドからweb workspaceの開発・検査コマンドを呼び出す実行経路だけである。

## 7. Files to Change

- 移動: `src/` → `apps/web/src/` — Frontend実装とテスト。
- 移動: `public/` → `apps/web/public/` — Viteの静的asset。
- 移動: `index.html` → `apps/web/index.html` — Vite entry HTML。
- 移動: `vite.config.ts`、`vitest.config.ts`、`vitest.setup.ts`、`tsconfig.json` →
  `apps/web/` — webのbuild、test、型検査設定。
- 変更: root `package.json` — workspace全体の実行窓口とrepo全体ツールへ責務を限定する。
- 新規: `apps/web/package.json` — web固有の依存関係と内部scriptを管理する。
- 変更: `pnpm-workspace.yaml`、`pnpm-lock.yaml` — `apps/web` のみをNode workspaceにする。
- 変更: `scripts/check-naming.mjs`、`lefthook.yml` — `apps/web/src` をGit root基準で検査する。
- 変更: `eslint.config.mjs`、`.gitignore` — nested packageの生成物を除外する。
- 変更: `.claude/launch.json` — 移動後のViteを起動する。
- 新規: `apps/api/README.md` — 将来のRails配置場所と未実装状態を明示する。
- 新規: `docs/architecture.md` — 現在の実装、決定事項、未決定事項を分離して記録する。
- 変更: `README.md`、`docs/design-system.md`、`docs/code-review/frontend/*`、既存Implementation
  Plan — 移動で無効になるpath参照と構成説明を更新する。
- 確認: `AGENTS.md` — 移動で無効になるpath参照がない場合は変更しない。

## 8. Libraries / APIs

新しいlibraryや外部APIは追加しない。既存dependencyをrootとweb packageへ責務に応じて分ける。

- root: ESLint、TypeScript ESLint、globals、Lefthook。
- `apps/web`: React、Vite、TanStack Router/Query、Zod、Framer Motion、TypeScript、Vitest、
  Testing Library、jsdom。

## 9. Alternatives Considered

- root `package.json` 全体を `apps/web` へ移す: rootの既存コマンド、ESLint、Lefthook、命名
  チェックの入口が失われるため採用しない。
- Rails用packageをpnpm workspaceへ追加する: RailsはNode packageではなく、今回は未生成のため
  採用しない。
- Turborepoやshared packageを導入する: 現在はweb workspaceが1つだけであり、今回の配置移行に
  不要な設計判断を増やすため採用しない。

## 10. Risks / Things to Watch

- rootから実行するコマンドが、web packageのworking directoryとdependencyを正しく参照すること。
- ESLint、命名チェック、Lefthookがroot基準のpathを扱い、移動後のソースを検査できること。
- ViteのSPA fallbackにより、既存routeへの直接アクセスが移動後も動作すること。
- `dist`、`coverage`、`node_modules` が `apps/web` 配下に生成され、Gitに含まれないこと。
- lockfileのdependency versionを意図せず更新しないこと。
- `.worktrees/` と既存の無関係な生成物には触れないこと。

## 11. Verification

### Manual

- rootで `pnpm dev` を起動し、既存の全routeへ遷移できることを確認する。
- `/`、`/record`、`/processing`、`/dot`、`/reflection` へ直接アクセスしてSPAが返ることを確認する。
- Lefthookのpre-commit commandがGit root基準の `apps/web/src/...` staged pathを扱えることを確認する。
- build、coverage、dependencyの生成先と `.gitignore` の判定を確認する。

### Automated

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`
- 命名チェッカー自身のNode test
- Lefthook pre-commit実行

## 12. Definition of Done

- Viteアプリとweb固有設定・依存関係が `apps/web/` にある。
- rootの主要コマンド名とCIの入口が維持され、すべて成功する。
- pnpm workspace対象が `apps/web` のみである。
- Frontendのroute、State、storage key、API通信、UI、style、Provider構造が変わっていない。
- `apps/api/README.md` と `docs/architecture.md` が実装済み・決定済み・未決定を正確に示す。
- 生成物が正しい場所に出力され、Gitにignoreされる。
- diffに不要な変更や `.worktrees/` の変更がない。
