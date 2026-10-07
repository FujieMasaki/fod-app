# Implementation Plan: TailwindのclassをJSXからCSS Modulesへ移す

## 1. Status

完了（実装と自動の検証まで。PRは未作成）

## 2. Goal

JSXの`className`に並んでいるTailwindのutilityを、コンポーネントごとのCSS Modules（`*.module.css`）へ移し、
JSXでは役割の名前（`styles.timeButton`など）だけを読めばよい状態にする。見た目は変えない。

## 3. Background

- TASK-007・TASK-012で認証と履歴の画面をTailwind CSS v4で組んだ結果、JSXに長いutilityの列や、条件で
  classをつなぐ`[...].join(" ")`が並び、構造と見た目が混ざって読みづらいという指摘があった（2026-10-07）。
- 方式は3案から人間が選んだ（2026-10-07）。CSS Modulesの中でTailwindの`@apply`を使う（A）。
  `--fod-*` tokenだけを割り当てたthemeを経由するため、token外の値を使えない今の仕組みは保てる。
- 対象は、Tailwindのutilityを書いているすべてのファイルとした（書き方が混ざらないようにするため）。

## 4. Current State

- `apps/web/src/styles/tailwind.css`: themeを`--fod-*`だけにし、utilitiesをlayerに入れずに読み込む。
- Tailwindのutilityを`className`に書いているファイル: `features/auth/components/`の9ファイル、
  `features/history/components/`の4ファイル、`router.tsx`。
- それ以外の画面（home・recording・components/など）は、`var(--fod-*)`を直接書くCSS Modules。
- `docs/design-system.md`は「新規UI・UI変更の標準はTailwind CSS v4、CSS Modulesは原則として新規採用しない」と定める。

## 5. Scope and Non-goals

- 対象: 上の14ファイルのstyleをCSS Modulesへ移すこと、`docs/design-system.md`の書き方の規約、
  `tailwind.css`の説明。
- 対象外: 見た目の変更。`var(--fod-*)`を直接書いている既存のCSS Modulesの書き換え（触る変更のときに見直す）。
  design-system componentの`Button`・`Text`などの中身。任意値（`p-[13px]`）をlintで止める仕組み。

## 6. References and Documents to Update

- 参照: `docs/design-system.md`、`docs/development/frontend.md`、`docs/development/pull-requests.md`、
  `scripts/check-naming.mjs`（`.module.css`のclassはcamelCase）。
- 更新: `docs/design-system.md`「StylingとDesign Token」「既存実装との関係」、`apps/web/src/styles/tailwind.css`の冒頭の説明。

## 7. Proposed Approach

1. 各`*.tsx`の隣に同じ名前の`*.module.css`を置き、先頭で`@reference "@/styles/tailwind.css";`を書く。
   `@reference`はthemeとutilityの定義だけを読み、CSSを二重に出力しない。
2. 要素ごとに役割の名前のclass（camelCase）を作り、中身は元のutilityを`@apply`でそのまま移す。値は変えない。
3. 条件で変わるclassは次のどちらかで表す。
   - 状態がすでに属性にある場合は、Tailwindの`aria-*`のvariantで書く（時刻のボタンの`aria-pressed`）。JSXの
     `join(" ")`がなくなる。
   - それ以外は、基本のclassに状態のclassを足す（`HistoryError`の`inline`、`FormMessage`の`tone`、一覧の丸の選択中）。
4. `history-status.tsx`の`LINK_CLASS`は名前を変えずに、module.cssのclassを返す定数にする（呼び出し側を変えない）。
5. `docs/design-system.md`に、JSXの`className`へutilityを書かずCSS Modulesの`@apply`で書くこと、classは役割で
   名付けることを書く。

## 8. Why This Approach

- JSXが構造（要素・aria・データ）だけになり、見た目は名前を通して追える。
- `@apply`できる名前付きのutilityはthemeにある`--fod-*`由来のものだけなので、JSXに書いていたときと同じく、
  token外の名前付きの値は使えない。任意値（`p-[13px]`）と生の宣言は、今と同じくレビューで止める。
  `var(--fod-*)`を直接書く方式（案B）では、名前付きのutilityによる制約もなくなる。
- 既存の画面と同じ「コンポーネントの隣にCSS Modules」の配置になり、ファイルの探し方が揃う。

## 9. Data Flow

データフローの変更はない（見た目の書き場所だけを移す）。

## 10. Files to Change

レビュー対象は重複を除いて合計31ファイルで20を超えるため、統合ブランチ`refactor/style-css-modules-integration`と`main`へのメインのPRを作り、
サブのPRを2つに分ける。

1. `refactor/style-css-modules-1`（13ファイル）: 規約と、履歴の画面・Home
   - 新規: このPlan
   - 変更: `docs/design-system.md`、`apps/web/src/styles/tailwind.css`
   - 変更＋新規`*.module.css`: `features/history/components/`の`history-status`・`day-screen`・`day-list-screen`・
     `day-detail-screen`、`router.tsx`（`router.module.css`）
2. `refactor/style-css-modules-2`（20ファイル、1の上に積む）: 認証の画面
   - 変更＋新規`*.module.css`: `features/auth/components/`の`auth-layout`・`sign-in-screen`・`sign-up-screen`・
     `account-screen`・`confirmation-screen`・`password-forgot-screen`・`password-reset-screen`・`require-auth`・
     `sign-in-prompt`
   - 変更: このPlan（Completion Record）、`docs/design-system.md`（移行済みの範囲に認証の画面を足す）

## 11. Libraries / APIs

- Tailwind CSS v4の`@reference`・`@apply`（既存の`@tailwindcss/vite`で処理される）。新しいdependencyはない。
  `@reference`は`@/`のaliasを解決できることをbuildで確かめた。

## 12. Alternatives Considered

- 案B（`var(--fod-*)`を直接書くCSS Modules）: 普通のCSSで読みやすいが、token外の値を止められず、TASK-007で
  決めたTailwindへの移行を戻すことになる。
- 案C（Tailwindのまま、classを名前付きの定数・小さなcomponentへ切り出す）: 文書は変えずに済むが、CSSファイルに
  分けたいという依頼に合わない。

## 13. Risks / Things to Watch

- `outline-2`などは`--tw-outline-style`の`@property`に頼る。JSXからutilityがなくなっても、`@apply`した分の
  `@property`が出力されることをbuild結果で確かめる。出なければ、フォーカスの輪郭線が消える。
- cascade: module.cssのclassはlayerに入らず詳細度（0,1,0）で比べられるため、`globals.css`の`*`・`a`のresetに
  勝つ（utilitiesと同じ条件）。同じ要素で基本のclassと状態のclassを重ねるときは、状態のclassをファイルの後ろに書く。
- testは`className`を見ていない（mockの`Link`が受け渡すだけ）。

## 14. Verification

### Manual

- ログイン・新規登録・パスワード再設定・アカウント、今日のDot・一覧・日の詳細で、余白・文字・色・下線・
  入力欄の枠と`aria-invalid`の赤枠、フォーカスの輪郭線（破線を含む）、時刻のボタンの押下、一覧の丸の選択中の輪郭が、
  変更前と同じに見えること。

### Automated

- `pnpm check`、`pnpm type-check`、`pnpm test`、`pnpm build`。
- buildしたCSSに、各module.cssのclassと`@property --tw-outline-style`があること。

## 15. Definition of Done

- 対象のJSXの`className`にTailwindのutilityが残っていない。
- 見た目が変わっていない。
- lint / type-check / test / buildが通る。
- `docs/design-system.md`が新しい書き方を説明している。

## 16. Completion Record

- 状態: 2026-10-07に実装と自動の検証が完了。画面の見た目の手動確認はPRの「確認すること」で行う。
- 実装差異: 認証の`ReloadNotice`の文言は、`FormMessage`の失敗と同じ見た目のため、別のclassを作らず
  `messageError`を使った。ほかはPlanどおり。
- 検証結果: `pnpm check`・`pnpm type-check`・`pnpm test`（395件）・`pnpm build`が通った。JSXの`className`に文字列の
  utilityが残っていないことをgrepで確かめた。buildしたCSSに`@property --tw-outline-style`・`--tw-border-style`が
  出力され、`timeButton`の`[aria-pressed=true]`・`input`の`[aria-invalid=true]`・`:focus-visible`の規則が元の
  utilityと同じ値で出ていることを確かめた。画面を開いての見た目の比較は未実施。
- 関連: `docs/design-system.md`「StylingとDesign Token」
