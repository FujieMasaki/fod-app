# API契約

WebとRails APIの間のrequest / response / errorの約束を置く場所。**[`openapi.yaml`](openapi.yaml)が
正本**で、WebもAPIもこれに合わせる。判断の経緯は
[TASK-005 Plan](../docs/implementation-plans/2026-10-01-task-005-api-contract.md)にある。

## 1. ファイルと役割

| ファイル | 役割 | 手で書くか |
| --- | --- | --- |
| `contracts/openapi.yaml` | 契約の正本（OpenAPI 3.0.3） | 書く |
| `redocly.yaml`・`.redocly.lint-ignore.yaml` | 契約自体のlint設定と、理由付きの例外 | 書く |
| `apps/web/src/types/api-contract.d.ts` | 契約から生成したTypeScriptの型 | **書かない**（生成してcommitする） |
| `apps/web/src/libs/api-contract/schemas.ts` | responseを実行時に検証するZod schema。生成した型と完全一致を型検査で強制する（一致を確かめられるのは型まで。上限値などの制約値は`schemas.test.ts`が契約から読んで境界値で確かめる） | 書く |
| `apps/api/spec/support/api_contract.rb` | request specから契約を参照する設定（committee） | 書く |

OpenAPIを3.1ではなく3.0.3で書くのは、API側の検証に使うcommittee（openapi_parser）が3.0を
対象にしているため。

## 2. 契約を変えるときの手順

1. **`openapi.yaml`を先に直す。**APIの実装の都合で形を変えたくなったときも、黙って実装だけを
   変えず、契約の変更として扱う。
2. 変更した型の`examples`も直す（成功と主要な失敗の具体例。WebとAPIの両方のtestが読む）。
3. `pnpm --filter @focus-on-dot/web generate:api-types`で型を作り直し、型検査で失敗した
   Zod schemaと呼び出し側を直す。
4. API側はrequest specで`assert_response_schema_confirm(status)`を使い、responseを契約と照合する。
5. 契約・API・Webの変更は、同じPRに入れるか、PRを分けて積み重ねる
   （[PRの分割](../docs/development/pull-requests.md)）。分ける場合は次を守る。
   - 契約（`openapi.yaml`・`examples`）を変えるPRには、生成した型と、それに合わせたZod schema・
     `schemas.test.ts`も入れる。型検査で失敗するWebの呼び出し側と、契約の変更で落ちる既存のrequest spec・
     API実装も同じPRに入れる。`pnpm check`・`pnpm type-check`が契約・型・Zodの一致を検査するため、
     分けるとそのPRのCIが通らない。
   - PRは1つずつmainへマージ・releaseされうる。マージのどの時点でも、mainのWebとAPIが下記
     「互換性」を満たす順にする。例: endpoint・任意項目の追加なら「契約（型・Zodを含む） → APIの実装 → Webでの利用」
     （responseのenumへの値の追加は、Webが新しい値を受けられる契約のPR（Zodを含む）を先にreleaseしてから、
     APIが新しい値を返すPRを出す）。
     まだmainにないendpoint・項目をWebが使うPRを、先にマージしない。
   - 下記で「だめ」の変更は、expand・migrate・contractの各段階を別のPRにしてよい。

   どちらの場合も、PRでは下記「互換性」を確認する。

検査はすべて既存のコマンドに入っている。

| コマンド | 確かめること |
| --- | --- |
| `pnpm check`（`lint:contract`） | 契約の書式・参照・examplesがschemaに合うこと（Redocly）、生成した型が最新であること |
| `pnpm type-check` | Zod schemaが生成した型と完全一致すること（型だけ。`maxLength`・`minimum`・`pattern`などの制約値は比べない） |
| `pnpm test` | 契約のexamplesをWebのZod schemaで読めること。制約値を契約から読み、境界値でZodと一致すること |
| `bundle exec rspec`（`apps/api`） | 契約のexamplesがAPI側の検証器でもschemaに合うこと。request specのresponseが契約どおりであること |

`contracts/`・`redocly.yaml`の変更ではCIがWebとAPIの両方の検査を実行する。

## 3. 互換性とデプロイ時差

React buildはRails releaseに同梱するので、通常はWebとAPIが同時に入れ替わる。それでも次の間は
**古いWebと新しいAPI、または新しいWebと古いAPIが組み合わさる。**

- 古いSPAを開いたままのタブ（再読み込みするまで古いWebのまま）。
- ECSのdeployで新旧タスクが併存する間（同じ画面のrequestが新旧どちらにも届き得る）。

このため、1回のreleaseでは**両方向で壊れない変更**だけを入れる。

| 変更 | 1回のreleaseで入れてよいか |
| --- | --- |
| endpointの追加、responseへの任意項目の追加 | よい（WebのZodは未知の項目を捨てる） |
| requestへの任意項目の追加 | よい（APIは許可しない項目を無視する）。ただし未知の項目を拒否するrequest（`additionalProperties: false`。Dotの編集など）は、先にAPIが新しい項目を受け付けるreleaseを出す |
| responseの項目の削除・改名・型や形式の変更、必須だった項目を任意にする | **だめ**。下記の段階を踏む |
| requestの任意項目を必須にする、受け付ける値を狭める | **だめ**。下記の段階を踏む |
| responseのenumへの値の追加（`status`・`code`など） | **だめ**。WebのZodは未知の値を拒否するため、先にWebが新しい値を扱えるreleaseを出す |
| HTTP statusや`code`の意味の変更 | **だめ**。新しい`code`を足して段階を踏む |

段階の踏み方（expand → migrate → contract）:

1. **expand**: APIが新旧の両方を受け付け・返す。契約には新しい形を足し、古い形に`deprecated: true`を付ける。
2. **migrate**: Webを新しい形へ移す。
3. **contract**: 古いWebが残っていないことを確かめてから、古い形を契約とAPIから消す。

古いタブへの備えとして、Webはresponseのschema検証に失敗したら、壊れた表示をせず再読み込みを
案内する（実装はFrontendの各タスク）。URLの`/api/v1`は、上の段階では吸収できない全面的な変更の
ときだけ上げる。

PRのレビューでは「この変更は古いWeb・古いAPIのどちらと組み合わさっても壊れないか」を確認する。

## 4. 共通の約束

- 認証は同一originのCookie session。状態を変える操作は`X-CSRF-Token`を必須とし、tokenは
  `GET /api/v1/session`（login後は`POST /api/v1/session`）のresponseで受け取る。
- 個人に関わるresponseはすべて`Cache-Control: no-store`。headerは契約のschemaでは検証しないため、
  request specで確かめる（`docs/development/backend.md` §3）。
- 他人のresourceと存在しないresourceは区別せず`404 not_found`。ゴミ箱の中のDotは、ゴミ箱の
  endpoint以外から`404`。
- 日時は`Z`で終わるUTCのISO 8601（`+00:00`の形は使わない。契約のpatternとWebのZodの両方で
  拒否する）、日付はAsia/Tokyoの暦日（`YYYY-MM-DD`）で、どちらもserverが決める。画面でJSTに
  直すのはWeb。
- 状態によって返す項目が変わるresponse（`Session`・`Generation`・`Transcript`・`Problem`・`Today`）は、
  状態ごとのschemaに分け（`oneOf`）、必ず返す項目を`required`で表す。説明文だけで必須を表さない。
- serverが正規表現で入力を照合するときは、文字列全体を表す`\A`・`\z`を使う（Rubyの`^`・`$`は
  行単位で一致する）。契約のpatternはWeb（JavaScript）とAPI（Ruby）の両方で評価されるので、
  `^`・`$`ではなく、両方で文字列の端だけに一致する`(?<![\s\S])`・`(?![\s\S])`を使う。
- `DELETE`は、そのresourceをserverから消す（戻せない）操作だけに使う。Dotをゴミ箱へ移すような戻せる
  操作には使わない（`POST /api/v1/dots/{dot_id}/trash`）。path名は、利用者にとって1つしかない
  resource（`session`・`registration`・`confirmation`・`password`・`unlock`・`account`）を単数形にする。
- 一覧の続きはcursor。`next_cursor`が`null`なら終わり。Webはcursorの中身を解釈しない。
- 失敗はRFC 9457（`application/problem+json`）。Webは`code`で判定し、`title`・`detail`を
  そのまま画面に出さない。`detail`に日記本文・文字起こし・メールアドレスを入れない。
- `type`は`urn:focus-on-dot:problem:<code>`（実domainが未確定のため、取得できるURLにしない）。

## 5. error code

| code | status | 意味 | Webの扱い |
| --- | --- | --- | --- |
| `unauthenticated` | 401 | loginしていない | ログイン画面へ |
| `session_expired` | 401 | 認証から7日が過ぎた | 期限切れを伝えてログイン画面へ。録音画面にいれば録音は保持したまま |
| `email_unconfirmed` | 403 | メール確認が済んでいない | 確認メールの案内へ |
| `csrf_invalid` | 403 | CSRF tokenが無い・一致しない | `GET /api/v1/session`で取り直して1回だけ再送 |
| `invalid_credentials` | 401 | メールアドレスかpasswordが違う。ロック中（不一致10回で1時間）もこれを返す | どちらが違うかもロックの有無も示さない |
| `reauthentication_failed` | 403 | 退会時のpasswordが違う | 入力し直し |
| `google_reauthentication_required` | 403 | Google専用の利用者の再認証が古い | Googleの再認証（`intent=reauthenticate`）へ |
| `rate_limited` | 429 | 試行が多すぎる（認証・退会・録音の発行・送信・再試行） | `retry_after_seconds`後に再度。録音は手元に残したまま待つ |
| `validation_failed` | 422 | 入力が不正 | `errors`の項目ごとに示す |
| `token_invalid` | 422 | 確認・再設定・ロック解除のtokenが不正か使用済み | メールの再送へ（ロック解除なら1時間待つかloginし直す） |
| `token_expired` | 422 | 確認（24時間）・再設定（6時間）の期限切れ | メールの再送へ |
| `cursor_invalid` | 400 | cursorを解釈できない | 先頭から取り直す |
| `not_found` | 404 | 存在しない・他人の・ゴミ箱の中 | 一覧を取り直す。別のDotで代わりに表示しない |
| `account_deletion_in_progress` | 409 | 退会を受理済み（login・状況の取得・退会のやり直し以外の操作） | 退会の状況画面へ |
| `attempt_invalid` | 422 | 録音attemptが不正・別の利用者のもの、またはそのattemptのDotがゴミ箱の中にある・完全削除や退会で消した後 | この録音は送れないことを伝える。録音画面から送ろうとしていた場合だけ録り直しを案内する |
| `attempt_expired` | 422 | 録音attemptの送信期限（発行から2時間）切れ | 録り直しを案内 |
| `audio_too_large` | 413 | 音声が32MBを超えた | 上限を伝える |
| `unsupported_audio_type` | 415 | 受容しない音声形式 | 対応browserを伝える |
| `retry_expired` | 409 | 再試行の期限（受理から24時間）切れ | 録り直しを案内 |
| `retry_not_allowed` | 409 | いまの状態では再試行できない | 状態を取り直す |
| `generation_completed` | 409 | Dotの保存まで終わった処理は取り消せない | Dotの完全削除へ案内する |
| `deletion_failed` | 503 | 完全削除の途中で失敗した | 削除済みと表示せず、やり直しを案内 |
| `internal_error` | 500 | 想定外の失敗 | 一般的な失敗表示 |

Googleのログインは失敗理由をJSONではなく、redirect先の`auth_error=<理由>`で渡す（`intent=sign_in`は
`/login`、loginしたままの`intent=reauthenticate`は`return_to`）。

| 理由 | 意味 |
| --- | --- |
| `google_email_conflict` | Googleが確認済みとしたメールが、メール＋passwordの利用者と一致した。メールでのログインを案内する |
| `google_reauthentication_mismatch` | 再認証でGoogleが返した利用者が、いまloginしている利用者と一致しない。sessionは変えない |
| `rate_limited` | 試行回数の制限に掛かった |
| `google_auth_failed` | それ以外の失敗（共通の案内） |

## 6. lintの例外

`.redocly.lint-ignore.yaml`に置く。例外を足すときは、そのファイルに理由を書く。現在の例外は、
browserのredirectで遷移するGoogleログインの2つと、未認証でも`200`を返す`GET /api/v1/session`。

## 7. 契約の変更をレビューするときの観点

TASK-005のレビュー（codex・Claudeで計8回）で繰り返し見つかった種類の不備を、次の変更で先に確かめる
ためにまとめる。経緯は[TASK-005 Plan](../docs/implementation-plans/2026-10-01-task-005-api-contract.md)
§7-4の「レビュー」と付けた行。

- **必須を説明文だけで表していないか。**状態や`code`によって必ず返す項目が変わるなら、状態ごとの
  schemaに分け（`oneOf`）、`required`で表す。説明文の「〜のときだけ」は検証で拾えない。
- **作れないresponseを約束していないか。**後片付けで消える記録の値（期限など）を、記録が消えた後の
  responseで必須にしていないか。保持・削除の正本（`docs/privacy.md` §5）と突き合わせる。
- **どの状態からも回復できるか。**失敗・期限切れ・退会中・sessionの喪失・再認証の期限切れのそれぞれで、
  利用者が次に取れる操作が契約にあるか。共通の制限（退会中の`409`など）が回復の操作まで止めていないか。
- **一回性と削除が両立しているか。**冪等性や一回性を記録の一意制約で守っている場合、削除でその記録が
  消えた後に同じ値で作り直されないか。
- **外部認証の結果を、いまの利用者と照合しているか。**再認証などで、外部が返した主体がsessionの利用者と
  同じであることを確かめているか。
- **入力の照合は文字列全体か。**serverの正規表現は`\A`・`\z`、契約のpatternは`(?<![\s\S])`・
  `(?![\s\S])`を使う（`^`・`$`はRubyで改行の前後にも一致する）。redirect先などは、合わない値を
  安全な既定値に置き換える。
- **WebとAPIで同じ値を同じに判定するか。**日時の表記（`Z`）、制約値（`maxLength`・`minimum`など）、
  enumの値が、契約・Zod・committeeで一致しているか。制約値は境界testで契約から読んで確かめる。
- **後から足すと壊れるものを先に置いたか。**`429`のように、後から足すと古いWebが扱えないresponseは、
  具体値が未定でも枠を置く。
- **検証の仕組みが実際に失敗するか。**新しい検査を足したら、ずらした値で失敗することを一度確かめる
  （committee-railsが最初のrequestを使い回した件のように、検査そのものが黙って通ることがある）。
