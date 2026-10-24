# 文字起こしの開始と完了待ち（T6・T8・T9。TASK-003 Plan §19「止まったJobの検知」、§20「Transcribeのjobの回収」）。
#
# - 完了待ちはworkerのthreadを占有しない。1回見て、非終端なら一定時間後に自分をもう一度enqueueする。
#   待っている間は実行権の期限を次の確認まで延ばし、watchdogが生きている待ちを二重に拾わないようにする。
# - jobが見つからなければ（開始のresponseを失った・開始の前に落ちた）同じ名前で始め直す。名前は処理IDと
#   試行番号から決まるので、生きているjobを二重に開始しない（既にあれば合流する）。
# - 終端したら、Bedrockへ送る前に入口（利用者の行のlock・active・世代・期限）をもう一度通す。
module GenerationTranscription
  CHECK_INTERVAL = 15.seconds
  # 完了待ちで外部の失敗が続いたときに、待つのをやめて失敗にするまでの時間（文字起こしを始めてから。30分の音声でも
  # Transcribeはこの時間内に終わる見込み。初期値で、実測（H4）で見直す）
  GIVE_UP_AFTER = 1.hour

  module_function

  # 次の文字起こしの試行の名前（T6・T14で使う）
  def next_attempt_attrs(generation)
    attempt = generation.transcription_attempt + 1
    { transcription_attempt: attempt, transcript_key: GenerationNaming.transcript_key(generation.id, attempt),
      transcription_job_name: GenerationNaming.job_name(generation.id, attempt), transcript_ready_at: nil }
  end

  # 結果はSymbol: :started / :failed / :skipped
  def start(generation_id, now: Time.current)
    generation = Generation.find_by(id: generation_id)
    token = generation && claim(generation, now)
    return :skipped unless token

    begin_job(generation.reload, token, now)
  end

  # 結果はSymbol: :waiting / :generating / :failed / :canceled / :skipped
  def check(generation_id, now: Time.current)
    generation = Generation.find_by(id: generation_id, state: Generation::TRANSCRIBING)
    token = generation && Generation.acquire_lease(generation.id, state: Generation::TRANSCRIBING,
                                                                  duration: GenerationGate::LEASE_DURATION, now:)
    token ? react(generation, token, now) : :skipped
  end

  def react(generation, token, now)
    case GenerationProviders.transcriber.status(generation.transcription_job_name)
    when :in_progress then wait(generation, token, now)
    when :missing then begin_job(generation, token, now)
    when :failed then fail(generation, token, "transcription_failed")
    when :completed then finish(generation, token, now)
    end
  rescue GenerationProviders::Error => e
    Rails.logger.warn("generation transcription check failed: generation_id=#{generation.id} error=#{e.class.name}")
    give_up?(generation, e, now) ? fail(generation, token, "transcription_failed") : wait(generation, token, now)
  end

  # 設定の不足・呼び出し元の違い（NotReady）は待っても直らないので、すぐ失敗にする。それ以外は一時的な失敗として
  # 待ち直すが、文字起こしを始めてからGIVE_UP_AFTERを過ぎたら失敗にする（期限の24時間まで「処理中」に見せない）
  def give_up?(generation, error, now)
    error.is_a?(GenerationProviders::NotReady) || generation.last_progress_at <= now - GIVE_UP_AFTER
  end

  # accepted → transcribing（T6）で試行番号を進める。再試行（T14）で既にtranscribingなら実行権だけ取る
  def claim(generation, now)
    lease = { lease_token: SecureRandom.uuid, lease_expires_at: now + GenerationGate::LEASE_DURATION }
    case generation.state
    when Generation::ACCEPTED
      moved = Generation.transition(generation.id, from: Generation::ACCEPTED, to: Generation::TRANSCRIBING,
                                                   **next_attempt_attrs(generation), **lease)
      lease[:lease_token] if moved
    when Generation::TRANSCRIBING
      Generation.acquire_lease(generation.id, state: Generation::TRANSCRIBING, duration: GenerationGate::LEASE_DURATION,
                                              now:)
    end
  end

  # 始める直前に実行権を確かめ直す（取り消された処理の音声を新しく送らない）。取り消しは実行権の期限を残すので、
  # 後片付けは、この実行が始めたjobを記録から辿って終端まで待てる。
  def begin_job(generation, token, now)
    return :canceled unless holding?(generation, token)

    GenerationProviders.transcriber.start(job_name: generation.transcription_job_name, media_key: generation.audio_key,
                                          content_type: generation.audio_content_type,
                                          output_key: generation.transcript_key)
    wait(generation, token, now) == :waiting ? :started : :canceled
  rescue GenerationProviders::Error
    fail(generation, token, "transcription_failed")
  end

  def holding?(generation, token)
    Generation.exists?(id: generation.id, state: Generation::TRANSCRIBING, lease_token: token)
  end

  # 次の確認まで実行権を延ばす。取り消しで実行権を失っていれば積み直さない（後片付けが引き継ぐ）
  def wait(generation, token, now)
    extended = Generation.where(id: generation.id, lease_token: token)
                         .update_all(lease_expires_at: now + CHECK_INTERVAL) # rubocop:disable Rails/SkipsModelValidations
    return :canceled if extended.zero?

    GenerationTranscriptionCheckJob.set(wait: CHECK_INTERVAL).perform_later(generation.id)
    :waiting
  end

  # T8: 全文を読み、空でなければ入口を通して生成へ進む。空（無音・極端に短い）なら録り直しを案内する（T9）
  def finish(generation, token, now)
    text = TranscriptionGateway.text_from(GenerationProviders.storage.read(generation.transcript_key).to_s)
    return fail(generation, token, "transcription_failed") if text.nil?
    return fail(generation, token, "empty_recording", transcript_ready_at: now) if empty?(text)

    proceed(generation, token, now)
  end

  def empty?(text) = text.gsub(/[[:space:][:punct:]]/, "").empty?

  def proceed(generation, token, now)
    attrs = { transcript_ready_at: now, lease_token: nil, lease_expires_at: nil }
    GenerationGate.enter(user_id: generation.user_id, generation_id: generation.id, from: Generation::TRANSCRIBING,
                         to: Generation::GENERATING, attrs:) do |user, current|
      current.lease_token == token ? GenerationGate.proceed_denial(user, current, now) : :lease_lost
    end
    GenerationComposeJob.perform_later(generation.id)
    :generating
  rescue GenerationGate::Denied => e
    cancel_after_denial(generation, e.reason, now)
  end

  # 退会・期限を受理していれば、全文をBedrockへ送らず後片付けへ回す（T10）
  def cancel_after_denial(generation, reason, now)
    cancel_reason = { expired: "expired", account_deletion_in_progress: "withdrawn",
                      generation_mismatch: "withdrawn" }[reason]
    return :skipped unless cancel_reason

    GenerationCancellation.request(user_id: generation.user_id, generation_id: generation.id,
                                   reason: cancel_reason, now:)
    :canceled
  rescue GenerationGate::Denied
    :skipped
  end

  # T9
  def fail(generation, token, kind, **attrs)
    Generation.transition(generation.id, from: Generation::TRANSCRIBING, to: Generation::FAILED, holding: token,
                                         failure_kind: kind, lease_token: nil, lease_expires_at: nil, **attrs)
    :failed
  end
  private_class_method :react, :give_up?, :claim, :begin_job, :holding?, :empty?, :wait, :finish, :proceed,
                       :cancel_after_denial, :fail
end
