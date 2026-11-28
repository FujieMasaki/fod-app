# 生成へ進めず後片付けへ回す受理（T3・T5・T7・T10・T13・T16・T22 → cancel_requested）。以後この処理は生成へ進まず、
# 文字起こし全文も返さない（受理の時点から。物理削除の完了を待たない。TASK-003 Plan §27）。
# 実行中のJobが持っていた実行権のtokenは失効させ、その実行の書き込みを止める。ただし実行権の期限は残し、
# 後片付けはその期限が過ぎるまで待つ（実行中のJobが外部へ送り終える前に記録を消すと、外部に残ったものを
# 記録から辿れなくなるため。TASK-003 Plan §20「孤児の回収」）。後片付けはGenerationCleanupJobが行う。
#
# 契機ごとの遷移元:
# - canceled（処理の取り消し）・expired（期限到来）: Dotがまだ無い状態
# - withdrawn（退会）: 上に加えて、Dotを保存済みで後片付け待ちの記録（T22）
# - dot_purged（Dotの完全削除）: そのDotの後片付け待ちの記録だけ（T22）
module GenerationCancellation
  FROM = {
    "canceled" => Generation::CANCELABLE_STATES,
    "expired" => Generation::CANCELABLE_STATES,
    "withdrawn" => [*Generation::CANCELABLE_STATES, Generation::SUCCEEDED_CLEANUP_PENDING],
    "dot_purged" => [Generation::SUCCEEDED_CLEANUP_PENDING]
  }.freeze

  module_function

  # cleanupの認可はretryと違い、activeも期限内も求めない（退会・期限到来の後片付けを止めないため）。
  # blockを渡すと入口の認可に使う（利用者の行をlockした後に確かめたい条件）。
  def request(user_id:, generation_id:, reason:, now: Time.current, &)
    attrs = lambda do |generation|
      { cancel_reason: reason, transcript_withheld_at: generation.transcript_withheld_at || now, lease_token: nil,
        lease_expires_at: GenerationGate::KEEP }
    end
    entry = GenerationGate.enter(user_id:, generation_id:, from: FROM.fetch(reason),
                                 to: Generation::CANCEL_REQUESTED, attrs:, &)
    GenerationCleanupJob.perform_later(generation_id)
    entry.generation
  end

  # 利用者による処理の取り消し（`DELETE /api/v1/generations/{id}`。認可・対象・範囲はarchitecture「処理の取り消し」）。
  # 結果はSymbol: :accepted / :not_found / :generation_completed / :account_deletion_in_progress
  def cancel_by_user(user:, generation_id:, now: Time.current)
    return :account_deletion_in_progress if user.deletion_requested?

    saved = dot_outcome(user.id, generation_id)
    return saved if saved

    generation = user.generations.find_by(id: generation_id)
    # Dotを探した後に、保存から後片付けまで終えて記録が消えた場合もある。もう一度Dotを見て答える
    return dot_outcome(user.id, generation_id) || :not_found unless generation

    cancel_record(generation, now)
  end

  # 受理と使用済みattemptの記録を同じtransactionにする（受理だけが残ると、同じattemptで作り直せてしまう）
  def cancel_record(generation, now)
    ActiveRecord::Base.transaction do
      result = generation.canceled? ? relabel_expired(generation) : request_by_user(generation, now)
      # 消したものが同じattemptで作り直されないよう、attemptのidと期限を残す（privacy.md §5-1）
      ConsumedRecordingAttempt.record(generation.id, expires_at: generation.attempt_expires_at) if result == :accepted
      result
    end
  end

  # 退会の受理と並んだときに取り消しとして受け付けないよう、利用者の行をlockした後でも確かめる
  def request_by_user(generation, now)
    request(user_id: generation.user_id, generation_id: generation.id, reason: "canceled", now:) do |user, _|
      :account_deletion_in_progress if user.deletion_requested?
    end
    :accepted
  rescue GenerationGate::Denied => e
    withdrawing?(generation, e) ? :account_deletion_in_progress : answer_lost_race(generation)
  end

  # 退会の受理が先にこの記録を後片付けへ回していると、認可より先に状態の確認で拒否される
  def withdrawing?(generation, denial)
    denial.reason == :account_deletion_in_progress || User.find_by(id: generation.user_id)&.deletion_requested?
  end

  # 成功の確定（T11）や期限の到来が先に勝った場合。改めて状態を見て答える
  def answer_lost_race(generation)
    current = Generation.find_by(id: generation.id)
    saved = dot_outcome(generation.user_id, generation.id) unless current&.canceled?
    return saved if saved
    return :not_found unless current
    return :generation_completed if current.state == Generation::SUCCEEDED_CLEANUP_PENDING

    current.canceled? ? relabel_expired(current) : :not_found
  end

  # 本人のDotが保存済みなら完了、ゴミ箱の中なら示さない（404）。Dotが無ければnil
  def dot_outcome(user_id, generation_id)
    dot = Dot.find_by(user_id:, generation_id:)
    dot && (dot.trashed_at ? :not_found : :generation_completed)
  end

  # 期限到来で後片付けに入った記録は、状態を変えずに取り消しとして扱い直す（以後の照会を`expired`ではなく、
  # 取り消しを受理した処理として`404`にするため）
  def relabel_expired(generation)
    relabeled = Generation.where(id: generation.id, state: Generation::CANCELED_STATES, cancel_reason: "expired")
                          .update_all(cancel_reason: "canceled", updated_at: Time.current) # rubocop:disable Rails/SkipsModelValidations
    relabeled == 1 ? :accepted : :not_found
  end
  private_class_method :cancel_record, :request_by_user, :withdrawing?, :answer_lost_race, :dot_outcome,
                       :relabel_expired
end
