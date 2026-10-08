# Implementation Plan: TASK-010 録音前の説明と音声の受け渡し・中断UX

## 1. Status

実施中（2026-10-09）。§5の対象は実装し、自動の検証を終えた（§16）。録音attemptの発行とuploadのendpointがbackendに
無いため、それに依存する完了条件と、案内の所在地・保持の部分の確定、実ブラウザでの確認は残す。

## 2. Goal

- 録音を始める前に、音声がどこへ渡り、どう預かられ、いつ削除処理が始まるかと、他人の実名や住所は言い換えられる
  ことを、マイクを起動する前に確かめられる。
- マイクの権限拒否・非対応・マイクが無い・使えないときに、録音できたように見せず、次の操作を案内する。
- 録音の成功・停止・中断・音声なし・制限超過を区別し、録音した音声（Blob）と録音時間を、memoryだけで生成の画面へ
  受け渡す。
- 録音attemptを発行する通信関数を契約どおりに用意する（画面への接続はbackendの実装後）。

## 3. Background

- 現在の`/record`は、開いた瞬間にマイクを要求して録音を始める。権限拒否・非対応では`silent` modeへfallbackし、
  合成の波形を出したまま「録音」を続け、止めると録音時間だけを渡して整理（mockのDot生成）へ進む。権限拒否が
  成功した録音として扱われている（journaling.md §1）。
- 録音Blobは`libs/audio/recorder.ts`の`stop`で作られるが、`useRecorder`はdurationだけを返して捨てる。
- 録音前の案内の内容はTASK-002 Plan §22の7項目と、architecture.md「データ所在地と費用」が求める開示（送信先が
  国内か国外か、保持や人によるレビューを伴うか）で、置き場所は「認証確認の後、マイクを起動する前」（journaling.md §4）。
  7項目のうち項目3はTASK-003（文字起こし結果を自前S3へ置く）で実態と合わなくなったため、言い換える（タスクの完了条件3）。
- ログインの後の戻り先は、録音画面が開くとすぐマイクを始めるためHomeにしてある。録音の説明の段階ができたら、
  そこへ戻すことになっている（`features/auth/redirect.ts`、journaling.md §4「録音前認証と期限切れ」）。
- 録音attemptの発行（`POST /api/v1/recording_attempts`）とupload（`POST /api/v1/dots`）は契約にあるが、Railsに
  未実装。タスク本文のとおり、案内・画面・通信関数までを進め、backendで確かめる完了条件は残す。

## 4. Current State

- Route: `/record`（`RequireAuth startsOnEnter`で包んだ`RecordingStage`）、`/processing`（`ProcessingIndicator`）。
- Component: `features/recording/components/recording-stage` がmountで`useRecorder().start()`を呼ぶ。停止は
  `stopping`で二重に押せない。利用者の世代（`identityEpoch`）が録音中に変わったらHomeへ戻す。
- Hook: `features/recording/hooks/use-recorder.ts`（開始・停止・経過時間・声量）。`use-microphone-permission.ts`は
  どこからも使われていない（今回は触れない）。
- Browser API: `libs/audio/recorder.ts`がgetUserMedia・AudioContext・MediaRecorderを扱う。拒否・非対応は`silent`。
  許可を待っている間に止めた・片付けた場合は、許可の後にstreamを止めて録音を始めない（既存の保護）。
- State: Session Providerが`recordedDurationSec`と`dotSession`をmemoryに持ち、利用者の切り替わりで消す。
- API: `features/processing/create-dot.ts`は`VITE_DOT_API_URL`が無ければmock。録音の入力を受け取らない。
- Storage: 録音に関するものは無い（`fod.session.v1`は起動時に消す）。

## 5. Scope and Non-goals

対象:

- 録音前の案内の画面（`/record`の最初の段階）。利用者が「録音を始める」を押してからマイクを要求する。
- `libs/audio/recorder.ts`の作り直し: `silent` fallbackをやめ、マイクを開く段階（`open`）と録音を始める段階
  （`record`）を分ける。失敗の種類を返す。録音形式を選び、マイクが途中で切れたことを知らせる。
- 録音の結果の区別（下記§7-3）と、音声・録音時間のSession Providerへの受け渡し（memoryだけ）。
- 権限拒否・非対応・マイク無し・使用中・中断・音声なし・制限超過の画面と次の操作。
- `/processing`で受け渡せる音声が無い場合の表示。
- 録音attemptの通信関数（`createRecordingAttempt`）とZod schema。
- ログインの後の戻り先に`/record`を加える（開いても案内が出るだけでマイクは始まらないため）。
- journaling.md・architecture.mdの現行挙動の更新。

対象外（理由）:

- **録音attemptの発行を録音開始の手順へ組み込むこと、attemptの破棄、発行から録音開始までの遅れの実機計測**。
  endpointが未実装で、組み込むと録音そのものが始められなくなる（404）。存在しないendpointを前提にした仮の実装を
  完了扱いにしない（タスク本文）。組み込む場所は`open`と`record`の間で、今回の分割でその形にしておく（§7-2）。
- 音声のupload、生成のpolling、再試行、ErrorStateの文言（TASK-011）。mockのDot生成は変えない。音声は受け渡すが、
  mockは使わない。
- mockと実サービスを利用者が混同しない表示（TASK-011の完了条件）。
- 削除・ゴミ箱の画面（TASK-014）。

未決定で、今回確定しない事項:

- **案内のうち、生成（Bedrock）の推論経路が国内か国外か、委託先での保持や人によるレビューの有無**。使う構成の記録は
  TASK-009、委託先の確認はTASK-025で、どちらも未完了。タスク本文の指示どおり、この部分は確定させず、未確認の
  委託先の事実（「学習に使われない」「保持しない」「国内で処理する」など）を書かない。画面には「確認が済んでから
  ここに記載する」ことを示す1行を置く（§7-1）。TASK-009が構成を記録したら、TASK-010の続きでこの1行を
  置き換える（経路を変えて案内を変えない状態にしない）。

## 6. References and Documents to Update

参照:

- [`journaling.md`](../journaling.md) §1・§2・§4、[`privacy.md`](../privacy.md) §2・§5、
  [`architecture.md`](../architecture.md)「音声・文字起こしの経路と保持」「生成の実行方式」「データ所在地と費用」
- [TASK-002 Plan](2026-09-28-task-002-data-lifecycle.md) §22（録音前に知らせる内容、失敗後に残るデータ）
- [TASK-007 Plan](2026-10-05-task-007-frontend-identity.md)（`identityEpoch`、`RequireAuth startsOnEnter`、戻り先）
- [`contracts/openapi.yaml`](../../contracts/openapi.yaml)の`createRecordingAttempt`・`createDot`・`RecordingAttempt`・`DotUpload`
- [`development/frontend.md`](../development/frontend.md) §2・§3、[`design-system.md`](../design-system.md)
- レビュー: [`code-review/frontend/README.md`](../code-review/frontend/README.md)・`security.md`

同じ変更で更新する現行文書:

- `journaling.md` §1の表（録音開始・録音停止）と§2の「録音Blob」の現在の列、§4「録音前認証と期限切れ」の
  TASK-010の記述。
- `architecture.md`「実装済み」の録音処理の項。
- privacy.md §5は変えない（新しい保持先を作らない。Blobはmemoryだけ）。

## 7. Proposed Approach

### 7-1. 録音前の案内

`/record`を開くと、最初に案内を出す（`features/recording/components/recording-guide`）。マイクは要求しない。
「録音を始める」を押したときにだけマイクを要求する（利用者の操作に結び付ける。frontend.md §3）。毎回出す
（「読んだ」を端末に残すと、localStorageへ新しいkeyを作ることになるため。journaling.md §2）。

文面（TASK-002 Plan §22の項目との対応）:

| 項目 | 文面 |
| --- | --- |
| 1 送る先 | 録音した音声は、Focus on Dotのサーバーを経由して、文字起こし（Amazon Transcribe、東京リージョン）と、今日の一文と要約の生成（Amazon BedrockのClaude）へ渡ります。 |
| 所在地・保持（architecture） | 生成を行う国と、委託先での保持や人による確認の有無は、確認が済んでからここに記載します。 |
| 2 音声の預かり | 音声は、Dotを作るあいだだけお預かりします。うまくいかなかったときは、受け付けから24時間はやり直せます。Dotができた時点、または期限を過ぎたあとに削除処理を始めます。 |
| 3（言い換え） | 文字起こしの全文も、この端末が受け取るまでお預かりします。受け取った時点、または受け付けから24時間を過ぎたあとに削除処理を始めます。全文はこのタブを閉じるまで、この端末で読めます。残るのは「今日の一文」と「話した内容の要約」です。 |
| 2・6 遅れと外部 | 障害が起きたときは、削除が遅れることがあります。外部へ渡った内容を、すぐに消せるとは約束できません。 |
| 4 Dot | Dotはあなただけが見られます。1件ずつ削除でき、退会するとすべてが削除の対象になります。 |
| 5 他人の情報 | 他の人の実名や住所・連絡先は、必要がなければ言い換えて話せます（例:「同僚のAさん」）。 |
| 制限 | 1回の録音は30分までです。 |
| 7 | 置換を行わないため該当しない（タスクの完了条件3）。 |

- 「保存しません」「◯時間で消えます」は書かない。約束するのは「やり直せる期限」と「いつ削除処理を始めるか」まで
  （privacy.md §5-2）。
- 「東京リージョン」はTranscribeの呼び出し先として採用済みの構成（architecture.md「生成の実行方式」）で、委託先の
  保持や閲覧の事実ではない。保持（opt-outの適用を含む）と人によるレビューは、所在地・保持の行に含めて未確定とする。
- 期間と契機の正本はprivacy.md §5。文面は§5-1の主な契機だけを書き、全部の契機（Dotの完全削除・退会・処理の取り消し）
  は書き写さない（読み手に必要なのは「いつ始まるか」の主な場合で、残りは削除の画面（TASK-014）で示す）。

### 7-2. マイクを開く・録音を始める（`libs/audio/recorder.ts`）

- `open()`: 対応を確かめ、getUserMediaでマイクを開き、AudioContextとAnalyserを作る。結果は
  `ok` / `denied` / `unsupported` / `no_device` / `unavailable` / `cancelled`。
  - `unsupported`: `navigator.mediaDevices.getUserMedia`・`MediaRecorder`が無い（非対応ブラウザ・安全でない接続）、
    または`audio/webm;codecs=opus`と`audio/mp4`のどちらも録れない（契約が受ける形式。`MediaRecorder.isTypeSupported`）。
  - `denied`: `NotAllowedError`・`SecurityError`。`no_device`: `NotFoundError`・`OverconstrainedError`。
    `unavailable`: それ以外（`NotReadableError`＝他のアプリが使用中、など）。
  - `cancelled`: 許可を待っている間に止めた・片付けた（既存の保護。streamを止めて録音を始めない）。
- `record()`: `MediaRecorder`を選んだ形式・64kbpsで始め、録音時間の起点を置く。**attemptの発行はこの2つの
  間に入る**（マイクの権限取得の後、発行が成功した直後に録音を始める。タスク本文の順序）。
- `stop()`: Blob・録音時間（秒）・形式を返す。資源を解放する。
- マイクのtrackが`ended`になった（抜けた・OSが止めた・権限を取り消した）か、`MediaRecorder`が`error`を出したら、
  `onInterrupt`で知らせる。
- `silent` modeと合成の波形はやめる。録音していないのに録音しているように見せないため。
- 64kbpsにするのは、30分でも約15MBに収め、契約の32MBに余裕を持たせるため（Safariの`audio/mp4`は既定の
  bitrateが高く、30分で上限に近づき得る）。

### 7-3. 録音の結果を区別する（`features/recording`）

`recorded-audio.ts`（純粋な関数）が、停止の結果を次へ分ける。

| 結果 | 条件 | 画面 |
| --- | --- | --- |
| `recorded` | Blobがあり、1秒以上・30分以下・32,000,000 bytes以下 | 整理（`/processing`）へ進む |
| `empty` | Blobが無い・空、または1秒未満 | 「録音できた音声がありません」→ 録り直す |
| `too_large` | 32,000,000 bytesを超えた | 「録音が大きすぎて送れません」→ 録り直す |

- 32MBは契約の`DotUpload`の上限。backendの数え方（MiBかMBか）は未実装なので、小さい方（10進）で判定する。
- 録音時間は契約の`duration_seconds`（1〜1800の整数）に合わせて丸め、1800を超えない。
- 30分に達したら自動で止め、通常の停止と同じく整理へ進む（話した内容を失わせない）。
- `useRecorder`は段階（`idle` / `requesting` / `recording` / `stopping`）、失敗の種類、中断されたかを持つ。
  中断されたら自動で止め、結果を保持する。

### 7-4. 画面（`RecordingStage`）

段階ごとに出し分ける。

- 案内（§7-1）→「録音を始める」→ マイクの許可待ち（「マイクの許可を確認しています」）→ 録音中（既存の画面。
  「30分で自動的に終わります」を添える）→ 停止 → 結果に応じて整理へ、または下記。
- 失敗の画面（次の操作）:
  - `denied`: 「マイクの使用が許可されていません」。ブラウザの設定でこのサイトのマイクを許可してから「もう一度試す」。
    「Homeへ戻る」。
  - `unsupported`: 「このブラウザでは録音できません」。対応ブラウザ（§13）を示す。「Homeへ戻る」。
  - `no_device`: 「マイクが見つかりません」。接続してから「もう一度試す」。
  - `unavailable`: 「マイクを使えませんでした」。他のアプリが使っていないか確かめて「もう一度試す」。
- 中断: 「録音が途中で止まりました」。ここまでの録音が`recorded`なら「ここまでで整理する」「録り直す」、
  そうでなければ「録り直す」だけ。
- `empty`・`too_large`: 理由と「録り直す」。
- 「話し終える」の二重押下防止、利用者の世代が変わったらHomeへ戻して音声を残さないことは維持する。
- 録り直す・開始のたびに、Session Providerの前の音声を消す。

### 7-5. 受け渡し（Session Provider）

- `recordedDurationSec`・`setRecordedDuration`を、`recordedAudio`（`{ blob, mimeType, durationSec }`）・
  `setRecordedAudio`・`clearRecordedAudio`へ置き換える。録音時間は音声と一緒に渡す（別々に持つと食い違い得る）。
- 書いたときの`identityEpoch`と一緒に持ち、利用者の切り替わりで消す（既存の方式）。storageへは書かない。
- `/processing`は開いたときの`recordedAudio`を生成のmutationへ渡す（mockは使わない。TASK-011がuploadに使う）。
  無ければ生成を始めず、「受け渡せる録音がありません」と録音への導線を出す（直接開いた・再読み込みした場合）。
  生成が成功したら音声を消す。
- 音声Blobを捨てる者: 次の録音の開始、生成の成功、利用者の切り替わり（Session Provider）、再読み込み・タブを閉じる
  （memory）。生成が失敗したまま画面を離れた場合は、次のいずれかまでmemoryに残る（TASK-011で再試行と一緒に決める）。

### 7-6. 録音attemptの通信関数

- `libs/api-contract/schemas.ts`に`recordingAttemptSchema`（契約の`RecordingAttempt`と型を完全一致）。
- `features/recording/api.ts`の`createRecordingAttempt(request)`: `POST /api/v1/recording_attempts`を
  `useAuth().request`で送る（CSRF・`401`の扱いをAuth Providerに集める。frontend.md §2）。responseはmemoryに
  だけ置く前提で、storageへ書かない。
- 画面へは接続しない（§5の対象外）。

### 7-7. ログインの後の戻り先

`safeRedirect`の許可に`/record`を加える。開くと案内が出るだけでマイクは始まらないため、Googleから戻った直後でも
利用者の操作なしに録音は始まらない。`/processing`は引き続き戻り先にしない。

録音・整理の画面を包む`RequireAuth startsOnEnter`は、未認証のときに戻り先を付けずにログインへ移していた（戻り先に
できる画面が無かったため）。`SessionGuard`と同じく`safeRedirect`の結果を戻り先に付ける（このタブでlogoutした後は
付けない）。

## 8. Why This Approach

- 案内を`/record`の最初の段階にするのは、Homeのマイクの操作・履歴の「録音する」・ログインの後の戻り先のすべてが
  `/record`を通るため。別routeにすると、各入口が案内を飛ばせないことを別に保証する必要がある。
- `open`と`record`を分けるのは、タスクが求める順序（権限取得 → attempt発行 → 直後に録音開始）を、endpointが
  できたときに間へ1つ入れるだけで実現できるようにするため。発行の失敗では録音を始めない形にもなる。
- 音声と録音時間をSession Providerに置くのは、route（`/record` → `/processing`）をまたぐ短い途中状態だから
  （frontend.md §2）。serverの正本ではなく、storageへは書かない。
- silent modeをやめるのは、権限拒否を成功した録音として扱わないため（完了条件2）。体験を止めない目的は、
  次の操作の案内で満たす。

## 9. Data Flow

```text
User（Homeのマイク／「録音する」）
↓
/record: RecordingGuide（案内。マイクはまだ）
↓「録音を始める」
useRecorder.start → recorder.open（getUserMedia）── 拒否・非対応など → 失敗の画面（次の操作）
↓ ok
（将来: createRecordingAttempt → attemptをmemoryへ。失敗なら録音を始めない）
↓
recorder.record（MediaRecorder）── trackのended・error → 中断の画面
↓「話し終える」／30分
recorder.stop → Blob・録音時間 → recorded-audioで区別 ── empty・too_large → 録り直し
↓ recorded
Session Provider.recordedAudio（memory。identityEpochと一緒）
↓
/processing: useCreateDot.mutate(recordedAudio)（mockは使わない）→ 成功で音声を消す
```

source of truth: 音声Blobと録音時間は、送るまでSession Providerのmemoryだけ。

## 10. Files to Change

合計で約30ファイルになるため、2つのサブのPRに分ける。統合ブランチは`feat/task-010-recording-consent-integration`。

PR 1/2 `feat/task-010-1-recorder-result`（録音の結果の区別と音声の受け渡し・attemptの通信関数）:

| ファイル | 新規/変更 | 役割 |
| --- | --- | --- |
| `docs/implementation-plans/2026-10-09-task-010-recording-consent.md` | 新規 | このPlan |
| `docs/tasks/TASK-010-frontend-recording.md` | 変更 | 状態とPlanへのリンク（数えない） |
| `apps/web/src/libs/audio/recorder.ts` | 変更 | open / record / stop、失敗の種類、形式、中断 |
| `apps/web/src/libs/audio/recorder.test.ts` | 変更 | 上記のtest |
| `apps/web/src/features/recording/recorded-audio.ts` | 新規 | 結果の区別と制限 |
| `apps/web/src/features/recording/recorded-audio.test.ts` | 新規 | 上記のtest |
| `apps/web/src/features/recording/hooks/use-recorder.ts` | 変更 | 段階・失敗・中断・30分の自動停止 |
| `apps/web/src/features/session/types.ts` | 変更 | `recordedAudio` |
| `apps/web/src/features/session/session-context.tsx` | 変更 | 同上 |
| `apps/web/src/features/session/session-context.test.tsx` | 変更 | 同上 |
| `apps/web/src/features/session/index.ts` | 変更 | 型のexport |
| `apps/web/src/features/recording/components/recording-stage/recording-stage.tsx` | 変更 | 失敗・中断・結果の画面、受け渡し |
| `apps/web/src/features/recording/components/recording-stage/recording-stage.test.tsx` | 変更 | 同上 |
| `apps/web/src/features/recording/components/recording-notice/recording-notice.tsx` | 新規 | 失敗・中断の理由と次の操作の表示 |
| `apps/web/src/features/recording/components/recording-notice/recording-notice.module.css` | 新規 | 同上（Tailwindの`@apply`） |
| `apps/web/src/libs/api-contract/schemas.ts` | 変更 | `recordingAttemptSchema` |
| `apps/web/src/libs/api-contract/schemas.test.ts` | 変更 | 契約のexampleで検証 |
| `apps/web/src/features/recording/api.ts` | 新規 | `createRecordingAttempt` |
| `apps/web/src/features/recording/api.test.tsx` | 新規 | 上記のtest |

数える: 18。失敗・中断の表示を別のComponentにしたのは、既存の`recording-stage.module.css`が`var(--fod-*)`を
直接書く未移行のCSSで、新しいUIはTailwindの`@apply`で書くため（design-system.md）。同じファイルに混ぜられない。

PR 2/2 `feat/task-010-2-recording-guide`（録音前の案内・受け渡せる音声がない場合・戻り先・現行文書）:

| ファイル | 新規/変更 | 役割 |
| --- | --- | --- |
| `apps/web/src/features/recording/components/recording-guide/recording-guide.tsx` | 新規 | 案内 |
| `apps/web/src/features/recording/components/recording-guide/recording-guide.module.css` | 新規 | 同上 |
| `apps/web/src/features/recording/components/recording-stage/recording-stage.tsx` | 変更 | 案内の段階、開始を押したときに始める |
| `apps/web/src/features/recording/components/recording-stage/recording-stage.test.tsx` | 変更 | 同上 |
| `apps/web/src/features/processing/components/processing-indicator/processing-indicator.tsx` | 変更 | 音声が無い場合、mutationへ渡す、成功で消す |
| `apps/web/src/features/processing/components/processing-indicator/processing-indicator.test.tsx` | 変更 | 同上 |
| `apps/web/src/features/processing/hooks/use-create-dot.ts` | 変更 | 入力（録音）を受け取る。mockは使わない |
| `apps/web/src/features/auth/redirect.ts` | 変更 | `/record`を戻り先へ |
| `apps/web/src/features/auth/components/require-auth.tsx` | 変更 | 録音・整理の画面のguardでも戻り先を付ける |
| `apps/web/src/features/auth/messages.test.ts` | 変更 | 同上 |
| `apps/web/src/features/auth/components/auth-screens.test.tsx` | 変更 | 同上 |
| `docs/journaling.md` | 変更 | 現行挙動 |
| `docs/architecture.md` | 変更 | 実装済み |
| Plan・タスクファイル | 変更 | 完了の記録 |

数える: 15。`create-dot.ts`は変えない（mutationの入力の型だけを録音にし、mockは受け取らない）。

## 11. Libraries / APIs

- MediaDevices.getUserMedia: マイクを開く。失敗の`DOMException.name`で種類を分ける。
- MediaRecorder（`isTypeSupported`・`mimeType`・`audioBitsPerSecond`・`error`）: 契約が受ける形式で録る。
- MediaStreamTrackの`ended`: マイクが途中で切れたことを知る。
- AudioContext / AnalyserNode: 波形（既存）。
- 新しいdependencyは追加しない。

## 12. Alternatives Considered

- 案内を別route（`/record/guide`）にする: 入口ごとに案内を飛ばせないことを保証する必要が増えるため採らない。
- 案内を初回だけ出す: 「読んだ」を端末に残すとlocalStorageへ新しいkeyを作ることになり、共有端末で別の利用者に
  案内が出ない。毎回出す。
- silent modeを残し、画面で「録音していません」と出す: 波形が動いて録音しているように見え、成功と取り違え得る。採らない。
- attemptの発行を今すぐ録音開始へ組み込む: endpointが無いため録音が始められなくなる（404）。採らない（§5）。

## 13. Risks / Things to Watch

- 対応ブラウザ: getUserMediaとMediaRecorderがあり、`audio/webm;codecs=opus`か`audio/mp4`を録れるもの。
  具体的には最新のChrome・Edge・Firefox（webm/opus）、Safari 14.3以降（macOS・iOS・iPadOS。mp4）。安全な接続
  （HTTPSかlocalhost）でだけ動く。それ以外は`unsupported`。
- iOS Safariは、画面が背景へ回るとマイクのtrackを止めることがある。`ended`で中断として扱い、ここまでの音声を
  使えるようにする。
- 録音中に画面を離れた（route変更・unmount）ら、録音を止めて音声を捨てる（既存）。タブを閉じる・再読み込みでは
  memoryごと消える。タブが背景にあるだけなら録音を続ける。
- `MediaRecorder.stop`の後に`dataavailable`が来る前に`onstop`が来ることは仕様上ない（最後のdataの後にstop）。
- 二重停止・StrictModeの二重実行・許可待ちの間の離脱で、streamとAudioContextを解放し続けること（既存testを維持）。
- 音声が無いのに整理へ進まないこと、前の利用者の音声が次の利用者の整理に使われないこと。

## 14. Verification

### Manual

- 対応ブラウザで: 初回の許可、拒否、拒否の後に設定で許可して「もう一度試す」、マイクが無い、他のアプリが使用中、
  録音中にマイクを抜く、停止、1秒未満で停止、画面を離れる、30分の自動停止。
- 案内の文面が§7-1と一致し、マイクの許可を求めるのは「録音を始める」の後だけであること。
- ログインから`/record`へ戻ったときに案内が出て、マイクが始まらないこと。
- DevToolsのApplicationで、localStorage・sessionStorage・IndexedDBに音声・文字起こしが無いこと。

### Automated

- unit: `recorder`（open・record・stop・失敗の種類・形式・中断・許可待ちの離脱）、`recorded-audio`（区別と制限）、
  schema（契約のexample）、`createRecordingAttempt`。
- component: `RecordingStage`（案内 → 開始、失敗ごとの画面と次の操作、中断、二重停止、利用者の切り替わり、
  StrictMode）、`ProcessingIndicator`（音声が無い場合、渡す、成功で消す）、Session Provider、戻り先。

## 15. Definition of Done

- §5の対象を実装し、testが通る。
- 録音attemptの組み込み・実backendでの受け渡し・遅れの実機計測と、所在地・保持の案内の確定は、残る完了条件として
  タスクに記録し、タスクはIn progressのままにする。

## 16. Completion Record

- 状態: 2026-10-09、実施中（タスクはIn progressのまま）。
- 実装差異:
  - 失敗・中断の表示を`recording-notice`へ分けた。既存の`recording-stage.module.css`は`var(--fod-*)`を直接書く
    未移行のCSSで、新しいUIのTailwindの`@apply`と同じファイルに混ぜられないため（§10）。
  - `create-dot.ts`は変えず、`useCreateDot`のmutationの入力の型だけを録音にした（mockは録音を受け取らない）。
  - self-reviewで、中断の案内を見ている間に利用者が切り替わると、「ここまでで整理する」で前の利用者の録音が
    新しい利用者の整理へ渡り得ることを見つけた。押した時点でも利用者の世代を確かめ、変わっていればHomeへ戻すよう直した。
  - `RequireAuth startsOnEnter`も、未認証のときにログインの戻り先を付けるようにした。録音画面から来た利用者を
    録音前の案内へ戻すには、`safeRedirect`の許可だけでは足りなかった（このguardは戻り先を付けていなかった）（§7-7）。
- 検証結果:
  - `pnpm lint`（ESLint・命名・Markdown・契約のlintと生成した型の一致）、`pnpm type-check`、`pnpm test`
    （scriptsのtestと、webの19ファイル・437件）、`pnpm build`がすべて通った。
  - 自動のtestで確かめたこと: 権限拒否・非対応・マイクが無い・使用中のそれぞれで録音を始めず次の操作を示すこと、
    録音中にマイクが切れたときの「ここまでで整理する／録り直す」、1秒未満と32,000,000 bytes超えで進まないこと、
    30分の自動停止、二重停止で止めるのも進むのも1回だけなこと、止めた・片付けた・画面を離れたときのtrackの停止と
    AudioContextを閉じること、許可を待っている間に止めたら許可の後に録音を始めないこと、利用者の切り替わりで録音を
    残さないこと、録音と案内の操作でlocalStorage・sessionStorageに何も書かないこと、案内に送る先・やり直しの期限・
    削除処理を始める契機・言い換え・長さの上限を示し、「保存しません」「◯時間で消えます」や未確認の委託先の事実を
    書かないこと、マイクの要求が「録音を始める」の後だけなこと、`/processing`を録音なしで開いたら整理を始めないこと、
    ログインの戻り先（`/record`は案内へ戻し、`/processing`は戻さない）、録音attemptのschemaが契約のexampleと
    一致し、通信関数がCSRF tokenを付けて送ること。
  - 未実施と理由:
    - 対応ブラウザ（Chrome・Edge・Firefox・Safari、iOS Safari）での初回許可・拒否・非対応・停止・中断・画面離脱の
      手動確認。実際のマイクと権限のダイアログを、この環境から操作できないため。人間の確認に残す（PRの「確認すること」）。
    - 録音attemptの発行を録音の手順へ組み込むこと、古いattemptの破棄、発行から録音開始までの遅れの実機計測、
      決定した音声入力をbackendへ受け渡すこと。`POST /api/v1/recording_attempts`と`POST /api/v1/dots`が未実装のため
      （タスク本文）。
    - 案内のうち、生成を行う国と委託先での保持・人によるレビューの有無。TASK-009の構成の記録とTASK-025の確認を待つ。
      説明と実際の処理の一致も、実サービスへ送るまで確かめられない。
- 関連: メインのPR #92。残りはTASK-009（backendの受け口と構成の記録）・TASK-025（委託先の確認）の後に、TASK-010の
  続きとして行う。
