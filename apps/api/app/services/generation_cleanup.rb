# 外部資源の後片付け（TASK-003 Plan §20「状態遷移: Dotの保存とcleanupを分ける」「孤児の回収」、§27）。
# 冪等で、失敗しても状態を保ったまま、新しい実行権を取り直して何度でも再実行できる（自己遷移T17・T20）。
#
# - succeeded_cleanup_pending: 音声を消す。全文を返さない印（ACK・期限）が付いていれば、文字起こし結果と
#   Transcribeのjobも消してから記録を消す（T18）。Dotは作り直さない。
# - cancel_requested → cleanup_pending（T19）: 取り消す前に動いていた実行の期限が切れるのを待ってから始める。
#   Transcribeのjobが非終端なら終端まで待ち、その処理の全部を消してから
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
    # 取り消す前に動いていた実行の期限が残っていれば、その実行が終わるのを待つ（期限は取り消しの受理で残してある）
    return :waiting if generation.lease_expires_at&.>(now)

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
  rescue GenerationProviders::Error, TranscriptionGateway::NotTerminal => e
    retry_later(generation, token, now, e)
  end

  def clean_succeeded(generation, now)
    token = Generation.acquire_lease(generation.id, state: Generation::SUCCEEDED_CLEANUP_PENDING,
                                                    duration: LEASE_DURATION, now:)
    return :skipped unless token

    delete_audio(generation)
    return release(generation, token, :audio_cleaned) unless generation.transcript_withheld_at

    delete_transcript(generation)
    finish(generation, Generation::SUCCEEDED_CLEANUP_PENDING, token)
  rescue GenerationProviders::Error, TranscriptionGateway::NotTerminal => e
    retry_later(generation, token, now, e)
  end

  # 消し残しに気づけるよう、処理IDと例外の種類だけをログに残す（本文・外部のmessageは出さない）
  def retry_later(generation, token, now, error)
    Rails.logger.warn("generation cleanup deferred: generation_id=#{generation.id} error=#{error.class.name}")
    defer(generation, token, now + RETRY_AFTER, :retry)
  end

  # 実行権を持ったまま、まだ同じ状態にあるときだけ記録を消す。途中で削除・退会を受理していれば（T22）消さず、
  # cancel側の後片付けに任せる。
  def finish(generation, state, token)
    return :done if Generation.where(id: generation.id, state:, lease_token: token).delete_all == 1

    hand_over(generation)
    :superseded
  end

  # 実行中に削除・退会を受理された（T22）。この実行の外部の呼び出しは終わったので、残した期限を切り、
  # cancel側の後片付けがすぐ始められるようにする（成功後の記録で動いていたのは、この後片付けだけ）
  def hand_over(generation)
    Generation.where(id: generation.id, state: Generation::CANCEL_REQUESTED, lease_token: nil)
              .update_all(lease_expires_at: nil) # rubocop:disable Rails/SkipsModelValidations
  end

  def transcription_running?(generation)
    job_names(generation).any? { GenerationProviders.transcriber.status(it) == :in_progress }
  end

  # 消す対象は、命名規則から導いたものに、記録が持つkey・job名を足して決める（規則を変えても、過去の記録が
  # 指すものを取り残さない。TASK-003 Plan §20「処理の記録に持つ項目」）
  def delete_audio(generation)
    prefixes(generation, GenerationNaming.audio_prefix(generation.id), generation.audio_key)
      .each { GenerationProviders.storage.delete_prefix(it) }
  end

  def delete_transcript(generation)
    prefixes(generation, GenerationNaming.transcript_prefix(generation.id), generation.transcript_key)
      .each { GenerationProviders.storage.delete_prefix(it) }
    job_names(generation).each { GenerationProviders.transcriber.delete(it) }
  end

  # 記録のkeyから足すのは、この処理IDの下のディレクトリ（`<種類>/<処理ID>/`）だけ。記録の値が壊れていても、別の処理の
  # objectを消さない（TASK-003 Plan §20「そのDotを作った処理の分だけ」）。外れたkeyは消さずにログへ残す
  def prefixes(generation, derived, key)
    return [derived] unless key

    owned = "#{File.dirname(key)}/"
    return [derived, owned].uniq if owned.match?(%r{\A[a-z]+/#{Regexp.escape(generation.id)}/\z})

    Rails.logger.warn("generation cleanup skipped a foreign key: generation_id=#{generation.id}")
    [derived]
  end

  # これまでの文字起こしの試行のjobすべて（再試行で番号が進んでも、古いjobを取り残さない）と、記録が持つjob名
  def job_names(generation)
    derived = (1..generation.transcription_attempt).map { GenerationNaming.job_name(generation.id, it) }
    [*derived, generation.transcription_job_name].compact.uniq
  end

  def defer(generation, token, until_time, result)
    Generation.where(id: generation.id, lease_token: token).update_all(lease_expires_at: until_time) # rubocop:disable Rails/SkipsModelValidations
    result
  end

  def release(generation, token, result)
    Generation.release_lease(generation.id, token)
    result
  end
  private_class_method :start_canceled, :resume_canceled, :clean_all, :clean_succeeded, :finish, :hand_over,
                       :transcription_running?, :delete_audio, :delete_transcript, :prefixes, :job_names, :retry_later,
                       :defer, :release
end
