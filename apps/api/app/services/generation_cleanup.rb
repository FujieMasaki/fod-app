# 外部資源の後片付け（TASK-003 Plan §20「状態遷移: Dotの保存とcleanupを分ける」「孤児の回収」、§27）。
# 冪等で、失敗しても状態を保ったまま、新しい実行権を取り直して何度でも再実行できる（自己遷移T17・T20）。
#
# - succeeded_cleanup_pending: 音声を消す。全文を返さない印（ACK・期限）が付いていれば、文字起こし結果と
#   Transcribeのjobも消してから記録を消す（T18）。Dotは作り直さない。
# - cancel_requested → cleanup_pending（T19）: Transcribeのjobが非終端なら終端まで待ち、その処理の全部を消してから
#   記録を消す（T21）。
# - 消すときは現在有効なkeyではなくprefixを列挙して消す（古い試行のPUTが後から完成したobjectも拾う）。
#   既に無いものは成功として扱う。
#
# 後で再実行が要るときは実行権の期限を短くして手放し、GenerationMaintenanceJobが拾い直す。
module GenerationCleanup
  LEASE_DURATION = 5.minutes
  # Transcribeのjobが終端になるのを待つ間隔・失敗した後に再実行するまでの間隔
  WAIT_FOR_TRANSCRIPTION = 30.seconds
  RETRY_AFTER = 1.minute

  module_function

  # 結果はSymbol: :done（記録を消した） / :audio_cleaned（ACK待ち） / :waiting / :retry / :superseded / :skipped
  def perform(generation_id, now: Time.current)
    generation = Generation.find_by(id: generation_id)
    return :skipped unless generation

    case generation.state
    when Generation::CANCEL_REQUESTED then start_canceled(generation, now)
    when Generation::CLEANUP_PENDING then resume_canceled(generation, now)
    when Generation::SUCCEEDED_CLEANUP_PENDING then clean_succeeded(generation, now)
    else :skipped
    end
  end

  def start_canceled(generation, now)
    token = SecureRandom.uuid
    moved = Generation.transition(generation.id, from: Generation::CANCEL_REQUESTED, to: Generation::CLEANUP_PENDING,
                                                 lease_token: token, lease_expires_at: now + LEASE_DURATION)
    moved ? clean_all(generation.reload, token, now) : :skipped
  end

  def resume_canceled(generation, now)
    token = Generation.acquire_lease(generation.id, state: Generation::CLEANUP_PENDING, duration: LEASE_DURATION, now:)
    token ? clean_all(generation, token, now) : :skipped
  end

  def clean_all(generation, token, now)
    return defer(generation, token, now + WAIT_FOR_TRANSCRIPTION, :waiting) if transcription_running?(generation)

    delete_audio(generation)
    delete_transcript(generation)
    finish(generation, Generation::CLEANUP_PENDING, token)
  rescue GenerationProviders::Error, TranscriptionGateway::NotTerminal
    defer(generation, token, now + RETRY_AFTER, :retry)
  end

  def clean_succeeded(generation, now)
    token = Generation.acquire_lease(generation.id, state: Generation::SUCCEEDED_CLEANUP_PENDING,
                                                    duration: LEASE_DURATION, now:)
    return :skipped unless token

    delete_audio(generation)
    return release(generation, token, :audio_cleaned) unless generation.transcript_withheld_at

    delete_transcript(generation)
    finish(generation, Generation::SUCCEEDED_CLEANUP_PENDING, token)
  rescue GenerationProviders::Error, TranscriptionGateway::NotTerminal
    defer(generation, token, now + RETRY_AFTER, :retry)
  end

  # 実行権を持ったまま、まだ同じ状態にあるときだけ記録を消す。途中で削除・退会を受理していれば（T22）消さず、
  # cancel側の後片付けに任せる。
  def finish(generation, state, token)
    deleted = Generation.where(id: generation.id, state:, lease_token: token).delete_all
    deleted == 1 ? :done : :superseded
  end

  def transcription_running?(generation)
    job_names(generation).any? { GenerationProviders.transcriber.status(it) == :in_progress }
  end

  def delete_audio(generation)
    GenerationProviders.storage.delete_prefix(GenerationNaming.audio_prefix(generation.id))
  end

  def delete_transcript(generation)
    GenerationProviders.storage.delete_prefix(GenerationNaming.transcript_prefix(generation.id))
    job_names(generation).each { GenerationProviders.transcriber.delete(it) }
  end

  # これまでの文字起こしの試行のjobすべて（再試行で番号が進んでも、古いjobを取り残さない）
  def job_names(generation)
    (1..generation.transcription_attempt).map { GenerationNaming.job_name(generation.id, it) }
  end

  def defer(generation, token, until_time, result)
    Generation.where(id: generation.id, lease_token: token).update_all(lease_expires_at: until_time) # rubocop:disable Rails/SkipsModelValidations
    result
  end

  def release(generation, token, result)
    Generation.release_lease(generation.id, token)
    result
  end
  private_class_method :start_canceled, :resume_canceled, :clean_all, :clean_succeeded, :finish,
                       :transcription_running?, :delete_audio, :delete_transcript, :job_names, :defer, :release
end
