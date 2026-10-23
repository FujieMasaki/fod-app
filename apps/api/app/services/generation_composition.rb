# 生成と保存（T11・T12。TASK-003 Plan §17、§20「状態遷移: Dotの保存とcleanupを分ける」）。
#
# - 自前のS3から全文を読み、Bedrockで`sentence`と`summary`を作り、検証してから保存する。
# - 保存は、利用者の行をlockして世代番号を確かめ、Dotのinsertと`succeeded_cleanup_pending`への更新を同じ
#   transactionで行う。ここで成功が確定する。取り消しで実行権を失っていれば保存しない。
# - 失敗は種類を分けて`failed`にする（外部AI・生成結果の検証・保存）。全文が残っていれば再試行は生成から行う。
# - 全文・promptの入出力をログや例外のmessageに入れない。
module GenerationComposition
  module_function

  # 結果はSymbol: :succeeded / :failed / :skipped
  def perform(generation_id, now: Time.current)
    generation = Generation.find_by(id: generation_id, state: Generation::GENERATING)
    token = generation && Generation.acquire_lease(generation.id, state: Generation::GENERATING,
                                                                  duration: GenerationGate::LEASE_DURATION, now:)
    return :skipped unless token

    compose(generation, token, now)
  end

  def compose(generation, token, now)
    text = TranscriptionGateway.text_from(GenerationProviders.storage.read(generation.transcript_key).to_s)
    # 全文が読めなければ、次の再試行は文字起こしから行う
    return fail(generation, token, "transcription_failed", transcript_ready_at: nil) if text.blank?

    output = GenerationProviders.composer.compose(transcript: text, date: Dot.date_for(generation.started_at),
                                                  duration_seconds: generation.duration_seconds)
    fields = validated(output)
    fields ? persist(generation, token, fields, now) : fail(generation, token, "invalid_output")
  rescue GenerationProviders::Error
    fail(generation, token, "generation_failed")
  end

  # 生成結果の検証（TASK-003 Plan §17）。空・上限超過・壊れた文字列は保存しない
  def validated(output)
    return unless output.is_a?(Hash)

    fields = { sentence: output["sentence"], summary: output["summary"] }
    fields if fields.values.all? { valid_text?(it) } &&
              fields[:sentence].length <= Dot::SENTENCE_MAX_LENGTH && fields[:summary].length <= Dot::SUMMARY_MAX_LENGTH
  end

  def valid_text?(value)
    value.is_a?(String) && value.valid_encoding? && value.exclude?("\u0000") && value.strip.present?
  end

  def persist(generation, token, fields, now)
    saved = ActiveRecord::Base.transaction do
      user = User.lock.find(generation.user_id)
      next false if user.deletion_requested? || user.generation != generation.user_generation

      insert_dot(user, generation, fields)
      raise ActiveRecord::Rollback unless succeed(generation, token, now)

      GenerationCleanupJob.perform_later(generation.id)
    end
    saved ? :succeeded : :skipped
  rescue ActiveRecord::RecordInvalid, ActiveRecord::StatementInvalid
    fail(generation, token, "persist_failed")
  end

  def insert_dot(user, generation, fields)
    user.dots.create!(generation_id: generation.id, started_at: generation.started_at,
                      duration_seconds: generation.duration_seconds, **fields)
  end

  # T11。後片付けの実行権は誰も持っていない（期限切れの印）にしておき、Jobが落ちても定期の拾い直しが拾う
  def succeed(generation, token, now)
    Generation.transition(generation.id, from: Generation::GENERATING, to: Generation::SUCCEEDED_CLEANUP_PENDING,
                                         holding: token, failure_kind: nil, lease_token: nil, lease_expires_at: now)
  end

  # T12
  def fail(generation, token, kind, **attrs)
    Generation.transition(generation.id, from: Generation::GENERATING, to: Generation::FAILED, holding: token,
                                         failure_kind: kind, lease_token: nil, lease_expires_at: nil, **attrs)
    :failed
  end
  private_class_method :compose, :valid_text?, :persist, :insert_dot, :succeed, :fail
end
