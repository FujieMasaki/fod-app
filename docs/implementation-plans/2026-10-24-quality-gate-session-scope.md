# Implementation Plan: 品質ゲートの状態を、/run-taskを始めたセッションに結び付ける

## 1. Status

実施中（PR #109、レビュー中）

## 2. Goal

同じworktreeで別のClaude Codeセッションが動いていても、Stop hook（`scripts/claude-quality-gate.mjs`）が
`/run-task`を始めたセッションだけを差し戻すようにする。

## 3. Background

- 2026-10-24、仕様の解説動画を作るセッション（repositoryの外だけを変更）と、TASK-009を自動実行するセッションが
  同じworktree（`dev/app/focus-on-dot`）で動いた。TASK-009側がブランチを`feat/task-009-*`へ切り替えた後、
  動画のセッションが止まるたびに、自分が作っていない`apps/api/db/schema.rb`などのコミットを求められ、
  十数回続けて差し戻された。
- 原因: hookはブランチ名と`git status`だけで判断し、状態ファイル（git dir内の`claude-task-runner.json`）も
  worktreeとブランチの組にしか結び付いていない。止まろうとしているのがどのセッションかを見ていない。
- 影響は2つ。別のセッションが止まれない。差し戻した回数が`/run-task`側の`blocks`（上限40）に加算され、
  自動実行が予定より早く「上限に達したので人間へ」で止まり得る。

## 4. Current State

- `evaluateStop(deps)`: `<type>/task-*`ブランチなら、検査・未コミット・未push・PRの有無で差し戻す。
- `--reset`: 状態ファイルを消す。`--pause`: 今のブランチの状態に停止の印を付ける。
- Stop hookの入力（stdin）には`session_id`がある。BashにはClaude Codeが`CLAUDE_CODE_SESSION_ID`を渡し、
  同じ値になる（2026-10-24にtranscriptのファイル名と一致することを確認）。

## 5. Scope and Non-goals

- 対象: 状態にセッションidを記録し、記録と異なるセッションの終了を差し戻さない。
- 対象外: 同じworktreeで複数の`/run-task`を同時に動かすこと（定期実行はタスクごとにworktreeを分けている）。
  セッションidを渡さない古い起動方法での区別。

## 6. References and Documents to Update

- 参照: [自律実行の仕組み](2026-09-26-autonomous-task-runner.md) Step 3・Step 6（当時の記録として更新しない）
- 更新: `.claude/skills/run-task/SKILL.md`（品質ゲートの対象が`--reset`したセッションであること、
  人間の指摘への対応の前にも`--reset`すること）
- 更新: `docs/development/pull-requests.md`「人間がレビューする時機」の4（指摘への対応の前に`--reset`する。
  この手順の正本）
- 更新: `.claude/skills/pr-review-cycle/SKILL.md`（`/run-task`の外から始めるときと、人間の指摘への対応の前に
  `--reset`する）

## 7. Proposed Approach

1. `initialState(branch, sessionId, ownedAt)`で状態の初期値を1か所にまとめ、持ち主の`sessionId`と、
   持ち主になった時刻`ownedAt`を持たせる。
2. `--reset`は`CLAUDE_CODE_SESSION_ID`があれば、そのidを持ち主とする初期状態を書き（なければ従来どおり消す）、
   記録したidを出力する（transcriptで追えるように）。`--pause`は持ち主を変えない（変えるのは`--reset`だけ）。
   どちらもtestできるよう`resetState`・`pauseState`として切り出す。
3. `evaluateStop(deps, sessionId, now)`は、状態に記録されたidと入力の`session_id`が両方あって異なり、
   持ち主になってから24時間（`OWNER_TTL_MS`）以内なら、検査も状態の更新もせずに終了を許す。そのとき、
   持ち主のidと時刻を画面に出す（`--reset`を忘れて外れたセッションが気付けるように）。`ownedAt`が読めない、
   または未来の時刻なら、期限切れとして扱う（壊れた記録で24時間より長く外れ続けないように）。
4. ブランチが変わって状態を初期化するときも、記録したidを引き継ぐ（PRを分けたタスクはブランチを移るため）。
5. idが記録されていない状態（`--reset`前や、idのない環境）、入力に`session_id`がない場合、持ち主が24時間を
   過ぎた場合は、従来どおりどのセッションも差し戻す。

## 8. Why This Approach

- `--reset`は`/run-task`の開始と再開で必ず実行するため、「誰のゲートか」を宣言する場所として自然。
- 判定はhookの入力とBashの環境変数だけで行え、追加のhookや設定が要らない。
- idがないときは従来どおり差し戻すため、idが分からないことで品質ゲートが緩むことはない（idが両方あって
  異なる場合は、次のとおり外れる）。
- 記録がある間（24時間）は、記録と異なるセッションを品質ゲートの対象から外す。これは意図した挙動で、
  `/run-task`以外のセッションも含む。持ち主が終わった後に残った記録で、後から始めたセッションがいつまでも
  外れ続けないよう、期限を設ける。`/run-task`は1日のうちに終わる前提で、定期実行も毎朝1回起動する。
- PRができた時点で持ち主を外す案は採らない。PRを分けたタスクは、1つ目のPRを作った後に次のブランチへ移るため、
  そこで別のセッションが再び差し戻されてしまう。

## 9. Data Flow

```text
/run-task 開始 → Bash: claude-quality-gate.mjs --reset
  → CLAUDE_CODE_SESSION_ID を状態ファイルの sessionId に記録
Claude が止まろうとする → Stop hook（stdin の session_id）
  → 状態の sessionId と違い、ownedAt から24時間以内 → 何もせず許可（状態は変えない）
  → 同じ / どちらかが無い / 24時間を過ぎた → 従来の検査・差し戻し
```

## 10. Files to Change

- 変更: `scripts/claude-quality-gate.mjs`（セッションidの記録と判定）
- 変更: `scripts/claude-quality-gate.test.mjs`（別セッション・所有セッション・ブランチ移動・id無し・期限切れ・
  壊れた`ownedAt`・`--reset`・`--pause`のtest）
- 変更: `.claude/skills/run-task/SKILL.md`
- 変更: `.claude/skills/pr-review-cycle/SKILL.md`
- 変更: `docs/development/pull-requests.md`
- 変更: `README.md`（hookの表のStopの対象）
- 新規: 本Plan

1つのPR。

## 11. Libraries / APIs

- Claude Code hookの入力`session_id`と、Bashの環境変数`CLAUDE_CODE_SESSION_ID`。

## 12. Alternatives Considered

- `/run-task`は必ず別のworktreeで動かす決まりにする: コード変更は要らないが、守られなかったときに同じことが起きる。
- 持ち主のセッションが終わったら、SessionEnd hookで記録を外す: 外れる時間を短くできるが、異常終了では
  呼ばれないため24時間の期限は残り、hookが1つ増える。今回の問題（別のセッションが差し戻される）は期限だけで
  解消するため、採らない。
- 状態がないときに最初に止まったセッションを持ち主にする: `--reset`より先に別のセッションが止まると、
  そちらが持ち主になってしまう。

## 13. Risks / Things to Watch

- Claude Codeが`CLAUDE_CODE_SESSION_ID`を渡さなくなった場合は、従来の挙動（全セッションを差し戻す）に戻る。
  逆に、値はあるがStop hookの`session_id`と一致しなくなった場合（仕様の変更など）は、`/run-task`自身が別の
  セッションと判定され、24時間ゲートから外れる。一致は2026-10-24に1回確かめただけである。定期実行では
  `systemMessage`を見る人がいないため、PRなしで止まっても気付きにくい（pre-pushとCIの検査は効く）。
- 持ち主が記録されてから24時間は、同じworktreeで`--reset`せずにタスクブランチで作業するセッション
  （人間が`pr-review-cycle`を回すセッションを含む）に品質ゲートがかからない。`/run-task`の開始・再開、
  `/run-task`の外から始める`pr-review-cycle`、人間の指摘への対応（正本は`pull-requests.md`の「人間がレビューする
  時機」の4）では`--reset`する手順にした（PR #109のレビューで足した）。手順を飛ばしたときは穴が残るが、
  外れたことは画面のメッセージで分かり、CIとpre-pushは効く。
- `--pause`は持ち主を確かめない。持ち主でないセッションが`--pause`すると、持ち主の状態にも停止の印が付く。
  `--pause`は`/run-task`が止まるときにだけ使う手順で、別のセッションが実行する場面はないため、防がない。
- `/clear`や再開（`--resume`・`--continue`）でセッションidが変わる場合、`--reset`するまで差し戻されない
  （idが変わるかは未確認）。止まった後の再開で`--reset`する手順は、skillの「止まるときは」「修正上限に
  達したとき」に既にある。

## 14. Verification

### Automated

- `node --test scripts/claude-quality-gate.test.mjs`: 21件成功（追加9件）。

### Manual

- 一時的な`feat/task-999-*`ブランチで`--reset`を実行し、状態に自分のセッションidが入ることを確認。
- 同じブランチで`{"session_id":"someone-else"}`をStop hookに渡し、exit 0で`blocks`が0のままであることを確認。

## 15. Definition of Done

- 持ち主の記録から24時間以内は別のセッションが差し戻されず、持ち主のセッションは従来どおり差し戻される。
- lint / testが通る。
