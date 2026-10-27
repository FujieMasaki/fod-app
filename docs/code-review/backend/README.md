# バックエンド AIコードレビュー指針

この文書は、`apps/api/`を含む変更をレビューするときの入口である。実装方法の正本は
[`../../development/backend.md`](../../development/backend.md) とし、ここでは何を確認し、
どう報告するかを定める。開始時に必ず[`security.md`](./security.md)を読む。

## 1. レビュー手順

1. 関連するproduct / 機能仕様、architecture、Implementation Planを読み、受け入れ条件と対象外を
   把握する。
2. 全差分を読み、判断に必要なroute、Controller、Model、migration、test、Webの呼び出し側、設定を
   確認する。
3. security、責務・依存、状態遷移、API契約・互換性、test不足の順に確認する。
4. 事実、前提に依存する推測、修正が必要な問題、任意の改善を分けて報告する。

ローカルで依頼されたレビューはチャットに出力する。明示的な依頼なしに外部サービスへ投稿、承認、
変更しない。

## 2. 確認項目

- 仕様と受け入れ条件に一致し、対象外を勝手に実装していないか。
- Controller、Model、追加したService / Jobの責務と依存方向が
  [backend実装規約](../../development/backend.md)に沿うか。
- requestごとに認証・認可を行い、他人のDotや関連resourceへアクセスできないか。
- parameterの許可範囲、validation、DB制約、transaction、異常系、再試行・重複実行の扱いが妥当か。
- request / response / errorが[`contracts/openapi.yaml`](../../../contracts/openapi.yaml)と一致し、
  request specで照合しているか。不要な属性や内部エラーを返さず、古いWebと組み合わさっても壊れないか
  （[`contracts/README.md`](../../../contracts/README.md) §3）。契約を変える差分では、同READMEの
  §7「契約の変更をレビューするときの観点」も確認する。
- 録音、文字起こし、生成結果、個人データの保存・送信・削除・ログ出力が仕様どおりか。
- request spec、model spec、Service / Job specのうち、変更したリスクを検証するtestがあるか。

## 3. 重大度と報告

| 重大度 | 定義 | 対応 |
| --- | --- | --- |
| 🔴 Critical | 情報漏洩、認可突破、他人のDot操作、音声の意図しない外部送信に直結する | マージ前に必ず対応 |
| 🟠 High | 永続データの破損、重複生成、重大なAPI互換性破壊、悪用されやすい入力不備 | 原則マージ前に対応 |
| 🟡 Medium | 異常系・test・運用上の防御が不足し、限定した条件で不具合になる | 対応を推奨 |
| 🔵 Low | 可読性などの任意改善 | 任意 |

各指摘は次の形式を使う。根拠が不足するときは「要確認」として前提を明記する。Critical、High、
Mediumがなければ`LGTM`と明記する。

```text
🟠 [タイトル]
場所: apps/api/path/file.rb:12
根拠: 仕様または実装上確認できる事実。
影響: 起こり得る利用者・データ・互換性への影響。
修正案: 実装可能な対応。
区分: 修正が必要 / 任意改善 / 要確認（前提: ...）
確信度: 高 / 中 / 低
```

## 4. 変更種別ごとの追加確認

| 変更 | 追加で確認すること |
| --- | --- |
| route / Controller | 認証前提、resourceの所有権、strong parameters、status code、error response |
| Model / migration | validationとDB制約、UUID foreign key、data migration、rollback、既存dataへの影響 |
| AI / storage / 外部API | 送信内容の最小化、timeout、failure、再試行、冪等性、ログ・削除。SDKの例外を包む対象と再送の設定（下の補足） |
| Job | enqueueのtransaction境界、重複実行、retry、dead letter相当の観測方法。引数と失敗の例外が何に残るか（下の補足） |
| 状態遷移・後片付け | 条件付きの更新が負けたときの答え方、実行権・lockを取る前に読んだ値の使い方、記録の値から決める削除の範囲（下の補足） |
| 設定（`config/*.yml`・ERB・`config/puma.rb`・環境変数の既定値） | 埋め込んだ環境変数の型・構造、連動する設定値（下の補足） |
| WebとAPIの同時変更 | request / response schema、互換性、同一PRでの更新（分けた場合は、契約のPRに生成した型・Zodが入っているか、expand・migrate・contractの段階を同じ統合ブランチにまとめていないか）、デプロイ時差 |
| auth / CORS / CSRF | 採用した認証方式、Cookieかtokenか、配信origin、ブラウザからの利用経路 |

補足（処理系の挙動や競合で見落としやすいもの）:

- SDKの例外を包むときは、包む対象のclassをSDKの例外の階層で確かめる。共通の親（`ServiceError`など）を
  継承しない例外（通信の失敗の`Seahorse::Client::NetworkingError`など）や、clientを作る途中・認証情報を
  取り直す途中の例外が漏れやすい。SDKの再送の設定は、その設定が効く条件（再送のmode）と、明示しなかった値を
  決める環境変数・共有の設定ファイル（`~/.aws/config`のprofile）も確かめる。
  - rescue節の中で外部を呼んでいないか。Rubyでは、rescue節の中で起きた例外を同じ`begin`・methodの別の
    rescue節は捕まえないので、包むはずの例外が素通りする。rescue節の中（そこから呼んだmethodを含む）で
    raiseした例外には、rescueした例外が暗黙に`cause`として付く（`cause: nil`を明示しない限り）。
- Jobの引数と例外のmessageに、[security.md](./security.md) §3が通常ログ・error tracking・例外messageへ
  出さないとするものを入れていないか。残る先と期間は、成否・retry・discardと設定（`log_arguments`、
  Solid Queueの`preserve_finished_jobs`・`clear_finished_jobs_after`、終わったJobを消す定期のtaskの有無）で変わるので、
  使っているgemの版で確かめる。
  たとえば次のとおり。
  - 引数は、`log_arguments`を`false`にしても`solid_queue_jobs.arguments`に残る。ActiveJobの`retry_on`は
    retryのたびに同じ引数で新しい行を作り、元の行は終わったJobとして残る（`discard_on`で捨てたJobの行も同じ）。
  - 終わったJobの行は、`preserve_finished_jobs`が真（既定）なら、`clear_finished_in_batches`を呼ぶ定期のtask
    （`config/recurring.yml`）が消すまで残る。`clear_finished_jobs_after`は消す対象の期間で、taskがなければ期限なく残る。
  - 失敗したJobの行は、Solid Queueの失敗の記録（`FailedExecution`）を手でretry・discardするまで期限なく残る。
  - 例外のmessageは、ActiveJobのログ（retryの途中の失敗は、最後に成功したJobでも残る）・
    `solid_queue_failed_executions.error`・error tracking（`cause`を含む）に残る。
- 条件付きの更新（状態・実行権を条件にしたUPDATE・DELETE）が0行だったときに、読んだ時点の値で答えていないか。
  負けた相手（取り消し・退会・完了・後片付け）によって正しい答えが変わるので、最新の状態を読み直してから答え、
  競合の順序を作るspecがあるか。lockしない遷移と並ぶ読み取りは、lockするか読み直す。
  - 実行権を取る・行をlockする前に読んだ値（試行番号から決まるkey・job名、最終進捗の時刻、期限の判定に使う
    `now`）を、取った後の判断や外部の呼び出しにそのまま使っていないか。取るまでの間に失敗・再試行・取り消し・
    掃除が一巡していると、古い試行の資源で新しい試行を動かしたり、消した記録を作り直したりする。取った後に
    記録を読み直し、期限はその時点の時刻で見直す。本文の受け取りや外部の呼び出しのように長く待つ処理の後も同じ。
- 記録の値（key・job名など）から削除の範囲を決めるときは、その範囲がその記録自身の識別子の下に収まるかを
  確かめる。値が壊れていても、別の記録の資源を消さないようにする。実行権を失った側の後始末が、記録ごとの
  範囲（prefix）を消していないかも確かめる。処理が別の実行（watchdog・再送）で続いていると、その実行の資源まで消してしまう。
- 引用符のない値はYAMLが型と構造を推測する。値の中身しだいで整数・8進数（先頭が0で0〜7だけ）・真偽値
  （`yes`・`off`など）・`nil`（空の値）になるか、文字列のまま残る（例であって全部ではない）。` #`より後は
  コメントとして消える。YAMLが読んだ後に変換しても元の値には戻らないので、型はERBの中で決めてから埋め込む。
  - 文字列は`.to_json`で引用符とescapeを付ける。未設定の値は`null`（nil）になるので、`ENV.fetch`で必須に
    するか既定値を決める。
  - 数値は`.to_i`する。`.to_i`は空・数字で始まらない値を0にし、途中が不正な値は先頭の数字だけを読むので、
    下限を付けるか`Integer(value, 10)`で落とす。
  - 境目の値（先頭が0・空）でtestしているかも確かめる。
- 値が連動する設定（workerのthreadsとDBの接続数など）を片方だけ変えていないか。連動する値は、片方を変えると
  落ちるtestがあるか。
