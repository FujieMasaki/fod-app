# 観点: バックエンドセキュリティ 🔴

この文書は、Rails APIのsecurity reviewで必ず確認する観点である。個人データの扱いは
[`../../privacy.md`](../../privacy.md)を仕様の正本として確認する。認証はRails側をTASK-006で実装した
（[architecture](../../architecture.md)「認証詳細」）。Dotの履歴の取得・編集のRails側はTASK-008で実装した。
Dotを作る入口・ゴミ箱と削除の操作・Webの接続・公開配信は未実装である。採用決定と実装・実機検証を区別し、実装される変更で適切な確認を行う。

## 1. 認証・認可とresource所有権 🔴

- [ ] 認証が必要なendpointで、サーバーがrequestごとに利用者を確定しているか。
- [ ] Dot、音声、生成結果などをIDで取得・更新・削除するとき、必ず現在の利用者のscopeから取得し、
  他人のresourceを推測したIDで操作できないか。
- [ ] clientが送るuser ID、owner ID、role、storage key、localStorage値を認可の根拠にしていないか。
- [ ] response、404 / 403、ログがresourceの存在や他人の個人データを不要に明かさないか。

## 2. 入力・response・秘密情報 🔴

- [ ] strong parametersまたは同等の許可listで、受け取るfieldを限定しているか。ID、所有者、状態、
  provider設定などをmass assignmentできないか。
- [ ] 型、長さ、形式、content type、アップロード容量、関連resourceの所有権を検証しているか。
- [ ] 形式を確かめた値（cursor・数値・日付など）から作る値が、DBの型の範囲（timestamp・integer等）に
  収まるか。形式だけを確かめると、作り替えた値でDBの例外が起き、`400` / `422`ではなく`500`になる。
  意味の上で取りうる範囲（例: その日の中の時刻）に限り、範囲外を拒否するtestを置く。
- [ ] API responseは明示したfieldだけで構成し、暗号化情報、token、内部state、外部provider response、
  他人のデータを含めていないか。
- [ ] credentialがsource、test fixture、例外、ログ、response、CI出力へ入っていないか。Railsの
  parameter filteringだけを唯一の防御にしない。

## 3. 音声・生成結果・外部AI 🔴

- [ ] 音声原本、文字起こし、生成結果ごとに、送信先、目的、保存先、保持期間、削除主体が仕様にあるか。
- [ ] 外部AI / storageへ送る内容が目的に必要な最小限で、tenantまたは利用者を取り違えないか。
- [ ] prompt、音声、文字起こし、生成全文、authorization headerを通常ログ・error tracking・例外messageへ
  出していないか。
- [ ] 外部失敗、timeout、再送、Job retryで二重保存・二重課金・他人への関連付けが起きないか。

## 4. Web境界と運用 🟠

- [ ] CSRFはCookie / session認証を採用する場合に、CORSは異なるoriginからブラウザ利用する場合に、
  実際の認証・配信構成に合わせて設定・reviewされているか。未採用の構成を先行設定しない。
- [ ] rate limit、upload制限、timeout、error responseを、外部公開と処理コストが生じるendpointで検討したか。
- [ ] migration、backup、削除処理、管理操作が個人データの保持・復旧・アクセス範囲を広げていないか。

## 5. 採用した認証設計の検証

- [ ] Deviseのメール確認・password再設定、OmniAuthのGoogle開始POST/CSRF/state検証が、API-onlyの
  middleware/Controller構成でも働くか。Google/email一致の自動統合やreset経由の無条件な連携をしていないか。
- [ ] CookieStoreのlogoutとコピー済みCookieの失効を区別し、未採用のDB session相当の保証をしていないか。
  有効期限、User削除/停止、password再設定後のCookie、Google専用Userの扱いを採用versionで確認したか。
- [ ] password、確認/再設定token、Google code/token、Cookieがproxy・メール導線・監視を含むログへ漏れないか。
- [ ] 登録の有無を明かさない応答で、**応答時間**にも差が出ないか。利用者がいるときだけtoken生成・メール送信・
  DB更新をrequestの中で行っていないか（jobへ移す。TASK-006で指摘）。
- [ ] passwordのhashに長さの制限がないか。bcryptは先頭72 byteだけで照合する（TASK-006では前処理で対応）。
- [ ] middlewareでpathを比べる処理が、frameworkと同じ正規化（大文字小文字・末尾の`/`）をしているか。
  表記を変えて制限・検証を迂回できないか。
- [ ] 空白だけの値を、framework がどう扱うかを確かめたか。Rails・Deviseは`present?`/`blank?`で空白だけの値を
  「空」とみなし、検証で拒否したり保存を飛ばしたりする（Deviseの`password=`はhashを保存しない。TASK-006）。
- [ ] 回数の制限を「確かめてから数える」形にしていないか。同時のrequestがどちらも上限の手前で通る。
  先に原子的に数えて枠を予約し、数えなくてよかったら戻す（TASK-006の`RateLimiter#release`）。
- [ ] 「検索してから保存」の間に同じ値が保存される競合で、一意制約（`RecordNotUnique`）だけでなく
  uniqueness validation（`RecordInvalid`）の失敗も扱っているか。
- [ ] test環境の設定が、検証したいsecurityの仕組みを無効にしていないか（例: `allow_forgery_protection`を
  falseにすると、Google開始POSTのCSRF検証がtestで素通りになる）。固定の時間枠で数える制限のspecは、
  時刻を枠の頭に固定しているか（`spec/support`の`:fixed_time`）。

## 6. 現在の構成での補足

- RailsはAPI-onlyで、routeは`GET /up`と認証（`/api/v1/session`等、`/auth/google_oauth2`）、Dotの
  履歴の取得・編集（`/api/v1/days`・`/api/v1/dots/{dot_id}`。TASK-008）だけ。保護するendpointは
  `before_action :authenticate_user!`と`current_user`を使い、JSONの項目はbodyからだけ受け取る
  （`JsonParams`。password・tokenをURLに載せない）。`/up`への変更でも不要な内部情報をresponseへ
  追加しない。
- Railsがparamsを解析するときに、本文が`filter_parameters`を通らずログへ出る経路を塞いでいる（TASK-008）。
  - `/api/`のbodyは`application/json`だけを受け付け、それ以外は解析する前に`422 body invalid_format`に
    する（`lib/middleware/api_request_guard.rb`）。formの不正なUTF-8から本文を含むmessageの
    `BadRequest`が起きるため。JSON以外を受け取るendpointを足すとき（TASK-009のmultipart）は、同ファイルの
    `NON_JSON_BODIES`へ足し、その解析で同じ経路が開かないか確かめる。
  - paramsを解釈できない`ActionController::BadRequest`（path・queryの不正なUTF-8など）は`rescue_from`の外で
    起き、値を含むmessageがerrorのログに出るため、同じmiddlewareが`DebugExceptions`の内側で捕まえて
    `422`にする。
  - JSONの不正なUTF-8は解析の失敗にし、解析の失敗のログから生のbodyを外す
    （`config/initializers/json_request_body.rb`。非公開のmethodを置き換えるため、Railsを上げたときに
    前提が保たれているか確かめる）。
  - frameworkが自分でログへ書く経路（解析の失敗、例外のmessage、SQL）は`filter_parameters`で隠れるとは
    限らない。個人データを受け取る変更では、debugのログを取り込むrequest spec・model spec
    （`spec/support/log_helpers.rb`の`captured_log`）で本文が出ないことを確かめているか。
  - このmiddlewareはpathをrouterと同じ規則（`Journey::Router::Utils.normalize_path`）で正規化してから
    比べる（§5の「frameworkと同じ正規化」）。`/api/`の判定を変えるときは、`//api/...`のような表記の
    request specを保つ。
- `apps/api/config/initializers/filter_parameter_logging.rb`は防御の補助であり、将来追加する音声・
  生成データの安全なログ運用を保証しない。
