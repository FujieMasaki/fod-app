# Journaling Specification

この文書は、録音からDotの振り返りまでの機能仕様である。現在の実装、実サービスのMVPで満たすべき
振る舞い、未決定事項を区別する。MVP全体の範囲は[`product.md`](./product.md)、個人データの扱いは
[`privacy.md`](./privacy.md)、複数Dotの履歴体験は[`dot-history.md`](./dot-history.md)、Dot生成後の
任意の深掘り対話は[`dot-follow-up.md`](./dot-follow-up.md)を参照する。

## 1. 現在実装されているflow

```text
Homeで「タップして話す」
↓
/record で録音開始
↓
停止（録音時間をSession Providerへ保存）
↓
/processing で createDot を実行
↓
Zodで検証したDotSessionをSession ProviderとlocalStorageへ保存
↓
/dot と /reflection で現在の1件を表示
```

| 段階 | 成功時の現行挙動 | 失敗・中断・再試行の現行挙動 |
| --- | --- | --- |
| 録音開始 | Homeの操作後に録音画面がmountし、MediaDevices / MediaRecorderを試行する。利用可能ならマイク入力と波形を使う。 | 権限拒否・非対応時は`silent` modeへfallbackし、画面は継続する。明示的な拒否案内はない。unmount時は録音資源を解放する。 |
| 録音停止 | 停止時のdurationをSession Providerへ渡し、`/processing`へ遷移する。 | 二重停止はUIで抑止する。停止後に録音へ戻る導線、破棄確認、durationの再編集はない。 |
| Dot生成 | `VITE_DOT_API_URL`が未設定なら約2.5秒後にローカルmockを返す。設定時は`${VITE_DOT_API_URL}/dot`へ本文なしのPOSTを行う。responseはZodで検証する。 | HTTP失敗またはschema不正ならErrorStateと再試行を表示する。再試行は同じ処理を再実行し、冪等性keyはない。 |
| 保存と表示 | `DotSession`と録音時間を`fod.session.v1`へ保存・復元し、`/dot`と`/reflection`で表示する。 | localStorageの不正値は無視する。`reset`関数はあるが、現行UIに削除・リセット操作はない。 |

## 2. データと正本

**Dot**は、1回の録音から生まれる記録1件を指す。実サービスで利用者に見える内容は`date`、`duration`、
`sentence`（今日の一文）、`summary`（話した内容の要約）だけで、**音声も文字起こし全文も含まない。**
`dots`はこれに加えて`id`、所有者、作成・更新時刻、ゴミ箱の状態といった管理用の項目を持つ。
[`dot-history.md`](./dot-history.md) §1の「Dot = その日の自分」は同じものを一覧で丸として表す
表示上のコンセプトで、保存する項目の定義ではない。

4列目はTASK-002で採用した実サービスの方針である（2026-09-28採用、ゴミ箱と編集は2026-09-29に追加）。
**いずれも未実装**で、1〜3列目の現在の実装は実装タスクまで変わらない。
**保持期間と削除の契機は[`privacy.md`](./privacy.md) §5を正本とする。**この表は操作と受け渡しを
示すもので、期間が食い違った場合はprivacy.md §5が優先する。判断の経緯と比較は
[TASK-002 Plan](implementation-plans/2026-09-28-task-002-data-lifecycle.md)にある。

| データ | 現在の正本・保持場所 | 現在の削除・受け渡し | 実サービスの方針（2026-09-28採用、未実装） |
| --- | --- | --- | --- |
| マイクstream / AudioContext | 録音中のbrowser memory | stop / dispose時にtrackを停止しAudioContextを閉じる。外部送信・永続化しない。 | 変えない。録音中のmemoryだけに置く。権限説明・対応ブラウザ・中断UXはTASK-010 |
| 録音Blob | `MediaRecorder`内部で一時生成され得る | `stop`はBlobを生成し得るが、`useRecorder`はdurationだけを上位へ返す。Blobは後続へ渡さず、保存・送信しない。 | 同一originのRails経由で送る。**長期保存しない**が、処理が終わるまでS3東京へ一時的に預かる（非公開・暗号化・versioningを有効にしない）。**DotがRDSへ保存されるまで完了したら**即削除（文字起こしや生成が通った時点ではない）。失敗した場合は受理から24時間を再試行の期限とし、期限が来たらアプリが削除する（lifecycleは保険で、それ自体は24時間を保証しない）。Dot削除は対象の処理のもの、退会は本人の全部を削除。端末のstorageへは書かない。最長30分・32MB |
| 録音時間 | Session Providerと`fod.session.v1` | `reset`またはbrowser storageの削除で消える。UIの削除操作は未実装。 | Dotと同じrequestで送り、RDSの`dots`を正本にする。保持・削除もDotと同じ |
| Dot（id、date、duration、sentence、summary） | Session Providerと`fod.session.v1`に現在の1件（現行のDotSessionは`reflection`と`closing`を含む） | 新しい成功responseで上書きされる。`reset`はあるがUIから未実行。 | RDS東京の`dots`を正本にし、所有者をserverが決める。本人が削除するか退会するまで保持。`sentence`と`summary`は本人が編集でき、編集前の値は残さない。1件ごとの削除はゴミ箱（受理から7日で削除処理を始める）、即時の完全削除も備える。**`reflection`と`closing`は生成も保存もしない** |
| 文字起こし | 存在しない | 生成・保存・送信しない。 | 生成の入力として使い、**全文はRDSへ保存しない**。responseで端末へ返し、`sessionStorage`にタブを閉じるまで保持する。logout・User切替で消す |
| 話した内容の要約（`summary`） | 存在しない | — | 文字起こしから生成し、Dotと同じ行に保存する。Dotを削除すれば一緒に消える。要約にも実名は残り得るため、Dot本文と同じ保護・削除・説明の対象にする |
| API response | `createDot`の一時値をZod検証後にDotSessionへ | 未検証値は保存しない。 | Dotと文字起こしを返す。音声のURLは返さない。正式な契約はTASK-005 |

`localStorage`はbrowser上で利用者が読み書きできるため、認証・認可やserver側の正本には使わない。
実サービス化では既存の`fod.session.v1`の読み取りをやめ、起動時に削除する。localStorageへ新しい永続
keyを作らず、文字起こしの端末保持は`sessionStorage`（タブを閉じると消える）に限る。

## 3. モックと実サービスの区別

- `VITE_DOT_API_URL`未設定時の`sampleSession`は、画面遷移と表示を確認するための固定mockである。
  録音内容を生成しておらず、保存もしていない。
- 現在のRails APIには`GET /up`だけがあり、`POST /dot`、`/api/v1`のプロダクトendpoint、認証、
  Dot保存、AI処理は実装されていない。
- `VITE_DOT_API_URL`設定時の本文なしPOSTは暫定的な接続点であり、音声Blob、duration、利用者、
  正式なRails API契約を表すものではない。
- 現行ErrorStateの「音声は保存されています」という文言は実装と一致しない。音声Blobは保存されず、
  再試行時にも音声を再送できない。この差異を解消する変更では、表示文言と実際の保持・再試行仕様を
  同時に更新する。実サービスでは音声が残っている間は再試行できるようになるため、「保存されています」
  ではなく**serverが返す再試行の期限日時**を表示する。消える時刻は約束しない（§4、TASK-010/011）。

## 4. 実サービスのMVP受け入れ条件

最初の実サービス化では、次を満たす仕様と実装を同じ変更で確認する。

- 録音開始前に、音声を送るか、送る先、保存・削除の扱いと、他人の実名や住所は必要がなければ
  言い換えられることを利用者が確認できる。知らせる内容は
  [TASK-002 Plan §22](implementation-plans/2026-09-28-task-002-data-lifecycle.md)の7項目とし、
  認証確認の後、マイクを起動する前に置く。
- 録音の成功、権限拒否、停止、中断、送信失敗、生成失敗、保存失敗、再試行の各結果が、実際の
  データ状態と矛盾しない。音声を預かっている間（受理から24時間）は録り直さずに再試行でき、期限を
  過ぎれば録り直しになる。画面には**音声が残っている場合に限り、serverが返す期限日時**を示す。
  **消える時刻は約束しない**（「保存しています」とも「24時間で消えます」とも書かない）。
  障害時に削除が遅れ得ることは、録音前の案内に含める。
- 音声の再試行・Job実行・削除は、server側が持つ所有者の記録で認可する。処理IDやobject keyを
  知っていることを権限の根拠にしない。
- 保存されたDotは認証済み利用者本人だけが取得・更新・削除できる。
- 削除はDot 1件ごとの削除と退会の両方を備える。**1件ごとの削除はゴミ箱へ移す形とし、受理から7日で
  アプリが削除処理を始める。**ゴミ箱の中のDotはDay・一覧・詳細から取得できず、ゴミ箱の画面からだけ
  見えて復元できる。**ゴミ箱を経由しない「すぐに完全削除」も備える。**退会はゴミ箱を経由せず、
  ゴミ箱の中も含めて消す。
- 画面には「削除しました」ではなく「ゴミ箱に移動しました。7日後から削除処理を行います」と示す。
  **消え終わる時刻を約束しない。**「完全削除」が指すのはアプリが持つ分で、RDS自動backupと外部
  providerに残り得る分は含まない。その2つは別の説明として示す。
- **`sentence`と`summary`は本人が編集できる。アプリは編集前の値を残さない**（版も履歴も持たない）。
  消したかった実名が編集履歴に残るのでは直した意味がないため、戻せないことを編集前に伝える。
  `date`と`duration`は編集させない。ゴミ箱の中のDotは復元してから編集する。
- ただし**編集より前に取得したbackupには編集前の本文が残る。**「編集前の値はどこにも残らない」とは
  説明しない。障害復旧で復元したとき、**削除したDotと、編集で取り除いた内容を再び見える状態にしない。**
  実現方法はTASK-013/015で決める。
- Dotとして保存するのは`date`、`duration`、`sentence`（今日の一文）、`summary`（話した内容の要約）で、
  AIからの語りかけ（`reflection`・`closing`）は生成も保存もしない。`summary`は本人が読める場所に表示する。
- 認証はRails + Deviseのメール＋パスワード・確認メール・パスワード再設定と、OmniAuthのGoogle
  ログインを採用する。Rails CookieStore、HttpOnly/Secure/SameSite=LaxのCookie、同一origin、
  RailsのCSRFとcurrent_userの所有者scopeを使う。email一致の自動統合、MFA、passkey、手動復旧、
  メールOTPは採用しない。通常logoutでコピー済みCookieの即時失効を保証せず、DB sessionによる
  端末別失効・全端末logoutは将来要件とする。localStorageを本人性の根拠にしない。
- API request / response / errorがWeb、API、契約文書で一致し、responseはschema検証される。
- 音声原本、文字起こし、生成結果、ログの保持目的・起点・削除の契機が
  [privacy.md §5](./privacy.md)のとおり実装され、保持しないと決めたデータが実際に残らない。
- 再送・retry・Job再実行で二重のDotや外部AI処理が起きない、または利用者に結果が明確に示される。
- 複数のDotを利用者ごとに保存し、本人が一覧から過去のDotを選んで振り返れる。

2026-09-24に採用した公開基盤はAWS東京のALB + ECS Fargate + RDS PostgreSQLで、初期は
ECS 1タスク・RDS Single-AZ。構成と費用方針は[architecture](./architecture.md)を参照する。
日記内容・音声・AI入力は原則として東京に置くが、国内限定の法的・契約上の約束はまだ行わない。
音声原本を長期保存しないこと、処理が終わるまでの一時的な預かり、送信経路、保持・削除は2026-09-28にTASK-002で採用した（§2の表）。ゴミ箱による削除と`sentence`・`summary`の編集は2026-09-29に追加した。
AI providerとpromptは引き続き未決定。この設計採用によって§1–3の現行mock・localStorage・未実装の
状態が変わったとは扱わない。

### 録音前認証と期限切れ（2026-09-25採用、未実装）

録音開始操作と/record直アクセスのどちらでも、マイクを開始する前にRailsでログイン・メール確認・
期限を確認する。未認証ならログインへ案内し、成功後に録音の説明へ戻る。
自分専用端末でも認証成功から7日で失効し、利用による延長はしない。

送信時にも認証を再確認し、録音中に失効しても認証を迂回して送らない。別Userへ入り直した場合に
元の録音を送信・関連付けしない。同一Userで復帰した場合は、録音画面に留まっている間だけmemory内の
音声を再送できる（2026-09-28にTASK-002で確定）。画面を離れれば破棄され、storageへは書かないため
復帰後に取り戻せない。受理済み処理の所有者は変更しない。

確認メール24時間・reset6時間と再送制限、期限切れ/衝突時の導線、重要操作の再認証は
[TASK-001 Plan §50–54・§56](implementation-plans/2026-09-21-task-001-identity-design.md)を参照する。
現行mockの挙動は実装まで変わらない。

## 5. 未決定事項

- AI provider、prompt、`sentence`と`summary`の文面の作り方、同期/非同期生成（最長30分の音声では同期HTTPで完結しない見込み）、失敗時の再試行と
  冪等性（TASK-003で決定）
- 文字起こしまで成功した後の失敗で、録り直さずにテキストから再生成できるようにするか（TASK-003）
- password再設定後の既存Cookieの実動作
- password方針・ログイン試行制限の具体値、Googleの確認情報とConfirmableの関係（TASK-006で決定）
- 同日の複数録音をDot履歴にどう反映するか、履歴の日付境界と並び順
- 将来候補である検索・カテゴリ・期間フィルタの仕様と導入段階

これらは、最初のプロダクトAPIとWeb接続を設計するImplementation Planで選択肢、脅威、運用コストを
比較して決める。現行のモックやdesign-system記載だけから確定しない。

## 6. Dot生成後の深掘り対話（体験方針採用・未実装）

本文書§1〜5が扱う「録音 → 最初のDot生成 → 保存 → 表示」という基本flowに加え、保存済みの1件のDotに
対して利用者が任意で深掘り対話を行える体験を採用した。対話の位置づけ、Dotへの反映方法、データ区分、
未決定事項は[dot-follow-up.md](./dot-follow-up.md)を正本とする。

- 対話は基本flowに追加する独立した機能であり、毎回のDot生成で対話を必須にしない。対話を開始しない
  場合、本文書§1〜5の現行仕様・受け入れ条件は変わらない。
- 対話はDotを自動更新せず、利用者が明示的に承認した変更だけをDotへ反映する。
- 現時点では未実装であり、MVP完成条件との関係は[product.md §3](./product.md)を参照する。実装前に
  決める事項はdot-follow-up.md §5・§6と[TASK-018](./tasks/TASK-018-dot-follow-up-dialogue-design.md)を
  参照する。
