# TASK-003の委託先の確認をTASK-025へ切り出す

## 1. Status

完了（2026-10-08）。

## 2. Goal

TASK-003に残っていた委託先への9項目の確認（完了条件7）を、新しいTASK-025へ切り出す。これでTASK-003をDoneにし、確認と関係のない後続タスクが定期実行で進められるようにする。

## 3. Background

- 2026-10-08の定期実行のレポートで、TASK-003が後続9件を止めるボトルネックとして挙がった。
- TASK-003の完了条件1〜6（provider・実行方式・状態と再開点・冪等性・固有名詞の低減・文書への反映）は、2026-09-29に人間が採用を決めて満たしている。残っていたのは完了条件7の、委託先への9項目の確認だけだった。
- 9項目の確認は、AWSアカウントの設定と契約資料の確認で、人間が行う。時期は公開前でよく、実際に音声を外部へ送る変更（TASK-009）の前に要るのは項目1と項目3だけである（[TASK-003 Plan](2026-09-29-task-003-generation-design.md) §26「確認の担当と時期」）。
- それなのに、TASK-009・TASK-010・TASK-011・TASK-018・TASK-024がTASK-003に直接依存し、残りが間接に依存していた。そのため、委託先の確認と関係のない録音のUX（TASK-010）まで止まっていた。
- 前例として、TASK-002の完了条件1の一部を2026-09-29にTASK-003へ移管し、TASK-002をDoneにしている。

## 4. Current State

- TASK-003は In progress で、完了条件7だけが未完了だった。
- 9項目の確認先・確認方法・現状は[TASK-003 Plan](2026-09-29-task-003-generation-design.md) §26にある。
- TASK-009は、TranscribeのAI services opt-out policyを適用してから音声を送ることを、自分の作業範囲に前提として持っている。
- `docs/tasks`の最大のIDはTASK-024で、TASK-025はどのブランチでも使われていない（2026-10-08に確認）。

## 5. Scope and Non-goals

- 対象: TASK-025の新規作成、TASK-003の完了条件7の移管とDone化、TASK-009・TASK-015の依存の追加、9項目の担当を指している現行文書の参照の付け替え、`docs/tasks/README.md`の索引。
- 対象外: 9項目の確認そのもの（人間がTASK-025で行う）。
- 対象外: product.md §5「委託先の構成」の再検討の担当（TASK-003のまま）。委託先を変える判断は設計判断であり、再検討の条件を満たしたときに扱う。9項目の確認とは別の範囲なので、今回は動かさない。
- 対象外: 過去のPlan（TASK-005 Plan等）とTASK-005の着手時の記録にある「TASK-003の完了条件7」という記述。当時の記録なので書き換えない。

## 6. References and Documents to Update

- 参照: [docs/tasks/README.md](../tasks/README.md)の運用ルール、[TASK-003](../tasks/TASK-003-generation-design.md)、[TASK-003 Plan](2026-09-29-task-003-generation-design.md) §26、[product.md](../product.md) §5、[documentation.md](../code-review/documentation.md)
- 更新:
  - `docs/tasks/TASK-025-vendor-verification.md`（新規）
  - `docs/tasks/TASK-003-generation-design.md`（完了条件7を移管し、Doneにする）
  - `docs/tasks/TASK-015-privacy-security-verification.md`（依存にTASK-025を追加する）
  - `docs/tasks/TASK-009-backend-audio-generation.md`（依存にTASK-025を追加し、9項目の担当の参照を付け替える）
  - `docs/tasks/TASK-017-breach-response-design.md`（9項目の担当の参照を付け替える）
  - `docs/tasks/TASK-010-frontend-recording.md`（委託先の確認が出るまで案内の該当部分を確定させない）
  - `docs/tasks/README.md`（索引・要判断事項）
  - `docs/product.md` §5、`docs/privacy.md`、`docs/architecture.md`、`docs/journaling.md`（9項目の担当の参照）
  - `docs/implementation-plans/2026-09-29-task-003-generation-design.md` §26（担当がTASK-025へ移ったことの追記）

## 7. Proposed Approach

1. TASK-025を作り、完了条件7の9項目をそのまま移す。受け入れの判断、privacy.md §5-1への反映、TASK-010の案内への受け渡しも完了条件にする。優先度はP0にする。
2. TASK-003の完了条件7を、TASK-002の前例と同じ形で「TASK-025へ移管」として閉じ、状態をDoneにする。
3. 依存を付け替える。
   - TASK-015 → TASK-025を追加する（公開前の横断検証の前に、委託先の確認を済ませる）。TASK-016はTASK-015に依存するので、間接に待つ。
   - TASK-009 → TASK-025を追加する。これまではTASK-003がIn progressだったことが、opt-outの前に音声を送らない関門として働いていた。Doneにするとそれが外れるので、依存で機械的に止め直す。
4. 「完了条件7の9項目」「TASK-003 Plan §26」と書いて9項目の担当を指している現行文書を、TASK-025を指すように直す。記録先はTASK-003 Plan §26のままにする。

## 8. Why This Approach

- 設計判断と、委託先の確認は性質が違う。前者はTASK-003で終わり、後者は人間がAWSの設定と契約資料で行う独立した作業である。README.mdの「新たな独立範囲が必要になった場合だけ新IDを追加する」に当たる。
- タスクとして切り出すと、確認が残っていることが索引と定期実行のレポートから見え続ける。後続の依存を個別に外すだけでは、残っていることが見えにくくなる。
- 確認の記録先を移さないのは、項目別の表と出典がTASK-003 Plan §26にまとまっており、2か所に分けると食い違うため。

## 9. Data Flow

データフローの変更はない（文書とタスクの依存関係だけの変更）。

依存関係の変化:

```text
変更前: TASK-003(In progress) ← TASK-009, 010, 011, 018, 024 ← 013, 014, 015, 016
変更後: TASK-003(Done)        ← TASK-009, 010, 011, 018, 024 ← 013, 014, 015, 016
        TASK-025(In progress) ← TASK-009, TASK-015
```

## 10. Files to Change

§6の「更新」のとおり。合計13ファイルで、1つのPRにする。

## 11. Libraries / APIs

なし。

## 12. Alternatives Considered

- **TASK-003をDoneにせず、後続の依存からTASK-003を個別に外す**: 確認が残っていることがタスクの索引から見えなくなり、Doneの規則（全完了条件を満たす）とも食い違う。採らない。
- **TASK-009をTASK-025に依存させず、TASK-009の完了条件で止める**: 最初はこの案にした。TASK-009の実装（S3・Jobの作成など）まで9項目の確認を待たずに済み、並列で進められる。しかしレビューで、止める手段が文章だけになり、定期実行を動かすマシンにAWSの認証情報があることが分かった。opt-outの前に音声を送ると取り消せない。2026-10-08に人間が依存で止める案を選んだ。採らない。
- **依存させず、定期実行にAWSの認証情報を渡さない**: 並列のまま機械的にも止められるが、schedulerのscriptの変更が要る。人間は、TASK-025を優先して終わらせる方針とあわせて依存で止める案を選んだ。採らない。
- **TASK-025の作業区分をセキュリティ・プライバシーにする**: 定期実行が自動で着手してしまう。確認はAWSアカウントの設定と、未確認の項目を受け入れるかの判断を伴い、人間が行う。設計判断にする。

## 13. Risks / Things to Watch

- TASK-009とその後続（TASK-011・TASK-013・TASK-014）は、TASK-025が終わるまで止まる。TASK-025をP0にして優先して進める。
- TASK-010は、TASK-009とTASK-025より先に自動で着手される。録音前の案内（経路・保持・人によるレビュー）の材料はTASK-009の記録とTASK-025の確認から来るので、それまでは該当部分を確定させず、未確認の委託先の事実を書かないことをTASK-010の完了条件に書き足した。
- Bedrock側の学習利用と保持は、TASK-025の項目1・2で確認する。選んだmodel idごとの違いは、TASK-009の構成の確認（例示に学習・モデル改善への利用の有無を足した）で見る。
- 「完了条件7」という呼び方は過去のPlanに残る。現行文書ではTASK-025と書く。

## 14. Verification

### Manual

- `node scripts/task-status.mjs TASK-003`がDone、`TASK-010`が依存待ちでなくなること、`TASK-009`がTASK-025の依存待ちになること、`TASK-025`が実行不可（設計判断）であること。
- `node scripts/task-scheduler.mjs plan`で、着手予定と残りのタスクが意図どおりになること。
- 「完了条件7」「9項目」の現行文書での出現箇所を検索し、担当がTASK-025を指していること。

### Automated

- `pnpm lint:markdown`

## 15. Definition of Done

- TASK-003がDoneで、9項目の確認がTASK-025の完了条件として残っている。
- 現行文書の9項目の担当がTASK-025を指している。
- `pnpm lint:markdown`が通る。

## 16. Completion Record

- 状態: 2026-10-08 完了。
- 実装差異: レビューの指摘を受けて次を変えた。TASK-009は最初、依存させずに完了条件で止める形にしたが、2026-10-08に人間の判断でTASK-025への依存に変えた（§12）。あわせてTASK-025の優先度をP0にした。TASK-025の完了条件に、受け入れの判断、§26の「追加の確認対象」、TASK-010の案内への受け渡しを入れた。README.mdのMVPのタスクの範囲と実施順にTASK-025を入れた。TASK-010の完了条件に、委託先の確認が出るまで案内の該当部分を確定させないことを入れた。
- 検証結果:
  - `pnpm lint:markdown`: 通った。
  - `node scripts/task-status.mjs`: TASK-003はDone、TASK-010はrunnable、TASK-009はTASK-025の依存待ち、TASK-025は設計判断のため実行不可、TASK-015はTASK-025を含む依存待ち。
  - `node scripts/task-scheduler.mjs plan --root .`: 着手予定はTASK-010だけになり、後続を待たせているのはTASK-025（後続6件）になった。
  - 現行文書で「完了条件7」「9項目」を検索した。9項目の担当はTASK-025を指している。残るのは過去のPlan、TASK-005の着手時の記録、今回の経緯の文だけである。
- 関連: [TASK-025](../tasks/TASK-025-vendor-verification.md)、[TASK-003](../tasks/TASK-003-generation-design.md)
