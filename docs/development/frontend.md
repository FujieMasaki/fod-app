# Frontend Development Guide

この文書は、`apps/web/`を実装・変更するときの判断基準である。プロダクトの振る舞いは
[`../product.md`](../product.md) と機能仕様、UI表現は
[`../design-system.md`](../design-system.md) を正本とする。本書はそれらを複製しない。

## 1. 配置と責務

### 必須

| 場所 | 置くもの | 置かないもの |
| --- | --- | --- |
| `router.tsx` | route定義、画面の組み合わせ、route単位の状態確認と遷移 | feature固有の業務処理、fetch、録音処理、画面内で完結する詳細UI |
| `features/<name>/` | 1つの機能のUI、Hook、通信関数、型、機能専用のテスト | 他featureの内部への直接依存、全アプリ共通のレイアウト |
| `components/` | 複数featureで使うアプリ共通のレイアウト・状態表示 | あるfeatureだけの業務用UIやAPI呼び出し |
| `design-system/` | 見た目と操作の再利用可能なprimitive、token、icon | feature固有の文言、データ取得、画面遷移の判断 |
| `libs/` | Browser API・SDKなど低レベル依存の小さいラッパー | React state、route、feature固有の表示判断 |
| `utils/` | 副作用がなく、featureに依存しない小さな変換・計算 | fetch、storage、React Hook、UI状態 |

- feature間で他featureの内部ファイルをimportしない。共有が必要なら、まず呼び出し元に近い
  featureに留め、公開する最小APIを`index.ts`からexportする。
- `router.tsx`からfeatureを組み合わせる。routeをまたぐ値を渡すためだけに、routerへ業務処理を
  移さない。
- 外部から来るAPIレスポンス、`localStorage`値、URL由来の値は、使用前にZodなど既存のschemaで
  検証する。検証できない値は表示・保存しない。
- 関数は、Component・Hook・補助関数・Component内のhandlerも含めて`const`＋arrow functionで書き、
  `function`宣言・関数式を使わない（2026-10-05に決定。ESLintの`func-style`と`no-restricted-syntax`で固定。
  objectのmethod・getter・setterの形は使ってよい）。関数名はcamelCaseかPascalCaseにする（lintは`_`を含む
  大文字の名前を止める）。classも使わず、失敗の種類などは
  `const`の作成関数と型ガードで表す（`libs/api-client/request.ts`の`createApiError`・`isApiError`。testの
  差し替えで、実装が`new`で作るもの（`AudioContext`など）だけはclassで書いてよい）。overloadが要る関数は、
  overloadを持つ関数型を`const`に付け、呼び出しの型をtestで固定する（`libs/api-client/request.ts`の`apiRequest`）。

### 推奨

- Componentは表示とユーザー操作の受け渡しを担い、状態遷移・非同期処理・Browser API操作は
  feature Hookまたは`libs/`へ置く。Componentが長くなるだけでは分割しない。
- 通信関数はfeature内でrequest/responseの変換とエラーを集約し、HookはTanStack Queryの
  query / mutationと画面に必要な状態を提供する。現在のfeature単位の配置を維持する。
- 共通化は、同じ責務・同じ入力/出力・同じ変更理由で2箇所以上に必要になり、呼び出し側が
  feature固有の前提を知らずに使えるときに検討する。見た目だけの偶然の一致では共通化しない。

### 保留

- 通信専用directory、全域のrepository層、画面横断の状態管理libraryは導入しない。複数featureが
  同じサーバー資源を独立に扱い、feature内の通信関数では契約やキャッシュを一貫させられなくなった
  ときに検討する。
- 新しいdesign-system primitiveは、複数のプロダクトUIで同じアクセシビリティと操作を共有する
  必要が生じたときに検討する。スタイルの基準はdesign-system文書に従う。

### 例外

- feature間の直接依存、`components/`でのfeature固有処理、`libs/`でのReact依存を許容するのは、
  代替案より依存方向が明確で、短期的な重複より安全な場合だけとする。理由、影響範囲、解消または
  再検討条件を対象変更のImplementation Planに残す。

## 2. 状態・通信・保存

### 必須

- 画面内だけで消えてよい入力・開閉・送信中などはComponentまたはfeature Hookの一時stateに置く。
- routeをまたぐ短いジャーナリング途中のUI状態だけをSession Providerに置く。Session Providerは
  サーバーの正本、認証・認可、複数端末の同期の代わりにしない。
- サーバー由来のデータ、fetch lifecycle、再取得・mutationはTanStack Queryで扱う。query cacheと
  Session Providerへ同じサーバー正本を無条件に二重保存しない。serverに保存したDot（履歴）はTanStack Queryで
  扱い、Session Providerへ置かない（2026-10-07にTASK-012で決定。`features/history`）。生成直後のDotの
  受け渡しは、生成をserverへ接続するTASK-011で決める。
- `localStorage`は、再読み込み後にも必要で、利用者がブラウザ保存を許容し、schema・最小項目・
  version・削除契機が定義できる値だけに使う。録音Blob、文字起こし、トークン、認証根拠は保存しない。
- API失敗、schema不正、権限拒否、ネットワーク中断を区別して安全なUIへ変換する。サーバーの
  エラー本文、録音内容、秘密情報をそのまま表示・ログ出力しない。
- Rails APIは同一originで、`features/auth`の`useAuth().request`（状態を変える通信関数は
  `useAuth().withCsrf`）から呼ぶ。CSRF tokenの付与・`csrf_invalid`の1回の再送・`401`での認証の終了を
  ここに集めているため、機能ごとに`fetch`でRails APIを呼ばない。
- 本人の個人データを、Query cacheと、保護する画面の下でunmountされるComponentのstate以外（routeをまたぐ
  Provider・Contextのstate、`sessionStorage`など）に持つ機能は、`useAuth().subscribeIdentityChange`を購読し、
  認証の終了・利用者の切り替わりで消す。消すまでの1回の描画で前の利用者の値が出ないよう、値を書いたときの
  `useAuth().identityEpoch`と一緒に持ち、今の値と違えば見せない（Session Providerの方式）。Query cacheは
  認証（`["auth", ...]`）以外をAuth Providerが消す。
- Rails APIのresponseは、[`contracts/openapi.yaml`](../../contracts/openapi.yaml)から生成した型
  （`types/api-contract.d.ts`）と完全一致するZod schemaで検証する。schemaは
  `libs/api-contract/schemas.ts`に置き、使う機能の実装時に追加する。失敗は`code`で判定し、
  `title`・`detail`をそのまま表示しない。responseのschema検証に失敗したら、古いタブの可能性があるため
  壊れた表示をせず再読み込みを案内する。契約の変更手順は[`contracts/README.md`](../../contracts/README.md)。

### 推奨

- mutationの再試行は、操作が重複しても安全か、またはサーバーが冪等性を保証するかを確認してから
  提供する。生成・保存を再実行するUIには、利用者に何が再実行されるかを示す。
- HTTP requestの本文、認証、timeout、response schema、エラー文言を実装前に仕様とAPI契約で確認する。
  現在の`createDot`は体験確認用の特殊な経路であり、将来のRails API契約と同一視しない。

## 3. 録音データ

### 必須

- マイク要求は利用者の録音開始操作に結び付け、拒否・非対応・停止・unmount時にstreamのtrackと
  AudioContextを解放する。
- Blobを生成する変更では、生成者、次の受け渡し先、保持期間、成功・失敗・中断時の破棄者を仕様に
  明記する。送信・永続化の契約がない限り、Blobを`localStorage`やURLへ移さない。
- 音声・文字起こし・生成結果を外部へ送る変更は、送信先、目的、項目、利用者への説明、削除方針を
  `journaling.md`とsecurity reviewで確認する。

### 推奨

- `libs/audio`はMediaRecorderなどの低レベル資源管理に限定し、画面遷移や生成開始はfeature側で
  判断する。

## 4. テスト

### 必須

- 変更した分岐のうち、データ破損、誤送信、権限、保存・削除、エラー表示、route遷移、schema検証に
  関わるものは、unitまたはcomponent/integration testの必要性を明示して判断する。
- mockは実サービスと区別し、通信契約・Browser API・時間依存の前提をtest名またはfixtureで読める
  ようにする。

### 推奨

- 純粋な変換はunit test、HookとComponentの状態遷移はcomponent/integration test、実ブラウザの
  権限・録音・複数画面の一連操作は必要になった時点でE2Eを選ぶ。

### 画面のスナップショット比較（VRT）

- 主要な画面の見た目を基準画像と比べ、意図しない見た目の変化を検出する。対象はホーム（未認証）、
  ログイン、録音（マイクの許可待ち）、今日のDay（Dotあり・なし）、過去の一覧、日の詳細、設定で、
  幅は390px・1280pxの2つ（`apps/web/vrt/screens.spec.ts`）。dark modeは導入したときに加える。
- 実行は`pnpm vrt`、基準画像の更新は`pnpm vrt:update`。どちらも公式のPlaywrightコンテナで実行し
  （Dockerが要る）、CIの`VRT`ジョブも同じscript（`scripts/vrt.sh`）を使う。macOSとLinuxで文字の
  描画が違うため、コンテナの外では実行しない。
- 差分があると失敗し、`apps/web/vrt/report`（CIでは`vrt-report` artifact）に期待・実際・差分の画像が出る。
  意図した変化なら`pnpm vrt:update`で基準画像（`apps/web/vrt/__screenshots__/`）を更新し、変更と同じ
  コミットに入れる。意図しない変化なら実装を直す。許容値は1pxの差も、わずかな色の差も失敗にする設定（`maxDiffPixelRatio: 0`・`threshold: 0`）で、揺れたら
  許容値を緩める前に原因（時刻・animation・fixture）を直す。
- APIは`apps/web/vrt/fixtures.ts`の架空のデータに差し替え、契約のschemaで検証してから返す。
  時刻・フォント・外部への通信・マイクは`apps/web/vrt/support.ts`で固定する。基準画像に実在の
  個人データ・音声由来の内容を入れない。画面が新しいAPIを呼ぶようになったら、fixtureを足す
  （fixtureのないAPIを呼ぶとVRTが失敗する）。
- 依存はcheckoutごとのDocker volume（`fod-vrt-`で始まる名前）に入る。worktreeを消した後などに片付けるときは
  `docker volume ls -q -f name=fod-vrt-`で確かめてから`docker volume rm`する。
- PlaywrightはVRTのためだけに使う。E2E（操作の一連の流れの検証）を入れるかは、下の「保留」で判断する。

### 保留

- E2E基盤は、実サービス接続または重要な回帰がunit / component testで防げないときに導入判断する。
  VRTのためにPlaywrightを入れたことは、この判断を済ませたことにならない。

## 5. 実装前チェック

- 関連するproduct / 機能仕様、architecture、当該feature、API契約の有無を確認したか。
- 新しい値の正本、保持場所、削除契機、失敗時の表示を説明できるか。
- UIを変える場合、`docs/design-system.md`を読んだか。
- 例外または保留事項があれば、Implementation Planへ理由と再検討条件を記録したか。
