# Implementation Plan: 品質ゲートの状態を、/run-taskを始めたセッションに結び付ける

## 1. Status

完了（PR作成待ち）

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
- 更新: `.claude/skills/run-task/SKILL.md`（品質ゲートの対象が`--reset`したセッションであること）

## 7. Proposed Approach

1. `initialState(branch, sessionId)`で状態の初期値を1か所にまとめ、`sessionId`を持たせる。
2. `--reset`は`CLAUDE_CODE_SESSION_ID`があれば、そのidを持つ初期状態を書く（なければ従来どおり消す）。
   `--pause`も同じidを記録する。
3. `evaluateStop(deps, sessionId)`は、状態に記録されたidと入力の`session_id`が両方あって異なれば、
   検査も状態の更新もせずに終了を許す。
4. ブランチが変わって状態を初期化するときも、記録したidを引き継ぐ（PRを分けたタスクはブランチを移るため）。
5. idが記録されていない状態（`--reset`前や、idのない環境）は、従来どおりどのセッションも差し戻す。

## 8. Why This Approach

- `--reset`は`/run-task`の開始と再開で必ず実行するため、「誰のゲートか」を宣言する場所として自然。
- 判定はhookの入力とBashの環境変数だけで行え、追加のhookや設定が要らない。
- idがないときに従来どおり差し戻すため、判定できない場合に品質ゲートが緩むことはない。

## 9. Data Flow

```text
/run-task 開始 → Bash: claude-quality-gate.mjs --reset
  → CLAUDE_CODE_SESSION_ID を状態ファイルの sessionId に記録
Claude が止まろうとする → Stop hook（stdin の session_id）
  → 状態の sessionId と違う → 何もせず許可（状態は変えない）
  → 同じ / どちらかが無い → 従来の検査・差し戻し
```

## 10. Files to Change

- 変更: `scripts/claude-quality-gate.mjs`（セッションidの記録と判定）
- 変更: `scripts/claude-quality-gate.test.mjs`（別セッション・所有セッション・ブランチ移動・id無しのtest）
- 変更: `.claude/skills/run-task/SKILL.md`
- 新規: 本Plan

1つのPR。

## 11. Libraries / APIs

- Claude Code hookの入力`session_id`と、Bashの環境変数`CLAUDE_CODE_SESSION_ID`。

## 12. Alternatives Considered

- `/run-task`は必ず別のworktreeで動かす決まりにする: コード変更は要らないが、守られなかったときに同じことが起きる。
- 状態がないときに最初に止まったセッションを持ち主にする: `--reset`より先に別のセッションが止まると、
  そちらが持ち主になってしまう。

## 13. Risks / Things to Watch

- Claude Codeが`CLAUDE_CODE_SESSION_ID`を渡さなくなった場合は、従来の挙動（全セッションを差し戻す）に戻る。
- 持ち主のセッションを閉じた後、同じworktreeで新しいセッションが`/run-task`なしにタスクブランチで作業すると、
  品質ゲートがかからない。`/run-task`は開始時に`--reset`するため、自動実行には影響しない。

## 14. Verification

### Automated

- `node --test scripts/claude-quality-gate.test.mjs`: 16件成功（追加4件）。

### Manual

- 一時的な`feat/task-999-*`ブランチで`--reset`を実行し、状態に自分のセッションidが入ることを確認。
- 同じブランチで`{"session_id":"someone-else"}`をStop hookに渡し、exit 0で`blocks`が0のままであることを確認。

## 15. Definition of Done

- 別のセッションが差し戻されず、所有セッションは従来どおり差し戻される。
- lint / testが通る。
