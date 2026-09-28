# Privacy Specification Placement Plan

## 1. Status

完了（2026-09-28）。文書変更のみ。実装・provider選定・保持期間の決定は含まない。

## 2. Goal / Background

音声日記の固有名詞、外部AIへの送信、保存後の注意と削除について、実装前にAIと人間が同じ前提を
確認できるようにする。既存の`code-review/*/security.md`は差分を検証する文書であり、
プロダクト横断のデータ取扱方針を置く正本にはしない。

## 3. Current State / Scope

現行アプリは音声を永続化・送信せず、Dot 1件を`localStorage`に保存する。公開MVPの音声経路、
文字起こし、AI provider、保存・削除は未決定。今回の変更は文書の配置と参照だけで、コード、
API、画面、外部設定を変更しない。

## 4. Approach and Rationale

`docs/privacy.md`にデータ最小化、固有名詞の扱い、外部送信前の境界、利用者への説明、残存確認を
仕様・制約として記す。確定していない実装方法はTASK-002/003等に紐づけて未決定と明示する。
README、AGENTS、journaling、関連タスクとsecurityレビュー指針から参照し、内容を重複させない。
録音機能だけでなくDot・認証・外部サービス・削除にまたがるため、`journaling.md`だけには置かない。

## 5. Data Flow / Files

文書が扱う検討上の流れは、録音前説明 → 音声取得 → 文字起こし（採用時）→ AI生成 → Dot保存 → 削除。
現在のアプリにこの実サービス経路が実装済みという意味ではない。
新規: `docs/privacy.md`。更新: `README.md`、`AGENTS.md`、`docs/journaling.md`、
`docs/tasks/TASK-002-data-lifecycle-design.md`、`docs/tasks/TASK-003-generation-design.md`、
`docs/code-review/frontend/security.md`、`docs/code-review/backend/security.md`。
レビュー指摘への対応で`docs/product.md`と`docs/tasks/README.md`も更新し、
既存の`docs/privacy.md`と`docs/journaling.md`の正本関係を明確にした。
再レビューで`docs/tasks/TASK-015-privacy-security-verification.md`と
`docs/tasks/TASK-016-mvp-acceptance.md`、2巡目で
`docs/tasks/TASK-010-frontend-recording.md`と`docs/development/backend.md`も更新した。
3巡目で`docs/tasks/TASK-017-breach-response-design.md`を新規作成し、`docs/tasks/README.md`、
`docs/product.md`、`docs/privacy.md`、`docs/code-review/frontend/security.md`を更新した。

## 6. Risks / Verification / Completion Record

- 氏名置換を完全な匿名化と書かず、外部文字起こしでは元音声が先に送られる点を明示した。
- 現行動作と将来の設計目標を区別し、未決定の音声保存・provider・検出UXを確定扱いしなかった。
- レビュー指摘4件を反映した。productの範囲・未決定事項、tasks索引の正本一覧、認証データの
  正本参照、journalingの録音前受け入れ条件とprivacyの設計制約を整合させた。
- 変更・新規11文書の相対リンクを確認し、欠落0件。`git diff --check`で空白問題なし。
  文書のみのためアプリのbuild/testは実行していない。

### 再レビューでの追加修正（2026-09-28）

- privacy.md §4のタスクを番号の昇順に戻し、§2-3から§2-5と重複する一文を削除した。
  §1の認証情報の記述をTASK-001 Plan §47の用語（Google識別子）に合わせた。
- TASK-016の「3仕様」はprivacy.md追加後は受け入れ確認の対象から同文書を外すため、
  「現行仕様」に改め、根拠となる仕様書にprivacy.mdを追加した。仕様文書が増えても
  数を数える表現にしない。
- privacy.md §4が残存検証を割り当てているTASK-015に、privacy.mdへの参照を追加した。
  TASK-009/011は実装タスクで`AGENTS.md`の必読表から到達できるため変更しない。TASK-010は
  下記の2巡目で更新した。
- TASK-002の根拠一覧でprivacy.mdがjournaling.mdの3項目の間に入っていたため、末尾へ移した。
- 変更・新規13文書の相対リンクを再確認し欠落0件、`git diff --check`通過。差分は`docs/`と
  リポジトリ直下の`AGENTS.md`・`README.md`のみで、`apps/`と設定ファイルに差分はない。

### 2巡目のレビュー指摘への対応（2026-09-28）

- journaling.md §4へ加えた実名・住所の言い換え案内が実装側へ届いていなかったため、
  TASK-010の完了条件へ反映し、根拠となる仕様書にprivacy.mdを追加した。録音前の案内を
  担当するのはTASK-010であり、受け入れ条件だけを更新しても実装時に落ちる。
- `code-review/backend/security.md`が認証のsession期限を未決定としていたが、architectureの
  「認証詳細（2026-09-25採用、未実装）」で7日の絶対期限とメールの期限・再送制限が採用済み。
  採用済み・未実装と未決定を書き分け、期限の実装確認が抜けないようにした。具体値は
  architectureを正本とし、レビュー観点側へ複製しない。同じ記述が
  `docs/development/backend.md`の「保留」にもあったため、あわせて書き分けた。
- 1巡目の記録にあった「差分はdocsのみ」を、`AGENTS.md`・`README.md`を含む実際の差分に合わせた。
- 変更・新規15文書で相対リンクの欠落0件、`git diff --check`通過。`apps/`と設定ファイルに差分なし。

### 3巡目: 保留していた2件への着手（2026-09-28）

人間の指示で、保留していた要配慮個人情報とレビュー観点の2件に着手した。判断そのものは行わず、
判断の置き場所と観点を用意するところまで。

- `docs/tasks/TASK-017-breach-response-design.md`を新規作成した。共通・設計判断・P0・Todo、依存なし。
  privacy.mdは「データを減らす」制約の正本として維持し、「該当したときに何が起きるか」と
  「公開してよいか」をTASK-017へ分けた。privacy.mdへ手順を混ぜていない。
  `node scripts/task-status.mjs TASK-017`で解析でき、設計判断のため自動実行対象外になることを確認した。
- privacy.md §1へ、本人の心身の状態に関する発話が入り得る前提を追加した。感情の記録すべてが
  要配慮個人情報に当たるとは書かず、該当性の判断はTASK-017へ渡した。§4にもTASK-017を追加。
- product.md「5. 保留事項と再検討条件」へ再検討条件付きの行を追加し、tasks/READMEの件数・索引・
  要判断事項・実施順を更新した。TASK-017は依存がないため番号順の位置とは別に扱うと明記した。
- `code-review/frontend/security.md` §2へ、保存・送信・削除・匿名化の画面文言が実際の挙動と
  一致するかのチェックを追加した。§6には`error-state.tsx`の既定文言が現行実装と一致しない実例と、
  文言だけを直さない条件を記録した。backend側は表示を扱わないため追加していない。

一次資料（2026-09-28に[個人情報保護委員会・漏えい等の対応](https://www.ppc.go.jp/personalinfo/legal/leakAction/)で確認）:

- 報告対象の類型は、要配慮個人情報を含む場合、不正利用により財産的被害が生じるおそれがある場合、
  不正目的による行為のおそれがある場合、本人数1,000人超の4つ。
- 期限は速報が発覚から3〜5日以内、確報が30日以内（不正目的による行為の場合は60日以内）。
- 要配慮個人情報として病歴・診療情報等が挙がっている。
- **本人通知の要否・時期・困難な場合の代替措置は、このページには記載がない。** 推知情報や
  本人が自ら述べた内容の扱いも同様。TASK-017で条文とガイドラインを確認する未確認事項とする。
  この段階の確認を、該当性や通知義務の結論として扱わない。

### PR #36のレビュー対応（2026-09-28）

- TASK-017が検知・通知の実装をTASK-013/015へ引き渡すと書いていたが、TASK-013は保持期限と削除の実装、
  TASK-015は本人限定アクセスと保持・削除の横断検証で、どちらも完了条件に漏えいの検知・本人通知を
  持たずTASK-017への依存もない。`docs/tasks/`全体でも監視・アラートを担当するタスクがない。
- 存在しない引き渡し先を書くと、方針だけ決まって実装・運用準備・検証が抜ける。作業範囲から
  固定的な割り当てを外し、割り当てを決めること自体を完了条件に加えた。担当がない範囲には
  新しいタスクを起こし、公開前の検証条件へ反映する範囲も決める。
- 保持期間と削除は判断がTASK-002、実装がTASK-013という実際の分担に書き直した。
