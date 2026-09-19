# Backend Development Guide

この文書は、`apps/api/`のRails APIを実装・変更するときの判断基準である。プロダクトの範囲は
[`../product.md`](../product.md) と機能仕様、構成上の継続判断は
[`../architecture.md`](../architecture.md) を正本とする。

## 1. 責務と境界

### 必須

- ControllerはHTTP入力を受け、認証済みの主体を得て、許可されたparameterだけを渡し、成功・失敗を
  HTTP responseへ変換する。業務ルール、外部AI clientの詳細、複数model更新をControllerへ置かない。
- Modelは永続化、関連、validation、単一modelに閉じる不変条件を担う。HTTP request / response、
  現在の利用者を暗黙に参照する認可、外部API呼び出しをModel callbackへ置かない。
- 認証・認可はControllerの前後でサーバーが必ず検証する。clientが送るuser ID、Dot ID、
  localStorage値を所有権の根拠にしない。
- API responseは必要なフィールドだけを明示して組み立てる。Modelをそのままrenderせず、内部属性、
  token、他人のデータ、外部providerの生responseを混入させない。
- inputは許可listで受け、型・必須性・サイズ・形式・所有権を検証する。model validationはAPI以外の
  経路も含むデータ整合性を守るために併用する。

### 推奨

- 最初はRails標準のController、Model、Active Record validation、request spec、model specから始める。
  1つのactionで読み切れる処理は無理に別層へ移さない。
- Controller actionが複数modelの更新、分岐の多い業務手順、外部APIとの調停を持ち、単体で理解・
  testできなくなった時点で、用途が名前から分かる小さなServiceを追加する。
- 時間のかかる処理、利用者を待たせない処理、失敗後に安全に再実行する処理はJob候補として分ける。
  Jobは入力、冪等性、再試行、失敗の観測方法を持つ。

### 保留

- finder、interactor、use case、serializerの一律導入、repository層、専用Gemは行わない。同じ複雑さが
  複数endpointに反復し、Rails標準だけでは認可・response・transactionの境界を読み取れないときに、
  導入候補と既存コードへの影響をImplementation Planで比較する。
- 認証方式、AI provider、background job基盤、音声storageは未決定である。これらを文書上の例だけで
  採用済みにしない。

### 例外

- Model callback、同期外部API、Controller内の複数model更新を例外として許容するのは、transactionと
  failure semanticsが短く明示でき、分離の方が処理の正しさを損なう場合だけとする。理由、失敗時の
  振る舞い、再検討条件をImplementation Planに記録する。

## 2. 整合性・外部連携・失敗

### 必須

- 複数のDB更新が一体で成功すべきときはtransactionを使う。外部API呼び出しをDB transactionの中に
  長時間保持しない。外部成功とDB失敗、DB成功と外部失敗をどう回復・表示するかを実装前に決める。
- AI providerやstorageへ送るデータは最小にし、送信先、目的、保持・削除、ログからの除外を
  仕様とsecurity reviewで確認する。
- timeout、provider失敗、invalid response、重複request、Job再実行が起こり得る変更では、
  利用者への結果、DBの状態、再試行可否、冪等性keyまたは重複防止策を定義する。
- 例外を握りつぶさない。clientには安全で一貫したerror responseを返し、運用ログには音声、
  文字起こし、生成全文、tokenなどを出力しない。

### 推奨

- 外部I/Oの前後を、DBに記録する状態と外部処理の状態に分けて考える。同期で完了できる小さな処理も、
  timeoutと再送を前提にrequest specを用意する。

## 3. API契約とテスト

### 必須

- Webが利用する最初のプロダクトAPIでは、request、response、error、認証、互換性を同じ変更で
  更新する。契約の運用はarchitectureの方針に従う。
- endpoint単位の認証・認可、許可parameter、成功・失敗responseはrequest specで確認する。
- validation、関連、制約、state transitionなどModel固有の不変条件はmodel specで確認する。
- ServiceやJobを追加した場合は、その業務境界、失敗、再試行・重複実行を直接testする。

### 推奨

- 単にframeworkが生成するからではなく、回帰リスクがある振る舞いをtest対象にする。正常系だけでなく、
  他人のresource、invalid input、外部失敗、二重送信を優先する。

### 保留

- OpenAPI、型生成、契約検証libraryは最初のプロダクトAPIをWebが使う変更で選択肢を比較する。今回の
  基盤だけを理由に導入しない。

## 4. 実装前チェック

- 誰が何のresourceへアクセスできるか、client入力をどこまで許可するかを仕様に書いたか。
- DBの正本、transaction境界、外部I/O、失敗・再試行・重複時の状態を説明できるか。
- 録音・生成結果・個人データの送信先、保存先、削除、ログ出力を確認したか。
- Railsを読む・書く場合は、個人規約が指す`rails-conventions.md`も確認したか。
