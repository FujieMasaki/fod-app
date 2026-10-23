# 失敗した生成の再試行（`POST /api/v1/generations/{id}/retry`。T14・T15）。録り直さず、serverが預かっている
# 全文（あれば生成から）または音声（文字起こしから）でやり直す。`started_at`は変えない。
# 入口の手続きを通し、activeと世代と期限を確かめる。attemptが使用済みであることは拒否の理由にしない。
module GenerationRetry
  # 録り直しが要る失敗（再試行できない）
  NOT_RETRYABLE = %w[upload_incomplete empty_recording].freeze
  PROBLEMS = { expired: :retry_expired, account_deletion_in_progress: :account_deletion_in_progress,
               generation_mismatch: :account_deletion_in_progress, not_retryable: :retry_not_allowed,
               state: :retry_not_allowed, not_found: :not_found }.freeze

  module_function

  # 結果はSymbol: :accepted / :not_found / :retry_expired / :retry_not_allowed / :account_deletion_in_progress
  def call(user:, generation_id:, now: Time.current)
    return :account_deletion_in_progress if user.deletion_requested?

    dot = user.dots.find_by(generation_id:)
    return dot.trashed_at ? :not_found : :retry_not_allowed if dot

    generation = user.generations.find_by(id: generation_id)
    return :not_found unless generation && (!generation.canceled? || generation.cancel_reason == "expired")

    restart(generation, now)
  end

  def restart(generation, now)
    to = generation.transcript_ready_at ? Generation::GENERATING : Generation::TRANSCRIBING
    GenerationGate.enter(user_id: generation.user_id, generation_id: generation.id, from: Generation::FAILED, to:,
                         attrs: restart_attrs(to)) do |user, current|
      NOT_RETRYABLE.include?(current.failure_kind) ? :not_retryable : GenerationGate.proceed_denial(user, current, now)
    end
    enqueue(to, generation.id)
    :accepted
  rescue GenerationGate::Denied => e
    generation.reload.expired?(now) && e.reason == :state ? :retry_expired : PROBLEMS.fetch(e.reason)
  end

  def enqueue(to, generation_id)
    (to == Generation::GENERATING ? GenerationComposeJob : GenerationTranscribeJob).perform_later(generation_id)
  end

  def restart_attrs(to)
    lambda do |generation|
      attrs = { failure_kind: nil, lease_token: nil, lease_expires_at: nil }
      to == Generation::TRANSCRIBING ? attrs.merge(GenerationTranscription.next_attempt_attrs(generation)) : attrs
    end
  end
  private_class_method :restart, :enqueue, :restart_attrs
end
