# 観点: バックエンドセキュリティ 🔴

この文書は、Rails APIのsecurity reviewで必ず確認する観点である。現在はRails基盤と`GET /up`のみで、
プロダクトAPI、認証方式、AI provider、配信構成は未決定である。未決定の仕組みを前提に断定せず、
実装される変更で適切な確認を行う。

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

## 5. 現在の構成での補足

- RailsはAPI-onlyで、`GET /up`以外のプロダクトrouteはない。`/up`への変更でも不要な内部情報を
  responseへ追加しない。
- `apps/api/config/initializers/filter_parameter_logging.rb`は防御の補助であり、将来追加する音声・
  生成データの安全なログ運用を保証しない。
