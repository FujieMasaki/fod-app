# Journaling Specification

この文書は、録音からDotの振り返りまでの機能仕様である。現在の実装、実サービスのMVPで満たすべき
振る舞い、未決定事項を区別する。MVP全体の範囲は[`product.md`](./product.md)、複数Dotの履歴体験は
[`dot-history.md`](./dot-history.md)を参照する。

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

| データ | 現在の正本・保持場所 | 現在の削除・受け渡し | 実サービスで決めること |
| --- | --- | --- | --- |
| マイクstream / AudioContext | 録音中のbrowser memory | stop / dispose時にtrackを停止しAudioContextを閉じる。外部送信・永続化しない。 | 権限説明、対応ブラウザ、録音中断のUX |
| 録音Blob | `MediaRecorder`内部で一時生成され得る | `stop`はBlobを生成し得るが、`useRecorder`はdurationだけを上位へ返す。Blobは後続へ渡さず、保存・送信しない。 | 音声を送るか、保存先、保持期間、削除主体、upload失敗・再送 |
| 録音時間 | Session Providerと`fod.session.v1` | `reset`またはbrowser storageの削除で消える。UIの削除操作は未実装。 | 永続Dotとの関連、保持・削除方針 |
| DotSession（id、date、duration、sentence、reflection、closing） | Session Providerと`fod.session.v1`に現在の1件 | 新しい成功responseで上書きされる。`reset`はあるがUIから未実行。 | server側の正本、利用者単位の所有権、履歴、編集・削除、保管期間 |
| 文字起こし | 存在しない | 生成・保存・送信しない。 | 採用するか、音声との関係、個人データとしての扱い |
| API response | `createDot`の一時値をZod検証後にDotSessionへ | 未検証値は保存しない。 | 正式なrequest / response / error契約と互換性 |

`localStorage`はbrowser上で利用者が読み書きできるため、認証・認可やserver側の正本には使わない。

## 3. モックと実サービスの区別

- `VITE_DOT_API_URL`未設定時の`sampleSession`は、画面遷移と表示を確認するための固定mockである。
  録音内容を生成しておらず、保存もしていない。
- 現在のRails APIには`GET /up`だけがあり、`POST /dot`、`/api/v1`のプロダクトendpoint、認証、
  Dot保存、AI処理は実装されていない。
- `VITE_DOT_API_URL`設定時の本文なしPOSTは暫定的な接続点であり、音声Blob、duration、利用者、
  正式なRails API契約を表すものではない。
- 現行ErrorStateの「音声は保存されています」という文言は実装と一致しない。音声Blobは保存されず、
  再試行時にも音声を再送できない。この差異を解消する変更では、表示文言と実際の保持・再試行仕様を
  同時に更新する。

## 4. 実サービスのMVP受け入れ条件

最初の実サービス化では、次を満たす仕様と実装を同じ変更で確認する。

- 録音開始前に、音声を送るか、送る先、保存・削除の扱いを利用者が確認できる。
- 録音の成功、権限拒否、停止、中断、送信失敗、生成失敗、保存失敗、再試行の各結果が、実際の
  データ状態と矛盾しない。
- 保存されたDotは認証済み利用者本人だけが取得・更新・削除できる。
- 認証はRails + Deviseのメール＋パスワード・確認メール・パスワード再設定と、OmniAuthのGoogle
  ログインを採用する。Rails CookieStore、HttpOnly/Secure/SameSite=LaxのCookie、同一origin、
  RailsのCSRFとcurrent_userの所有者scopeを使う。email一致の自動統合、MFA、passkey、手動復旧、
  メールOTPは採用しない。通常logoutでコピー済みCookieの即時失効を保証せず、DB sessionによる
  端末別失効・全端末logoutは将来要件とする。localStorageを本人性の根拠にしない。
- API request / response / errorがWeb、API、契約文書で一致し、responseはschema検証される。
- 音声原本、文字起こし、生成結果、ログについて、正本、保持場所、保持期間、削除主体が決まっている。
- 再送・retry・Job再実行で二重のDotや外部AI処理が起きない、または利用者に結果が明確に示される。
- 複数のDotを利用者ごとに保存し、本人が一覧から過去のDotを選んで振り返れる。

2026-09-24に採用した公開基盤はAWS東京のALB + ECS Fargate + RDS PostgreSQLで、初期は
ECS 1タスク・RDS Single-AZ。構成と費用方針は[architecture](./architecture.md)を参照する。
日記内容・音声・AI入力は原則として東京に置くが、国内限定の法的・契約上の約束はまだ行わない。
音声原本を保存するか、送信経路・保持期間・AI providerは引き続き未決定。この設計採用によって
§1–3の現行mock・localStorage・未実装の状態が変わったとは扱わない。

## 5. 未決定事項

- 録音Blobを実サービスへ送るか、送る場合の形式・サイズ制限・upload経路・保持期間
- AI provider、prompt、文字起こしの有無、同期/非同期生成、失敗時の再試行と冪等性
- 録音前ログイン、Cookieの有効/idle/絶対期限・remember_me、再認証、password再設定後のCookieの扱い
- 確認/再設定メールの期限・再送・導線、Googleの確認情報と同一メール衝突時のUX
- 利用者の削除要求、Dotと音声・生成結果の削除連鎖
- 同日の複数録音をDot履歴にどう反映するか、履歴の日付境界と並び順
- 将来候補である検索・カテゴリ・期間フィルタの仕様と導入段階

これらは、最初のプロダクトAPIとWeb接続を設計するImplementation Planで選択肢、脅威、運用コストを
比較して決める。現行のモックやdesign-system記載だけから確定しない。
