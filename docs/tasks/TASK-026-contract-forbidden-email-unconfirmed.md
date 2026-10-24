# TASK-026: Dotの操作の`403`から、返らない`email_unconfirmed`を外す

| 項目 | 内容 |
| --- | --- |
| ID | TASK-026 |
| タスク名 | Dotの操作の`403`から、返らない`email_unconfirmed`を外す |
| 対象領域 | 共通 |
| 作業区分 | API契約 |
| 優先度 | P1 |
| 状態 | Todo |

## 目的と作業範囲

探索的な監査（`spec`観点、2026-10-08）から起こしたタスク。報告のIDは`AUD-20261008-01`。

契約（`contracts/openapi.yaml`の`components/responses/Forbidden`）は、Dotの操作（listDays・getToday・getDay・updateDot）の
`403`に`email_unconfirmed`を挙げている。一方APIは、メール未確認の利用者をsessionの復元時にWardenが外して
`401 unauthenticated`を返し（`apps/api/app/controllers/concerns/authentication.rb`の`authenticate_user!`）、Dotの操作で
`email_unconfirmed`を返す経路はない（`apps/api/config/initializers/devise.rb`の`allow_unconfirmed_access_for = 0.days`）。
この差はTASK-006 Planに記録されているが、正本である契約と`contracts/README.md` §5に反映されていない。Webは契約に合わせて
到達しない分岐を持っている（`apps/web/src/features/history/components/history-status.tsx`）。

正本（契約・README）を実装に合わせ、Webの到達しない分岐とtestの扱いを揃える。login時の`email_unconfirmed`
（passwordが一致したときだけ返す）は変えない。

## 確認可能な完了条件

- [ ] Dotの操作の`403`の説明から`email_unconfirmed`が外れている（または「login時にだけ返す」と明記されている）。`csrf_invalid`は残っている。
- [ ] `contracts/README.md` §5の`email_unconfirmed`の行が、返る場面（login）を示している。
- [ ] メール未確認の利用者がDotの操作で`401 unauthenticated`になることを確かめるrequest specがある。
- [ ] Webの`email_unconfirmed`の分岐（`history-status.tsx`）とそのtestを、残すか外すかを決めて揃えている（`contracts/README.md` §3の互換性の規則に照らして、1回のreleaseで入れられるかを確かめる）。
- [ ] `pnpm check`（契約のlintと型の生成の確認を含む）が通る。

## 依存するタスクID

なし。

## 根拠となる仕様書と見出し

- [contracts/README.md](../../contracts/README.md) §3・§5
- [探索的な監査](../code-review/audit.md) §5
- [TASK-006 Plan](../implementation-plans/2026-10-02-task-006-backend-identity.md)の実装差異の表「`authenticate_user!`は`403 email_unconfirmed`を返さない（§5との差異）」

## 必要な検証

- request specで、メール未確認の利用者のDotの操作が`401 unauthenticated`になること。

## 関連Implementation Plan

着手時に追記する。
